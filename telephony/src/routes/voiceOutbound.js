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

function sendTwiml(res, response) {
  res.type("text/xml").send(response.toString());
}

// Twilio's servers hit this (not the browser) when the agent's Device
// calls connect({params}) against the outgoingApplicationSid TwiML app
// granted in /api/voice/token. Custom connect() params (PhoneNumber,
// ContactId) arrive as regular body fields alongside the Twilio call
// fields, all covered by the same X-Twilio-Signature the inbound
// webhooks use.
voiceOutboundRouter.post("/api/voice/outbound", requireTwilioSignature, routingReplay, async (req, res) => {
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
    const { contact, error } = await findOrCreateContactByPhone({ phone: to, source: "manual" });
    if (!contact) throw new Error(`Outbound contact persistence failed: ${error || "missing contact"}`);
    attemptId = await createCallAttempt({
      callSid: req.body.CallSid, agentId, contactId: contact.id, direction: "outbound", to,
    });
  } catch (err) {
    console.error("Outbound reservation failed:", err);
    if (reserved) {
      try { await releaseAgent(agentId, req.body.CallSid); }
      catch (releaseError) { console.error("Reservation cleanup failed:", releaseError); return res.status(503).end(); }
    }
    response.say("Calling is temporarily unavailable. Please try again.");
    response.hangup();
    return sendRoutingTwiml(res, response);
  }

  const dial = response.dial({
    action: publicUrl(`/api/voice/outbound-result?agentId=${encodeURIComponent(agentId)}&attemptId=${attemptId}`),
    callerId: config.twilioPhoneNumber || "+16098065996",
    answerOnBridge: true,
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
