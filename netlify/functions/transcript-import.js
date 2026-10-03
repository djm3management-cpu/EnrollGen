import { requireClerkAuth } from "./_clerkAuth.js";
import { redactSensitiveText } from "./_redaction.js";
import { chunkTranscriptByWords, detectSpeaker, detectTopics, parseDurationToSeconds } from "../../src/lib/transcriptProcessing.js";
import {
  EvidenceError, canImportForOthers, checked, evidenceFailure, evidenceJson,
  getEvidenceServiceClient, resolveEvidenceIdentity, writeOwnedTranscript,
} from "./_evidenceAccess.js";

async function embedChunks(chunks) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new EvidenceError(503, "Transcript embedding service is not configured.");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: chunks }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new EvidenceError(503, "Transcript embeddings are unavailable. Please retry.");
  const data = await response.json();
  return (data.data || []).sort((a, b) => a.index - b.index).map(row => row.embedding);
}

const required = (value) => typeof value === "string" && value.trim();
const optional = (value, max = 300) => typeof value === "string" ? value.trim().slice(0, max) || null : null;

export function createTranscriptImportHandler({
  authenticate = requireClerkAuth, getDb = getEvidenceServiceClient, embed = embedChunks,
} = {}) {
  return async (request) => {
    if (!["GET", "POST"].includes(request.method)) return evidenceJson(405, { error: "Method not allowed" });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb();
      const identity = await resolveEvidenceIdentity(db, auth);
      const admin = canImportForOthers(auth, identity.tenant);
      if (request.method === "GET") {
        const agents = admin
          ? checked(await db.from("enrolled_agents").select("id, name")
            .eq("tenant_id", identity.tenant.id).eq("is_active", true).order("name"))
          : [{ id: identity.agent.id, name: identity.agent.name }];
        return evidenceJson(200, { agents, current_agent_id: identity.agent.id });
      }
      let form;
      try { form = await request.json(); } catch { throw new EvidenceError(400, "Invalid JSON body."); }
      if (!form || typeof form !== "object" || Array.isArray(form)) throw new EvidenceError(400, "Invalid transcript.");
      if (form.tenant_id || form.clerk_user_id || form.owner_agent_id || form.role) {
        throw new EvidenceError(400, "Transcript ownership is selected by the server.");
      }
      let owner = identity.agent;
      if (form.agentId && form.agentId !== owner.id) {
        if (!admin) throw new EvidenceError(403, "You may only import your own transcripts.");
        owner = checked(await db.from("enrolled_agents").select("id, name, tenant_id")
          .eq("id", form.agentId).eq("tenant_id", identity.tenant.id).eq("is_active", true).maybeSingle());
        if (!owner) throw new EvidenceError(403, "Import agent is unavailable in this tenant.");
      }
      // Names are presentation only. A different name never selects an identity.
      if (required(form.agentName) && form.agentName.trim() !== owner.name) {
        throw new EvidenceError(400, "Select an enrolled agent from the list.");
      }
      if (!required(form.transcriptText) || form.transcriptText.length > 120000
        || !required(form.carrier) || !/^\d{4}-\d{2}-\d{2}$/.test(form.callDate || "")
        || Number.isNaN(Date.parse(form.callDate))) {
        throw new EvidenceError(400, "Enter a valid date, carrier, and transcript (up to 120,000 characters).");
      }
      for (const [field, values] of Object.entries({
        direction: ["inbound", "outbound"], productLine: ["MA", "MedSup", "ACA", "Ancillary"],
        enrollmentPeriod: ["AEP", "OEP", "SEP", "IEP", "OE"],
        disposition: ["enrolled", "not_enrolled", "callback", "transferred", "dropped", "complaint"],
        sourceSystem: ["enrollhere", "conversely", "manual"],
      })) {
        if (!values.includes(form[field])) throw new EvidenceError(400, `Invalid ${field}.`);
      }
      const duration = parseDurationToSeconds(form.duration || "");
      if (form.duration && duration === null) throw new EvidenceError(400, "Duration must be MM:SS or minutes only.");
      const scrubbed = redactSensitiveText(form.transcriptText);
      const chunks = chunkTranscriptByWords(scrubbed);
      if (!chunks.length || chunks.length > 100 || chunks.some(chunk => chunk.length > 24000)) {
        throw new EvidenceError(400, "Split the transcript into sentences before importing.");
      }
      // Validate embeddings before creating any evidence rows.
      const embeddings = await embed(chunks);
      if (!Array.isArray(embeddings) || embeddings.length !== chunks.length
        || embeddings.some(vector => !Array.isArray(vector) || vector.length !== 1536
          || vector.some(value => !Number.isFinite(value)))) {
        throw new EvidenceError(503, "Transcript embedding response was invalid.");
      }
      const agency = identity.tenant.agency_display_name || identity.tenant.name;
      let legacy = checked(await db.from("agents").select("id")
        .eq("name", owner.name).eq("agency", agency).limit(1).maybeSingle());
      if (!legacy) legacy = checked(await db.from("agents").insert({
        name: owner.name, agency, is_active: true,
      }).select("id").single());
      // The session establishes ownership even when owner_agent_id does not
      // exist yet, so imports during the deploy-to-migration window remain readable.
      const flow = form.productLine === "MedSup" ? "medsup" : form.productLine.toLowerCase();
      const session = checked(await db.from("sessions").insert({
        agent_id: owner.id, tenant_id: identity.tenant.id, flow, product_line: form.productLine,
        started_at: form.callDate, ended_at: form.callDate, duration_seconds: duration,
        completed: form.disposition === "enrolled", status: "completed",
      }).select("id").single());
      const transcript = await writeOwnedTranscript(db, {
        tenant_id: identity.tenant.id, agent_id: legacy.id, session_id: session.id,
        call_date: form.callDate, duration_seconds: duration, direction: form.direction,
        product_line: form.productLine, carrier: optional(form.carrier), plan_name: optional(form.planName),
        enrollment_period: form.enrollmentPeriod, disposition: form.disposition,
        compliance_passed: form.compliancePassed === true, transcript_text: scrubbed,
        source_system: form.sourceSystem, source_id: optional(form.sourceId), phi_scrubbed: true,
      }, owner.id);
      const rows = chunks.map((chunk, index) => ({
        transcript_id: transcript.id, chunk_index: index, chunk_text: chunk,
        speaker: detectSpeaker(chunk), topics: detectTopics(chunk), embedding: embeddings[index],
      }));
      checked(await db.from("transcript_chunks").insert(rows));
      return evidenceJson(200, { transcriptId: transcript.id, chunksCreated: rows.length,
        topicsDetected: [...new Set(rows.flatMap(row => row.topics))] });
    } catch (error) { return evidenceFailure(error); }
  };
}

export default createTranscriptImportHandler();
