import { Router } from "express";
import { config } from "../config.js";
import { supabase } from "../supabase.js";
import { requireTwilioSignature } from "../twilioSecurity.js";

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
    const inboundCall = await findInboundCall(callSid);

    await supabase.from("telephony_events").insert({
      tenant_id: inboundCall?.tenant_id || config.defaultTenantId,
      inbound_call_id: inboundCall?.id || null,
      twilio_call_sid: callSid,
      event: `call_${callStatus}`,
      payload: req.body,
    });

    if (inboundCall && callStatus === "completed") {
      await supabase
        .from("inbound_calls")
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: Number(req.body.CallDuration) || null,
        })
        .eq("id", inboundCall.id);
    }
  } catch (err) {
    console.error("/twilio/status failed:", err);
  }
  return res.status(204).end();
});

// Recording completed: store the Twilio URL immediately, then copy the
// dual-channel audio into Supabase storage (bucket call-recordings,
// path {tenant_id}/{call_sid}.wav).
twilioStatusRouter.post("/twilio/recording", requireTwilioSignature, async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;
  const recordingStatus = req.body.RecordingStatus;

  res.status(204).end();
  if (recordingStatus !== "completed" || !recordingUrl) return;

  try {
    const inboundCall = await findInboundCall(callSid);
    const tenantId = inboundCall?.tenant_id || config.defaultTenantId;

    await supabase.from("telephony_events").insert({
      tenant_id: tenantId,
      inbound_call_id: inboundCall?.id || null,
      twilio_call_sid: callSid,
      event: "recording_completed",
      payload: req.body,
    });

    if (inboundCall) {
      await supabase
        .from("inbound_calls")
        .update({ recording_url: recordingUrl })
        .eq("id", inboundCall.id);
    }

    const audioResponse = await fetch(`${recordingUrl}.wav`, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64"),
      },
    });
    if (!audioResponse.ok) {
      throw new Error(`Twilio recording download failed: ${audioResponse.status}`);
    }
    const audio = Buffer.from(await audioResponse.arrayBuffer());

    const storagePath = `${tenantId}/${callSid}.wav`;
    const { error: uploadError } = await supabase.storage
      .from("call-recordings")
      .upload(storagePath, audio, { contentType: "audio/wav", upsert: true });
    if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

    if (inboundCall) {
      await supabase
        .from("inbound_calls")
        .update({ recording_storage_path: storagePath })
        .eq("id", inboundCall.id);

      if (inboundCall.call_record_id) {
        await supabase
          .from("call_records")
          .update({ recording_url: recordingUrl })
          .eq("id", inboundCall.call_record_id);
      }
    }
  } catch (err) {
    console.error("/twilio/recording processing failed:", err);
  }
});
