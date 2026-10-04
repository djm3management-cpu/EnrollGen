import { enqueueBillingCallback } from "../paragonBilling.js";
import { createRecordingCallback } from "../recordings.js";
import { Router } from "express";
import { config } from "../config.js";
import { supabase } from "../supabase.js";
import { requireTwilioSignature } from "../twilioSecurity.js";

import { releaseAgent } from "../availability.js";
import { recordCallbackEvidence, finishInboundCall, terminalStatuses } from "../answerAttribution.js";

export const twilioStatusRouter = Router();

async function findInboundCall(callSid) {
  if (!callSid) return null;
  const { data } = await supabase
    .from("inbound_calls")
    .select("id, tenant_id, call_record_id, twilio_call_sid")
    .eq("twilio_call_sid", callSid)
    .maybeSingle();
  return data;
}

// Call lifecycle status callbacks (initiated, ringing, answered, completed).
twilioStatusRouter.post("/twilio/status", requireTwilioSignature, async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  try {
    await enqueueBillingCallback(supabase,config,req.body);
    if (["completed", "canceled", "failed", "busy", "no-answer"].includes(callStatus)) {
      await releaseAgent(null, callSid);
    }
    const inboundCall = await findInboundCall(callSid);

    await supabase.from("telephony_events").insert({
      tenant_id: inboundCall?.tenant_id || config.defaultTenantId,
      inbound_call_id: inboundCall?.id || null,
      twilio_call_sid: callSid,
      event: `call_${callStatus}`,
      payload: req.body,
    });

    if (inboundCall && terminalStatuses.has(callStatus)) {
      await finishInboundCall(callSid, callStatus, req.body);
      const finalized = await supabase.rpc("finalize_telephony_transcript", { p_call_sid: callSid });
      if (finalized.error) throw finalized.error;
    }
  } catch (err) {
    console.error("/twilio/status failed:", err);
    return res.status(503).end();
  }
  return res.status(204).end();
});

// Child-leg completion also fires when the caller hangs up before Dial's action.
twilioStatusRouter.post("/twilio/agent-status", requireTwilioSignature, async (req, res) => {
  try {
    await enqueueBillingCallback(supabase,config,req.body);
    await recordCallbackEvidence(req, "child");
    if (["completed", "canceled", "failed", "busy", "no-answer"].includes(req.body.CallStatus)) {
      await releaseAgent(req.query.agentId, req.body.ParentCallSid);
    }
    return res.status(204).end();
  } catch (err) {
    console.error("Agent completion failed:", err);
    return res.status(503).end();
  }
});

// Persist the signed callback before ACK. The leased worker performs copying.
twilioStatusRouter.post("/twilio/recording", requireTwilioSignature,
  createRecordingCallback({ db: supabase, config }));
