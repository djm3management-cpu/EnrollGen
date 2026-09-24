import twilio from "twilio";
import { config } from "./config.js";
import { supabase } from "./supabase.js";

export const terminalStatuses = new Set(["completed", "canceled", "failed", "busy", "no-answer"]);
const iso = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const seconds = value => value !== undefined && value !== null && value !== "" &&
  Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

async function fetchChildCall(sid) {
  return twilio(config.twilioAccountSid, config.twilioAuthToken, { timeout: 5000 }).calls(sid).fetch();
}

export async function createCallAttempt({ callSid, agentId, contactId, direction, to, inboundCallId = null }) {
  const { data, error } = await supabase.from("telephony_call_attempts").insert({
    tenant_id: config.defaultTenantId, parent_call_sid: callSid, agent_id: agentId,
    contact_id: contactId, direction, to_number: to, inbound_call_id: inboundCallId,
    min_connected_seconds: config.minConnectedSeconds,
  }).select("id").single();
  if (error) throw new Error(`Call attempt persistence failed: ${error.message}`);
  return data.id;
}

// Timestamp is supplied by Twilio for child progress events. Dial actions lack
// it: fetch the completed child, never substitute webhook receipt time for an
// answer time (a delayed retry would otherwise advance the contact incorrectly).
export async function buildEvidence(body, source, fetchCall = fetchChildCall) {
  const status = source === "child" ? body.CallStatus : body.DialCallStatus;
  const parentSid = source === "child" ? body.ParentCallSid : body.CallSid;
  const childSid = source === "child" ? body.CallSid : body.DialCallSid;
  const explicitlyUnbridged = source === "dial" && String(body.DialBridged).toLowerCase() === "false";
  const duration = explicitlyUnbridged ? 0 : seconds(source === "child" ? body.CallDuration : body.DialCallDuration);
  const answered = source === "child" && ["answered", "in-progress"].includes(status);
  const completedWithTalk = status === "completed" && duration > 0;
  let timestamp = iso(body.Timestamp);
  if (!childSid) {
    if (answered || completedWithTalk) throw new Error("Answer evidence missing child SID");
    return null; // Twilio can fail a Dial before creating a child leg.
  }
  if (!parentSid) throw new Error("Answer evidence missing parent SID");
  if (answered && !timestamp) throw new Error("Answer callback missing event timestamp");
  if (completedWithTalk && !timestamp) {
    const call = await fetchCall(childSid);
    if (call.parentCallSid !== parentSid || call.status !== "completed" || !iso(call.endTime)) {
      throw new Error("Completed child call could not be verified");
    }
    timestamp = iso(call.endTime);
  }
  return {
    p_parent_sid: parentSid, p_child_sid: childSid, p_source: source, p_status: status,
    p_answered_at: answered ? timestamp : completedWithTalk
      ? new Date(new Date(timestamp).getTime() - duration * 1000).toISOString() : null,
    p_ended_at: terminalStatuses.has(status) ? timestamp || new Date().toISOString() : null,
    p_talk_seconds: duration,
  };
}

export async function recordCallbackEvidence(req, source) {
  // Old in-flight calls have no persisted attempt. They retain their existing
  // release/routing behavior, but cannot manufacture attribution from a slug.
  if (!req.query.attemptId) return;
  const evidence = await buildEvidence(req.body, source);
  if (!evidence) return;
  const { error } = await supabase.rpc("record_telephony_evidence", {
    p_attempt_id: req.query.attemptId, p_agent_id: req.query.agentId, ...evidence,
  });
  if (error) throw new Error(`Answer attribution failed: ${error.message}`);
}

// Run before routingReplay: attribution retries must still work after TwiML was
// persisted, and a transient attribution error must not strand a replay key.
export async function dialAttribution(req, res, next) {
  try { await recordCallbackEvidence(req, "dial"); return next(); }
  catch (err) { console.error("Dial attribution failed:", err); return res.status(503).end(); }
}

export async function finishInboundCall(callSid, status, body = {}) {
  const { error } = await supabase.rpc("finish_inbound_call", {
    p_call_sid: callSid, p_status: status,
    p_ended_at: iso(body.Timestamp) || new Date().toISOString(),
    p_duration: seconds(body.CallDuration),
  });
  if (error) throw new Error(`Call finalization failed: ${error.message}`);
}
