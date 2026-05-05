import { createClient } from "@supabase/supabase-js";
import { requireClerkAuth } from "./_clerkAuth.js";
import {
  checkSeatLimit,
  logUsageRecord,
  requireActiveSubscription,
  requirePlan,
} from "./_subscriptionGate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const LIVE_SOURCE_SYSTEM = "enrollgen_live";
const NGHS_TENANT_ID = "00000000-0000-4000-8000-000000000001";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookup(value) {
  return safeText(value).toLowerCase().replace(/\s+/g, " ");
}

function looksLikeIdentifier(value) {
  const raw = safeText(value);
  if (!raw) return false;
  if (/^\d+$/.test(raw)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(raw)) return true;
  return false;
}

function humanAgentText(value) {
  const raw = safeText(value);
  return raw && !looksLikeIdentifier(raw) ? raw : "";
}

function normalizeTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    ghl_webhook_url: row.ghl_webhook_url || "",
    ghl_location_id: row.ghl_location_id || "",
    coop_rates: row.coop_rates && typeof row.coop_rates === "object" ? row.coop_rates : {},
    carrier_options: Array.isArray(row.carrier_options) ? row.carrier_options : [],
    agency_display_name: row.agency_display_name || row.name || "",
  };
}

async function resolveTenant(supabase, orgId) {
  if (orgId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, ghl_webhook_url, ghl_location_id, coop_rates, carrier_options, agency_display_name")
      .eq("clerk_org_id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (data) return normalizeTenant(data);
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, ghl_webhook_url, ghl_location_id, coop_rates, carrier_options, agency_display_name")
    .eq("id", NGHS_TENANT_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Unable to resolve tenant for Clerk organization.");
  return normalizeTenant(data);
}

async function fetchTenantAgents(supabase, tenantId) {
  const { data, error } = await supabase
    .from("tenant_agents")
    .select("id, name, npn, clerk_user_id, ghl_user_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

function getAgentGhlUserId(agents, agentName) {
  const raw = normalizeLookup(agentName);
  if (!raw) return "";
  const exact = agents.find((agent) => normalizeLookup(agent.name) === raw);
  if (exact?.ghl_user_id) return exact.ghl_user_id;
  const loose = agents.find((agent) => {
    const name = normalizeLookup(agent.name);
    return name && (name.includes(raw) || raw.includes(name));
  });
  return loose?.ghl_user_id || "";
}

function normalizeProductType(value) {
  const raw = safeText(value);
  if (raw === "MedSup" || raw === "ACA" || raw === "U65" || raw === "Ancillary") return raw;
  return "MA";
}

function normalizeDirection(value) {
  return safeText(value).toLowerCase() === "outbound" ? "outbound" : "inbound";
}

function normalizeOutcome(value) {
  const raw = safeText(value);
  const allowed = new Set([
    "enrolled",
    "not_enrolled",
    "callback_scheduled",
    "transferred",
    "incomplete",
    "no_answer",
  ]);
  return allowed.has(raw) ? raw : "incomplete";
}

function dispositionFromOutcome(outcome) {
  if (outcome === "callback_scheduled") return "callback";
  return outcome || "pending";
}

function normalizeEnrollmentPeriod(value) {
  const raw = safeText(value).toUpperCase();
  if (["AEP", "OEP", "SEP", "IEP", "OE"].includes(raw)) return raw;
  return "AEP";
}

function scrubPhi(rawText) {
  return safeText(rawText)
    .replace(/\b\d[A-Z]\d{2}-?[A-Z]\d{2}-?[A-Z]{2}\d{2}\b/g, "[MBI_REDACTED]")
    .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[SSN_REDACTED]")
    .replace(/\b\d{3}[-.)]\s?\d{3}[-.)]\s?\d{4}\b/g, "[PHONE_REDACTED]")
    .replace(/(born|DOB|date of birth)[:\s]*([\d/-]+)/gi, "$1: [DOB_REDACTED]")
    .replace(/[\w.-]+@[\w.-]+\.\w{2,}/g, "[EMAIL_REDACTED]");
}

function normalizeDiarized(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      speaker: entry?.speaker === "customer" || entry?.speaker === "beneficiary" ? "customer" : "agent",
      text: safeText(entry?.text),
      start_ms: Number.isFinite(Number(entry?.start_ms)) ? Number(entry.start_ms) : 0,
      end_ms: Number.isFinite(Number(entry?.end_ms)) ? Number(entry.end_ms) : 0,
      confidence: Number.isFinite(Number(entry?.confidence)) ? Number(entry.confidence) : undefined,
    }))
    .filter((entry) => entry.text);
}

