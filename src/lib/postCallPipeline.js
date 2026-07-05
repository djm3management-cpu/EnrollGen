import { fetchWithClerk } from "./clerkFetch";
import { redactSensitiveText, redactTranscriptEntries } from "./redaction";

const POST_CALL_ENDPOINT = "/api/post-call";

export const CHECKPOINT_INTERVAL_MS = 120000;

export const CALL_OUTCOME_OPTIONS = [
  { value: "enrolled", label: "Enrolled" },
  { value: "not_enrolled", label: "Not enrolled" },
  { value: "callback_scheduled", label: "Callback scheduled" },
  { value: "transferred", label: "Transferred" },
  { value: "incomplete", label: "Incomplete" },
  { value: "no_answer", label: "No answer" },
];

export const US_STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTenantConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    clerk_org_id: row.clerk_org_id || null,
    ghl_webhook_url: row.ghl_webhook_url || "",
    ghl_location_id: row.ghl_location_id || "",
    coop_rates: row.coop_rates && typeof row.coop_rates === "object" ? row.coop_rates : {},
    carrier_options: Array.isArray(row.carrier_options) ? row.carrier_options : [],
    agency_display_name: row.agency_display_name || row.name || "",
    agency_npn: row.agency_npn || "",
    licensed_states: Array.isArray(row.licensed_states) ? row.licensed_states : [],
    compliance_config:
      row.compliance_config && typeof row.compliance_config === "object"
        ? row.compliance_config
        : {},
  };
}

export async function fetchTenantConfig(supabaseClient, tenantId) {
  if (!supabaseClient?.from) return null;
  let query = supabaseClient
    .from("tenants")
    .select(
      "id, name, clerk_org_id, ghl_webhook_url, ghl_location_id, coop_rates, carrier_options, agency_display_name, agency_npn, licensed_states, compliance_config"
    );

  if (tenantId) {
    query = query.eq("id", tenantId);
  }

  const { data, error } = await query
    .order("clerk_org_id", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return normalizeTenantConfig(data);
}

export async function fetchTenantAgents(supabaseClient, tenantId) {
  if (!supabaseClient?.from || !tenantId) return [];
  const { data, error } = await supabaseClient
    .from("tenant_agents")
    .select("name, ghl_user_id, npn, clerk_user_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []).map((agent) => ({
    name: agent.name || "",
    ghl_user_id: agent.ghl_user_id || "",
    npn: agent.npn || "",
    clerk_user_id: agent.clerk_user_id || "",
  }));
}

export function getAgentGhlUserId(agents = [], agentName) {
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

export function formatPhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatMbiInput(value) {
  const raw = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 11);
  const groups = [raw.slice(0, 4), raw.slice(4, 7), raw.slice(7, 11)].filter(Boolean);
  return groups.join("-");
}

export function formatPremiumInput(value) {
  const raw = String(value || "").replace(/[^0-9.]/g, "");
  if (!raw) return "";
  const amount = Number.parseFloat(raw);
  if (!Number.isFinite(amount)) return "";
  return `$${amount.toFixed(2)}`;
}

export function calculateSixtyDayDate(effectiveDate) {
  const normalized = normalizeDateInput(effectiveDate);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 60);
  return date.toISOString().slice(0, 10);
}

export function productTypeFromFlow(flow) {
  const normalized = String(flow || "").toLowerCase();
  if (normalized === "medsup") return "MedSup";
  if (normalized === "aca") return "ACA";
  if (normalized === "u65") return "U65";
  if (normalized === "ancillary") return "Ancillary";
  return "MA";
}

export function inferEnrollmentPeriod(state) {
  if (state?.sepFinderResults?.selectedSepType) return "SEP";
  if (state?.snpType) return "SEP";
  return "AEP";
}

