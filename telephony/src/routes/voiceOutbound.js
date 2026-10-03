import { supabase } from "../supabase.js";
import { requireClerkUser } from "../clerkAuth.js";
import { outboundDncStatus } from "../outboundPolicy.js";
import { Router } from "express";
import twilio from "twilio";
import { config, publicUrl } from "../config.js";
import { requireTwilioSignature } from "../twilioSecurity.js";
import { normalizePhoneE164 } from "../phone.js";
import { findOrCreateContactByPhone } from "../contacts.js";
import { createCallAttempt, dialAttribution } from "../answerAttribution.js";

import { claimNextAvailableAgent, releaseAgent } from "../availability.js";

import { routingReplay, sendRoutingTwiml } from "../routingReplay.js";

const VoiceResponse = twilio.twiml.VoiceResponse;

export const voiceOutboundRouter = Router();

// Read-only browser policy and canonical identity endpoints. Identity is server-resolved.
async function browserAgent(req, res) {
  const user = await requireClerkUser(req, res);
  if (!user) return null;
  const { data, error } = await supabase.from("tenant_agents")
    .select("agent_slug, tenant_id").eq("clerk_user_id", user.sub).eq("is_active", true).maybeSingle();
  if (error) { res.status(503).json({ error: "Agent identity unavailable" }); return null; }
  if (!data) { res.status(403).json({ error: "Active tenant agent required" }); return null; }
  return data;
}
voiceOutboundRouter.post("/api/voice/outbound-check", async (req, res) => {
  const agent = await browserAgent(req, res);
  if (!agent) return;
  try {
    const blocked = await outboundDncStatus(req.body.phone, agent.tenant_id);
    return res.json({ blocked, reason: blocked ? "Do Not Call" : null });
  } catch (error) { return res.status(503).json({ error: error.message }); }
});
voiceOutboundRouter.post("/api/voice/outbound-status", async (req, res) => {
  const agent = await browserAgent(req, res);
  if (!agent) return;
  const { data, error } = await supabase.from("telephony_call_attempts")
    .select("id, contact_id, to_number").eq("tenant_id", agent.tenant_id)
    .eq("agent_id", agent.agent_slug).eq("direction", "outbound")
    .eq("parent_call_sid", req.body.callSid).maybeSingle();
  if (error) return res.status(503).json({ error: "Outbound identity unavailable" });
  if (!data) return res.status(404).json({ error: "Outbound attempt not available yet" });
  return res.json({ attemptId: data.id, contactId: data.contact_id, phoneNumber: data.to_number });
});

function sendTwiml(res, response) {
  res.type("text/xml").send(response.toString());
}

// Twilio's servers hit this (not the browser) when the agent's Device
// calls connect({params}) against the outgoingApplicationSid TwiML app
// granted in /api/voice/token. Custom connect() params (PhoneNumber,
// ContactId) arrive as regular body fields alongside the Twilio call
// fields, all covered by the same X-Twilio-Signature the inbound
// webhooks use.
async function outboundGate(req, res, next) {
  const to = normalizePhoneE164(req.body.PhoneNumber);
  if (!to) return next(); // Existing invalid-number TwiML below.
  const agentId = String(req.body.From || "").replace(/^client:/, "");
  const response = new VoiceResponse();
  try {
    const { data: agent, error } = await supabase.from("tenant_agents")
      .select("tenant_id").eq("agent_slug", agentId).eq("is_active", true).maybeSingle();
    if (error || !agent?.tenant_id || !String(req.body.From || "").startsWith("client:"))
      throw new Error("Active tenant agent required");
    res.locals.outboundTenantId = agent.tenant_id;
    if (!(await outboundDncStatus(to, agent.tenant_id))) return next();
    response.say("Do Not Call. This number is on your tenant's Do Not Call list.");
  } catch (error) {
    response.say("Do Not Call check unavailable. Calling is temporarily unavailable. Please try again.");
  }
  response.hangup();
  return sendTwiml(res, response);
}

voiceOutboundRouter.post("/api/voice/outbound", requireTwilioSignature, outboundGate, routingReplay, async (req, res) => {
  const to = normalizePhoneE164(req.body.PhoneNumber);
  const response = new VoiceResponse();

  if (!to) {
    response.say({ voice: "Polly.Joanna" }, "The number dialed is invalid.");
    response.hangup();
    return sendRoutingTwiml(res, response);
  }

  const agentId = String(req.body.From || "").replace(/^client:/, "");
  let attemptId;
  let reserved = false;
  try {
    if (!String(req.body.From || "").startsWith("client:") ||
        !(await claimNextAvailableAgent({ callSid: req.body.CallSid, agentId }))) {
      response.say("You already have a call in progress. Please finish it before dialing.");
      response.hangup();
      return sendRoutingTwiml(res, response);
    }
    reserved = true;
    const { contact, error } = await findOrCreateContactByPhone({ phone: to, tenantId: res.locals.outboundTenantId, source: "manual" });
    if (!contact) throw new Error(`Outbound contact persistence failed: ${error || "missing contact"}`);
    if (contact.do_not_call) throw new Error("Do Not Call");
    attemptId = await createCallAttempt({
      callSid: req.body.CallSid, agentId, contactId: contact.id, direction: "outbound", to, tenantId: res.locals.outboundTenantId,
    });
  } catch (err) {
    console.error("Outbound reservation failed:", err);
    if (reserved) {
      try { await releaseAgent(agentId, req.body.CallSid); }
      catch (releaseError) { console.error("Reservation cleanup failed:", releaseError); return res.status(503).end(); }
    }
    response.say(err.message === "Do Not Call" ? "Do Not Call" : "Calling is temporarily unavailable. Please try again.");
    response.hangup();
    return sendRoutingTwiml(res, response);
  }

  const dial = response.dial({
    action: publicUrl(`/api/voice/outbound-result?agentId=${encodeURIComponent(agentId)}&attemptId=${attemptId}`),
    callerId: config.twilioPhoneNumber || "+16098065996",
    answerOnBridge: true,
    record: "record-from-answer-dual",
    recordingStatusCallback: publicUrl(`/twilio/recording?attemptId=${attemptId}`),
    recordingStatusCallbackEvent: "completed absent",
  });
  dial.number({
    statusCallback: publicUrl(`/twilio/agent-status?agentId=${encodeURIComponent(agentId)}&attemptId=${attemptId}`),
    statusCallbackEvent: ["answered", "completed"],
  }, to);
  return sendRoutingTwiml(res, response);
});

voiceOutboundRouter.post("/api/voice/outbound-result", requireTwilioSignature, dialAttribution, async (req, res) => {
  try {
    await releaseAgent(req.query.agentId, req.body.CallSid);
    const response = new VoiceResponse();
    response.hangup();
    return sendTwiml(res, response);
  } catch (err) {
    console.error("Outbound completion failed:", err);
    return res.status(503).end();
  }
});