function mergeMetadata(current, patch) {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  return {
    ...base,
    ...patch,
  };
}

async function fetchTenantAgentForPayload(supabase, payload, auth, tenantId) {
  const writingAgent = humanAgentText(payload.writing_agent || payload.agent_name);

  if (auth.userId) {
    const { data } = await supabase
      .from("tenant_agents")
      .select("id, name, npn, clerk_user_id, ghl_user_id")
      .eq("tenant_id", tenantId)
      .eq("clerk_user_id", auth.userId)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data;
  }

  if (writingAgent) {
    const { data } = await supabase
      .from("tenant_agents")
      .select("id, name, npn, clerk_user_id, ghl_user_id")
      .eq("tenant_id", tenantId)
      .ilike("name", writingAgent)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

async function fetchEnrolledAgentForPayload(supabase, payload, auth, tenantId) {
  if (payload.agent_id) {
    let query = supabase
      .from("enrolled_agents")
      .select("id, name, npn, clerk_user_id")
      .eq("id", payload.agent_id);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  if (auth.userId) {
    let query = supabase
      .from("enrolled_agents")
      .select("id, name, npn, clerk_user_id")
      .eq("clerk_user_id", auth.userId);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  return null;
}

function resolveHumanAgentName(payload, tenantAgent, enrolledAgent) {
  return (
    humanAgentText(payload.writing_agent) ||
    humanAgentText(tenantAgent?.name) ||
    humanAgentText(enrolledAgent?.name) ||
    "Unknown Agent"
  );
}

async function fetchAgent(supabase, payload, auth, tenant) {
  const tenantId = tenant?.id;
  const tenantAgent = tenantId
    ? await fetchTenantAgentForPayload(supabase, payload, auth, tenantId)
    : null;

  const enrolledAgent = await fetchEnrolledAgentForPayload(supabase, payload, auth, tenantId);
  const agentName = resolveHumanAgentName(payload, tenantAgent, enrolledAgent);

  return {
    id: enrolledAgent?.id || payload.agent_id || tenantAgent?.id || null,
    name: agentName,
    npn: tenantAgent?.npn || enrolledAgent?.npn || null,
    clerk_user_id: tenantAgent?.clerk_user_id || enrolledAgent?.clerk_user_id || auth.userId,
  };
}

function resolveHumanAgentNameFromLoaded(payload, auth, tenantAgents, fallbackAgent) {
  const tenantAgent = auth.userId
    ? tenantAgents.find((agent) => agent.clerk_user_id === auth.userId)
    : null;
  return resolveHumanAgentName(payload, tenantAgent, fallbackAgent);
}

async function resolveTranscriptAgentId(supabase, agent, tenant) {
  try {
    const agency = tenant?.agency_display_name || tenant?.name || "Unknown";
    const { data: existing, error: fetchError } = await supabase
      .from("agents")
      .select("id, name")
      .ilike("name", agent.name || "Agent")
      .eq("agency", agency)
      .limit(1)
      .maybeSingle();

    if (fetchError?.code === "42P01") return null;
    if (existing) return existing.id;

    const { data: inserted, error: insertError } = await supabase
      .from("agents")
      .insert({
        name: agent.name || "Agent",
        agency,
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "42P01") return null;
      throw insertError;
    }

    return inserted?.id || null;
  } catch (error) {
    console.warn("[post-call] Could not resolve transcript agent:", error.message);
    return null;
  }
}

async function ensureCallRecord(supabase, payload, auth, tenant) {
  if (payload.call_record_id) {
    let query = supabase
      .from("call_records")
      .select("*")
      .eq("id", payload.call_record_id);
    if (tenant?.id) query = query.eq("tenant_id", tenant.id);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  if (payload.session_id) {
    let query = supabase
      .from("call_records")
      .select("*")
      .eq("session_id", payload.session_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (tenant?.id) query = query.eq("tenant_id", tenant.id);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  const agent = await fetchAgent(supabase, payload, auth, tenant);
  if (!agent.id) {
    throw new Error("Unable to resolve enrolled agent for call record");
  }

  const insertPayload = {
    tenant_id: tenant.id,
    external_call_id: payload.session_id || null,
    session_id: payload.session_id || null,
    agent_id: agent.id,
    agent_name: agent.name,
    agent_npn: agent.npn || null,
    call_direction: normalizeDirection(payload.call_direction),
    call_type: safeText(payload.call_type) || "enrollment",
    product_type: normalizeProductType(payload.product_type),
    carrier_name: safeText(payload.carrier_name) || null,
    plan_name: safeText(payload.plan_name) || null,
    plan_id: safeText(payload.plan_id) || null,
    call_start: payload.call_start || new Date().toISOString(),
    call_duration_seconds: Number.isFinite(Number(payload.call_duration_seconds))
      ? Number(payload.call_duration_seconds)
      : null,
    election_period: normalizeEnrollmentPeriod(payload.election_period || payload.enrollment_period),
    metadata: {
      created_from: LIVE_SOURCE_SYSTEM,
      source_session_id: payload.session_id || null,
    },
  };

  const { data: callRecord, error } = await supabase
    .from("call_records")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;

  if (payload.session_id) {
    await supabase
      .from("sessions")
      .update({
        call_record_id: callRecord.id,
      })
      .eq("id", payload.session_id)
      .eq("tenant_id", tenant.id);
  }

  return callRecord;
}

async function findTranscript(supabase, callRecord, payload, tenant) {
  if (payload.transcript_id || callRecord.transcript_id) {
    let query = supabase
      .from("call_transcripts")
      .select("*")
      .eq("id", payload.transcript_id || callRecord.transcript_id);
    if (tenant?.id) query = query.eq("tenant_id", tenant.id);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  if (callRecord.id) {
    let query = supabase
      .from("call_transcripts")
      .select("*")
      .eq("call_record_id", callRecord.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (tenant?.id) query = query.eq("tenant_id", tenant.id);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  if (payload.session_id) {
    let query = supabase
      .from("call_transcripts")
      .select("*")
      .eq("source_system", LIVE_SOURCE_SYSTEM)
      .eq("source_id", payload.session_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (tenant?.id) query = query.eq("tenant_id", tenant.id);
    const { data } = await query.maybeSingle();
    if (data) return data;
  }

  return null;
}

async function saveTranscript(supabase, callRecord, payload, auth, tenant, { final = false } = {}) {
  const transcriptText = scrubPhi(payload.transcript_text);
  if (!transcriptText) {
    return { transcript: null, callRecord };
  }

  const agent = await fetchAgent(supabase, payload, auth, tenant);
  const transcriptAgentId = await resolveTranscriptAgentId(supabase, agent, tenant);
  if (!transcriptAgentId) {
    console.warn("[post-call] call_transcripts was not available; transcript stored on call_records only.");
    return { transcript: null, callRecord };
  }

  const now = new Date().toISOString();
  let existing = null;
  try {
    existing = await findTranscript(supabase, callRecord, payload, tenant);
  } catch (error) {
    if (error?.code === "42P01" || /call_transcripts/i.test(error.message || "")) {
      console.warn("[post-call] call_transcripts was not available; transcript stored on call_records only.");
      return { transcript: null, callRecord };
    }
    throw error;
  }

  const basePayload = {
    tenant_id: tenant.id,
    agent_id: transcriptAgentId,
    call_date: callRecord.call_start || payload.call_start || now,
    duration_seconds: Number.isFinite(Number(payload.call_duration_seconds))
      ? Number(payload.call_duration_seconds)
      : callRecord.call_duration_seconds,
    direction: normalizeDirection(payload.call_direction || callRecord.call_direction),
    product_line: normalizeProductType(payload.product_type || callRecord.product_type),
    carrier: safeText(payload.carrier_name) || callRecord.carrier_name || null,
    plan_name: safeText(payload.plan_name) || callRecord.plan_name || null,
    enrollment_period: normalizeEnrollmentPeriod(payload.enrollment_period || payload.election_period || callRecord.election_period),
    disposition: safeText(payload.disposition) || (final ? dispositionFromOutcome(payload.call_outcome) : "pending"),
    compliance_passed: null,
    transcript_text: transcriptText,
    source_system: LIVE_SOURCE_SYSTEM,
    source_id: payload.session_id || callRecord.session_id || callRecord.id,
    recording_url: callRecord.recording_url || null,
    phi_scrubbed: true,
    call_record_id: callRecord.id,
    session_id: payload.session_id || callRecord.session_id || null,
    last_checkpoint_at: now,
    updated_at: now,
  };

  let transcript;
  try {
    if (existing) {
      const { data, error } = await supabase
        .from("call_transcripts")
        .update(basePayload)
        .eq("id", existing.id)
        .eq("tenant_id", tenant.id)
        .select("*")
        .single();
      if (error) throw error;
      transcript = data;
    } else {
      const { data, error } = await supabase
        .from("call_transcripts")
        .insert(basePayload)
        .select("*")
        .single();
      if (error) throw error;
      transcript = data;
    }
  } catch (error) {
    if (error?.code === "42P01" || /call_transcripts/i.test(error.message || "")) {
      console.warn("[post-call] call_transcripts was not available; transcript stored on call_records only.");
      return { transcript: null, callRecord };
    }
    throw error;
  }

  const { data: updatedCallRecord } = await supabase
    .from("call_records")
    .update({
      transcript_id: transcript.id,
      updated_at: now,
    })
    .eq("id", callRecord.id)
    .eq("tenant_id", tenant.id)
    .select("*")
    .single();

  return { transcript, callRecord: updatedCallRecord || callRecord };
}

async function updateCallTranscriptFields(supabase, transcriptId, payload, tenant) {
  if (!transcriptId) return;

  const updatePayload = {
    disposition: dispositionFromOutcome(payload.call_outcome),
    carrier: safeText(payload.carrier_name) || null,
    plan_name: safeText(payload.plan_name) || null,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("call_transcripts")
    .update(updatePayload)
    .eq("id", transcriptId)
    .eq("tenant_id", tenant.id);
}

async function saveCheckpoint(supabase, payload, auth, tenant, { final = false } = {}) {
  const callRecord = await ensureCallRecord(supabase, payload, auth, tenant);
  const diarized = normalizeDiarized(payload.transcript_diarized);
  const transcriptText = scrubPhi(payload.transcript_text);
  const now = new Date().toISOString();

  const metadata = mergeMetadata(callRecord.metadata, {
    last_transcript_checkpoint_at: now,
    transcript_source: LIVE_SOURCE_SYSTEM,
    transcript_finalized_at: final ? now : callRecord.metadata?.transcript_finalized_at || null,
  });

  const callUpdate = {
    carrier_name: safeText(payload.carrier_name) || callRecord.carrier_name || null,
    plan_name: safeText(payload.plan_name) || callRecord.plan_name || null,
    plan_id: safeText(payload.plan_id) || callRecord.plan_id || null,
    call_duration_seconds: Number.isFinite(Number(payload.call_duration_seconds))
      ? Number(payload.call_duration_seconds)
      : callRecord.call_duration_seconds,
    transcript_raw: transcriptText || callRecord.transcript_raw || null,
    transcript_diarized: diarized.length ? diarized : callRecord.transcript_diarized || [],
    election_period: normalizeEnrollmentPeriod(payload.election_period || payload.enrollment_period || callRecord.election_period),
    call_outcome: final && !callRecord.call_outcome ? "incomplete" : callRecord.call_outcome,
    call_end: final && !callRecord.call_end ? now : callRecord.call_end,
    metadata,
    updated_at: now,
  };

  const { data: updatedCallRecord, error } = await supabase
    .from("call_records")
    .update(callUpdate)
    .eq("id", callRecord.id)
    .eq("tenant_id", tenant.id)
    .select("*")
    .single();

  if (error) throw error;

  const saved = await saveTranscript(supabase, updatedCallRecord, payload, auth, tenant, { final });

  return {
    callRecord: saved.callRecord || updatedCallRecord,
    transcript: saved.transcript,
  };
}

async function triggerScoring(request, callRecordId) {
  const scoringUrl = new URL("/.netlify/functions/score-call-background", request.url);
  const response = await fetch(scoringUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId: callRecordId }),
  });

  if (!response.ok && response.status !== 202) {
    console.warn("[post-call] scoring trigger returned", response.status);
  }
}

function queueBackground(context, promise) {
  const wrapped = Promise.resolve(promise).catch((error) => {
    console.error("[post-call] background task failed:", error);
  });

  if (typeof context?.waitUntil === "function") {
    context.waitUntil(wrapped);
  }
}

function buildGhlWebhookPayload(payload, tenant, tenantAgents) {
  const writingAgent = safeText(payload.writing_agent) || tenantAgents.find((agent) => agent.name)?.name || "";
  return {
    firstName: safeText(payload.customer_first_name),
    lastName: safeText(payload.customer_last_name),
    dob: payload.customer_dob || "",
    phone: safeText(payload.customer_phone),
    email: safeText(payload.customer_email),
    state: safeText(payload.customer_state),
    mbi: safeText(payload.customer_mbi),
    medicaid: safeText(payload.medicaid) || "No",
    medicaidNum: safeText(payload.medicaid_number),
    prevCarrier: safeText(payload.previous_carrier),
    newCarrier: safeText(payload.carrier_name),
    enrollCode: safeText(payload.enrollment_code || payload.application_id),
    premium: safeText(payload.premium),
    sunfireCode: safeText(payload.sunfire_code),
    effectiveDate: payload.effective_date || "",
    sixtyDayDate: payload.sixty_day_date || "",
    sep: safeText(payload.sep) || "No",
    agency: safeText(payload.agency) || tenant.agency_display_name || tenant.name || "",
    aor: writingAgent,
    assignedUserId:
      getAgentGhlUserId(tenantAgents, writingAgent) ||
      tenantAgents.find((agent) => agent.ghl_user_id)?.ghl_user_id ||
      "",
    hra: safeText(payload.hra) || "No",
    hraDate: payload.hra_date || "",
    submittedAt: new Date().toISOString(),
  };
}

async function sendEnrollmentWebhook(tenant, tenantAgents, payload) {
  if (!tenant?.ghl_webhook_url) {
    return {
      sent: false,
      sentAt: null,
      error: "Tenant GHL webhook URL is not configured.",
    };
  }

  try {
    const response = await fetch(tenant.ghl_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGhlWebhookPayload(payload, tenant, tenantAgents)),
    });

    if (response.ok) {
      return { sent: true, sentAt: new Date().toISOString(), error: "" };
    }

    return {
      sent: false,
      sentAt: null,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    return {
      sent: false,
      sentAt: null,
      error: error?.message || "Webhook request failed",
    };
  }
}

async function handleWrapUp(supabase, payload, auth, request, context, tenant, tenantAgents, subscription) {
  const saved = await saveCheckpoint(supabase, payload, auth, tenant, { final: true });
  const callRecord = saved.callRecord;
  const outcome = normalizeOutcome(payload.call_outcome);
  const now = new Date().toISOString();
  const agent = await fetchAgent(supabase, payload, auth, tenant);
  const writingAgent = resolveHumanAgentNameFromLoaded(payload, auth, tenantAgents, agent);

  const metadata = mergeMetadata(callRecord.metadata, {
    wrap_up_saved_at: now,
    scoring_status: "queued",
  });

  const updatePayload = {
    carrier_name: safeText(payload.carrier_name) || callRecord.carrier_name || null,
    plan_name: safeText(payload.plan_name) || callRecord.plan_name || null,
    plan_id: safeText(payload.plan_id) || callRecord.plan_id || null,
    effective_date: payload.effective_date || null,
    application_id: safeText(payload.application_id) || null,
    customer_first_name: safeText(payload.customer_first_name) || null,
    customer_last_name: safeText(payload.customer_last_name) || null,
    customer_phone: safeText(payload.customer_phone) || null,
    customer_email: safeText(payload.customer_email) || null,
    customer_dob: payload.customer_dob || null,
    customer_state: safeText(payload.customer_state) || null,
    customer_mbi: safeText(payload.customer_mbi) || null,
    medicaid: safeText(payload.medicaid) || "No",
    medicaid_number: safeText(payload.medicaid_number) || null,
    previous_carrier: safeText(payload.previous_carrier) || null,
    enrollment_code: safeText(payload.enrollment_code || payload.application_id) || null,
    premium: safeText(payload.premium) || null,
    sunfire_code: safeText(payload.sunfire_code) || null,
    sixty_day_date: payload.sixty_day_date || null,
    sep: safeText(payload.sep) || "No",
    agency: safeText(payload.agency) || tenant.agency_display_name || tenant.name || null,
    writing_agent: writingAgent,
    agent_name: writingAgent,
    hra: safeText(payload.hra) || "No",
    hra_date: payload.hra_date || null,
    enrollment_confirmation_number: safeText(payload.enrollment_confirmation_number) || null,
    enrollment_completed: outcome === "enrolled",
    call_outcome: outcome,
    agent_notes: safeText(payload.agent_notes) || null,
    call_end: now,
    call_duration_seconds: Number.isFinite(Number(payload.call_duration_seconds))
      ? Number(payload.call_duration_seconds)
      : callRecord.call_duration_seconds,
    webhook_sent: outcome === "enrolled" ? Boolean(callRecord.webhook_sent) : false,
    webhook_sent_at: outcome === "enrolled" ? callRecord.webhook_sent_at || null : null,
    webhook_error: outcome === "enrolled" ? callRecord.webhook_error || null : null,
    metadata,
    updated_at: now,
  };

  let { data: updatedCallRecord, error } = await supabase
    .from("call_records")
    .update(updatePayload)
    .eq("id", callRecord.id)
    .eq("tenant_id", tenant.id)
    .select("*")
    .single();

  if (error) throw error;

  if (updatedCallRecord.session_id) {
    await supabase
      .from("sessions")
      .update({
        ended_at: now,
        completed: outcome === "enrolled",
        duration_seconds: updatePayload.call_duration_seconds,
      })
      .eq("id", updatedCallRecord.session_id)
      .eq("tenant_id", tenant.id);
  }

  await updateCallTranscriptFields(
    supabase,
    saved.transcript?.id || updatedCallRecord.transcript_id,
    {
      ...payload,
      call_outcome: outcome,
      carrier_name: updatePayload.carrier_name,
      plan_name: updatePayload.plan_name,
    },
    tenant
  );

  queueBackground(
    context,
    triggerScoring(request, updatedCallRecord.id)
  );

  let webhookStatus = "skipped";
  if (outcome === "enrolled") {
    const webhookAllowed = requirePlan(subscription, "pro");
    if (webhookAllowed.response) {
      webhookStatus = "skipped_plan";
    } else {
      const webhookResult = await sendEnrollmentWebhook(tenant, tenantAgents, {
        ...payload,
        agency: updatePayload.agency,
        writing_agent: updatePayload.writing_agent,
        enrollment_code: updatePayload.enrollment_code,
        application_id: updatePayload.application_id,
      });

      const webhookPatch = {
        webhook_sent: webhookResult.sent,
        webhook_sent_at: webhookResult.sent ? webhookResult.sentAt : null,
        webhook_error: webhookResult.sent ? null : webhookResult.error,
        updated_at: new Date().toISOString(),
      };

      const { data: webhookUpdated, error: webhookUpdateError } = await supabase
        .from("call_records")
        .update(webhookPatch)
        .eq("id", updatedCallRecord.id)
        .eq("tenant_id", tenant.id)
        .select("*")
        .single();

      if (webhookUpdateError) throw webhookUpdateError;
      updatedCallRecord = webhookUpdated || updatedCallRecord;
      webhookStatus = webhookResult.sent ? "sent" : "failed";
    }
  }

  return {
    call_record_id: updatedCallRecord.id,
    transcript_id: saved.transcript?.id || updatedCallRecord.transcript_id || null,
    scoring_status: "queued",
    webhook_status: webhookStatus,
  };
}

async function handleWebhookResult(supabase, payload, tenant) {
  const callRecordId = safeText(payload.call_record_id);
  if (!callRecordId) {
    throw new Error("Missing call_record_id for webhook result");
  }

  const sent = payload.webhook_sent === true;
  const now = new Date().toISOString();
  const updatePayload = {
    webhook_sent: sent,
    webhook_sent_at: sent ? safeText(payload.webhook_sent_at) || now : null,
    webhook_error: sent ? null : safeText(payload.webhook_error) || "Webhook failed",
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("call_records")
    .update(updatePayload)
    .eq("id", callRecordId)
    .eq("tenant_id", tenant.id)
    .select("id, webhook_sent, webhook_sent_at, webhook_error")
    .single();

  if (error) throw error;

  return {
    call_record_id: data.id,
    webhook_sent: data.webhook_sent,
    webhook_sent_at: data.webhook_sent_at,
    webhook_error: data.webhook_error,
  };
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const action = safeText(body.action);
  if (!action) return json(400, { error: "Missing action" });

  try {
    const supabase = getSupabase();
    const tenant = await resolveTenant(supabase, auth.orgId);
    const subscription = await requireActiveSubscription(supabase, tenant.id);
    if (subscription.response) return subscription.response;
    const seatLimit = await checkSeatLimit(supabase, tenant.id, subscription);
    if (seatLimit.response) return seatLimit.response;

    const tenantAgents = await fetchTenantAgents(supabase, tenant.id);

    if (action === "init") {
      const callRecord = await ensureCallRecord(supabase, body, auth, tenant);
      return json(200, {
        call_record_id: callRecord.id,
        transcript_id: callRecord.transcript_id || null,
      });
    }

    if (action === "checkpoint" || action === "finalize") {
      const saved = await saveCheckpoint(supabase, body, auth, tenant, { final: action === "finalize" });
      return json(200, {
        call_record_id: saved.callRecord.id,
        transcript_id: saved.transcript?.id || saved.callRecord.transcript_id || null,
        checkpointed_at: new Date().toISOString(),
      });
    }

    if (action === "wrap_up") {
      const result = await handleWrapUp(
        supabase,
        body,
        auth,
        request,
        context,
        tenant,
        tenantAgents,
        subscription
      );
      await logUsageRecord(supabase, tenant.id, "call_completed", 1, {
        call_record_id: result.call_record_id,
        outcome: normalizeOutcome(body.call_outcome),
        product_type: normalizeProductType(body.product_type),
        user_id: auth.userId,
      });
      return json(200, result);
    }

    if (action === "webhook_result") {
      const result = await handleWebhookResult(supabase, body, tenant);
      return json(200, result);
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (error) {
    console.error("[post-call] failed:", error);
    return json(500, { error: error.message || "Post-call pipeline failed" });
  }
};