export function buildTranscriptText(mergedTranscript = [], fallbackTranscript = "") {
  const finalEntries = redactTranscriptEntries(
    (mergedTranscript || []).filter((entry) => entry?.isFinal !== false && entry?.text?.trim())
  );
  if (finalEntries.length > 0) {
    return finalEntries
      .map((entry) => {
        const speaker = entry.speaker === "customer" || entry.speaker === "beneficiary"
          ? "CUSTOMER"
          : "AGENT";
        const stamp = entry.timestamp ? new Date(entry.timestamp) : null;
        const time = stamp && !Number.isNaN(stamp.getTime())
          ? stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : null;
        return `${time ? `[${time}] ` : ""}${speaker}: ${entry.text.trim()}`;
      })
      .join("\n");
  }

  return redactSensitiveText(String(fallbackTranscript || "").trim());
}

export function buildDiarizedTranscript(mergedTranscript = [], fallbackTranscript = "") {
  const finalEntries = redactTranscriptEntries(
    (mergedTranscript || []).filter((entry) => entry?.isFinal !== false && entry?.text?.trim())
  );
  if (finalEntries.length > 0) {
    const firstTimestamp = Number(finalEntries[0]?.timestamp) || Date.now();
    return finalEntries.map((entry, index) => {
      const timestamp = Number(entry.timestamp) || firstTimestamp + index * 5000;
      const startMs = Math.max(0, timestamp - firstTimestamp);
      const text = entry.text.trim();
      return {
        speaker: entry.speaker === "customer" || entry.speaker === "beneficiary" ? "customer" : "agent",
        text,
        start_ms: startMs,
        end_ms: startMs + Math.max(1200, Math.round(text.length / 14) * 1000),
      };
    });
  }

  const text = redactSensitiveText(String(fallbackTranscript || "").trim());
  return text
    ? [{ speaker: "agent", text, start_ms: 0, end_ms: Math.max(120000, Math.round(text.length / 12) * 1000) }]
    : [];
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function buildPostCallPayload({
  state,
  liveCall,
  sessionMetadata,
  flow = "ma",
  final = false,
} = {}) {
  const notes = state?.notes || {};
  const transcriptText = buildTranscriptText(liveCall?.mergedTranscript, liveCall?.transcript);
  const diarizedTranscript = buildDiarizedTranscript(liveCall?.mergedTranscript, liveCall?.transcript);
  const startedAt = state?.tpmoStart ? new Date(state.tpmoStart).toISOString() : null;
  const durationSeconds = state?.tpmoStart
    ? Math.max(0, Math.round((Date.now() - state.tpmoStart) / 1000))
    : null;

  return {
    session_id: sessionMetadata?.sessionId || null,
    agent_id: sessionMetadata?.agentId || null,
    call_record_id: sessionMetadata?.callRecordId || null,
    transcript_id: sessionMetadata?.transcriptId || null,
    contact_id: sessionMetadata?.contactId || null,
    flow,
    product_type: productTypeFromFlow(flow),
    call_direction: state?.callDirection || liveCall?.callDirection || "inbound",
    call_type: "enrollment",
    call_start: startedAt,
    call_duration_seconds: durationSeconds,
    transcript_text: transcriptText,
    transcript_diarized: diarizedTranscript,
    carrier_name: notes.carrierName || null,
    plan_name: notes.planName || null,
    plan_id: notes.planId || null,
    election_period: inferEnrollmentPeriod(state),
    enrollment_period: inferEnrollmentPeriod(state),
    effective_date: normalizeDateInput(notes.effectiveDate),
    application_id: notes.enrollmentCode || null,
    customer_first_name: notes.customerFirstName || null,
    customer_last_name: notes.customerLastName || null,
    customer_phone: notes.customerPhone || null,
    customer_email: notes.customerEmail || null,
    customer_dob: normalizeDateInput(notes.customerDob),
    customer_state: notes.customerState || null,
    customer_mbi: notes.customerMbi || null,
    medicaid: notes.medicaid || "No",
    medicaid_number: notes.medicaidNumber || null,
    previous_carrier: notes.previousCarrier || null,
    enrollment_code: notes.enrollmentCode || null,
    premium: notes.premium || null,
    sunfire_code: notes.sunfireCode || null,
    sixty_day_date: normalizeDateInput(notes.sixtyDayDate) || calculateSixtyDayDate(notes.effectiveDate) || null,
    sep: notes.sep || "No",
    agency: notes.agency || null,
    writing_agent: notes.writingAgent || state?.agentName || null,
    hra: notes.hra || "No",
    hra_date: normalizeDateInput(notes.hraDate),
    enrollment_confirmation_number: notes.confirmation || null,
    final,
  };
}

async function postCallAction(getToken, action, payload = {}) {
  const response = await fetchWithClerk(getToken, POST_CALL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.detail || raw || `Post-call action failed (${response.status})`);
  }

  return data || {};
}

