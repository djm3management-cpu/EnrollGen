import { Router } from "express";
import twilio from "twilio";
import { config } from "../config.js";
import { requireTwilioSignature } from "../twilioSecurity.js";
import { normalizePhoneE164 } from "../phone.js";

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
voiceOutboundRouter.post("/api/voice/outbound", requireTwilioSignature, (req, res) => {
  const to = normalizePhoneE164(req.body.PhoneNumber);
  const response = new VoiceResponse();

  if (!to) {
    response.say({ voice: "Polly.Joanna" }, "The number dialed is invalid.");
    response.hangup();
    return sendTwiml(res, response);
  }

  const dial = response.dial({
    callerId: config.twilioPhoneNumber || "+16098065996",
    answerOnBridge: true,
  });
  dial.number(to);
  return sendTwiml(res, response);
});
