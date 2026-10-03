import { requireClerkAuth } from "./_clerkAuth.js";
import {
  EvidenceError, checked, evidenceFailure, evidenceJson,
  getEvidenceServiceClient, requireOwnedSession, resolveEvidenceIdentity,
} from "./_evidenceAccess.js";

const FLOWS = { ma: "MA", medsup: "MedSup", aca: "ACA", u65: "U65", ancillary: "Ancillary" };
const text = (value, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const number = (value, max = 2147483647) => value != null && Number.isFinite(Number(value))
  ? Math.max(0, Math.min(max, Math.round(Number(value)))) : null;

export function createSessionHandler({ authenticate = requireClerkAuth, getDb = getEvidenceServiceClient } = {}) {
  return async (request) => {
    if (!["GET", "POST"].includes(request.method)) return evidenceJson(405, { error: "Method not allowed" });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      let body;
      if (request.method === "POST") {
        try { body = await request.json(); } catch { throw new EvidenceError(400, "Invalid JSON body."); }
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new EvidenceError(400, "Invalid request.");
        if (body.agent_id || body.tenant_id || body.clerk_user_id || body.role) {
          throw new EvidenceError(400, "Agent membership is selected by the server.");
        }
        if (!["start", "end", "flag", "section"].includes(body.action)) throw new EvidenceError(400, "Invalid session action.");
        if (body.action === "start" && !Object.hasOwn(FLOWS, body.flow)) throw new EvidenceError(400, "Invalid session flow.");
      }
      const db = getDb();
      const identity = await resolveEvidenceIdentity(db, auth, { provision: body?.action === "start" });
      const { agent, tenant } = identity;
      if (request.method === "GET") {
        // Diagnostic checks run with a service key, never anonymously.
        if (new URL(request.url).searchParams.get("diagnostic") === "1") {
          for (const table of ["sessions", "compliance_flags", "section_scores"]) {
            checked(await db.from(table).select("id", { head: true }).limit(1));
          }
          return evidenceJson(200, { ready: true });
        }
        const sessions = checked(await db.from("sessions").select(`
          id, flow, started_at, ended_at, final_section, completed,
          duration_seconds, compliance_flags(count), section_scores(count)
        `).eq("agent_id", agent.id).eq("tenant_id", tenant.id)
          .order("started_at", { ascending: false }).limit(50));
        return evidenceJson(200, { sessions: sessions || [] });
      }
      if (body.action === "start") {
        const flow = text(body.flow, 20);
        if (!Object.hasOwn(FLOWS, flow)) throw new EvidenceError(400, "Invalid session flow.");
        const session = checked(await db.from("sessions").insert({
          agent_id: agent.id, tenant_id: tenant.id, flow, product_line: FLOWS[flow],
        }).select("id").single());
        return evidenceJson(200, { session_id: session.id, agent_id: agent.id, agent_name: agent.name });
      }
      if (!["end", "flag", "section"].includes(body.action)) throw new EvidenceError(400, "Invalid session action.");
      const session = await requireOwnedSession(db, body.session_id, identity);
      if (body.action === "end") {
        const finalSection = number(body.final_section, 32767);
        checked(await db.from("sessions").update({
          ended_at: new Date().toISOString(), final_section: finalSection,
          completed: body.completed === true, duration_seconds: number(body.duration_seconds),
        }).eq("id", session.id).eq("agent_id", agent.id).eq("tenant_id", tenant.id));
      } else if (body.action === "flag") {
        if (!["remind", "warn", "critical"].includes(body.level) || !text(body.section_label)) {
          throw new EvidenceError(400, "Invalid compliance flag.");
        }
        checked(await db.from("compliance_flags").insert({
          session_id: session.id, section_label: text(body.section_label), level: body.level,
          issue_tag: text(body.issue_tag, 200) || null, confidence: number(body.confidence, 100),
          message: text(body.message) || null, addressed: body.addressed === true,
        }));
      } else {
        if (!text(body.section_label)) throw new EvidenceError(400, "Section label is required.");
        // Match the inspected live schema; preserve the remaining section data.
        checked(await db.from("section_scores").insert({
          session_id: session.id, section_label: text(body.section_label),
          score: number(body.checklist_done, 32767), max_score: number(body.checklist_total, 32767),
          notes: JSON.stringify({ section_number: number(body.section_number),
            completed: body.completed === true, duration_seconds: number(body.duration_seconds) }),
        }));
      }
      return evidenceJson(200, { ok: true });
    } catch (error) { return evidenceFailure(error); }
  };
}

export default createSessionHandler();