export async function initPostCallRecord(getToken, payload) {
  return postCallAction(getToken, "init", payload);
}

export async function checkpointPostCall(getToken, payload) {
  return postCallAction(getToken, "checkpoint", payload);
}

export async function finalizePostCallTranscript(getToken, payload) {
  return postCallAction(getToken, "finalize", payload);
}

export async function savePostCallWrapUp(getToken, payload) {
  return postCallAction(getToken, "wrap_up", payload);
}

export async function recordWebhookResult(getToken, payload) {
  return postCallAction(getToken, "webhook_result", payload);
}

export function buildGhlWebhookPayload(payload = {}, tenantConfig = {}, tenantAgents = []) {
  const writingAgent = payload.writing_agent || tenantAgents.find((agent) => agent.name)?.name || "";
  return {
    firstName: payload.customer_first_name || "",
    lastName: payload.customer_last_name || "",
    dob: payload.customer_dob || "",
    phone: payload.customer_phone || "",
    email: payload.customer_email || "",
    state: payload.customer_state || "",
    mbi: payload.customer_mbi || "",
    medicaid: payload.medicaid || "No",
    medicaidNum: payload.medicaid_number || "",
    prevCarrier: payload.previous_carrier || "",
    newCarrier: payload.carrier_name || "",
    enrollCode: payload.enrollment_code || payload.application_id || "",
    premium: payload.premium || "",
    sunfireCode: payload.sunfire_code || "",
    effectiveDate: payload.effective_date || "",
    sixtyDayDate: payload.sixty_day_date || "",
    sep: payload.sep || "No",
    agency: payload.agency || tenantConfig?.agency_display_name || "",
    aor: writingAgent,
    assignedUserId:
      getAgentGhlUserId(tenantAgents, writingAgent) ||
      tenantAgents.find((agent) => agent.ghl_user_id)?.ghl_user_id ||
      "",
    hra: payload.hra || "No",
    hraDate: payload.hra_date || "",
    submittedAt: new Date().toISOString(),
  };
}

export async function sendEnrollmentWebhookAfterSave(
  getToken,
  { callRecordId, payload, webhookUrl, tenantConfig, tenantAgents = [] }
) {
  if (payload?.call_outcome !== "enrolled" || !callRecordId) {
    return { status: "skipped" };
  }

  const targetUrl = webhookUrl || tenantConfig?.ghl_webhook_url;
  if (!targetUrl) {
    return { status: "failed", error: "Tenant GHL webhook URL is not configured." };
  }

  let webhookSent = false;
  let webhookError = "";
  let webhookSentAt = "";

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGhlWebhookPayload(payload, tenantConfig, tenantAgents)),
    });

    if (response.ok) {
      webhookSent = true;
      webhookSentAt = new Date().toISOString();
    } else {
      webhookError = `HTTP ${response.status}: ${response.statusText}`;
    }
  } catch (error) {
    webhookError = error?.message || "Webhook request failed";
  }

  try {
    await recordWebhookResult(getToken, {
      call_record_id: callRecordId,
      webhook_sent: webhookSent,
      webhook_sent_at: webhookSentAt,
      webhook_error: webhookError,
    });
  } catch (error) {
    console.error("[PostCall] failed to record webhook result:", error);
  }

  return {
    status: webhookSent ? "sent" : "failed",
    error: webhookError,
  };
}
