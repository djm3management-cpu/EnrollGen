import { Router } from "express";
import twilio from "twilio";
import { config, publicUrl, mediaStreamUrl } from "../config.js";
import { supabase } from "../supabase.js";
import { requireTwilioSignature } from "../twilioSecurity.js";
import { findOrCreateContactByPhone, latestLeadIntel, logContactActivity } from "../contacts.js";
import { claimNextAvailableAgent, releaseAgent } from "../availability.js";

import { routingReplay, sendRoutingTwiml as sendTwiml } from "../routingReplay.js";

const VoiceResponse = twilio.twiml.VoiceResponse;

export const twilioVoiceRouter = Router();

function voicemailTwiml() {
  const response = new VoiceResponse();
  response.say(
    { voice: "Polly.Joanna" },
    "Thank you for calling. All of our licensed agents are currently assisting other callers. " +
      "Please leave your name, phone number, and a brief message after the tone, and an agent will call you back shortly."
  );
  response.record({
    maxLength: 120,
    playBeep: true,
    recordingStatusCallback: publicUrl("/twilio/recording"),
    recordingStatusCallbackEvent: "completed",
  });
  response.hangup();
  return response;
}

async function logEvent({ inboundCallId, callSid, event, payload }) {
  const { error } = await supabase.from("telephony_events").insert({
    tenant_id: config.defaultTenantId,
    inbound_call_id: inboundCallId || null,
    twilio_call_sid: callSid || null,
    event,
    payload: payload || {},
  });
  if (error) console.error("telephony_events insert failed:", error.message);
}

function dialAgentTwiml({ agent, inboundCall, contact, intel, triedAgentIds }) {
  const response = new VoiceResponse();

  if (triedAgentIds.length) response.stop().stream({ name: "agent-transcription" });
  const start = response.start();
  const stream = start.stream({ name: "agent-transcription", url: mediaStreamUrl(), track: "both_tracks" });
  stream.parameter({ name: "inboundCallId", value: inboundCall.id });
  stream.parameter({ name: "agentId", value: agent.agent_id });

  const tried = [...triedAgentIds, agent.agent_id].join(",");
  const dial = response.dial({
    timeout: config.dialTimeoutSeconds,
    answerOnBridge: true,
    action: publicUrl(
      `/twilio/dial-result?inboundCallId=${inboundCall.id}&tried=${encodeURIComponent(tried)}`
    ),
    record: "record-from-answer-dual",
    recordingStatusCallback: publicUrl("/twilio/recording"),
    recordingStatusCallbackEvent: "completed",
  });

  const client = dial.client({
    statusCallback: publicUrl(`/twilio/agent-status?agentId=${encodeURIComponent(agent.agent_id)}`),
    statusCallbackEvent: ["completed"],
  });
  client.identity(agent.agent_id);
  const params = {
    inboundCallId: inboundCall.id,
    contactId: contact?.id || "",
    callerPhone: inboundCall.from_number || "",
    callerName: [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
    leadScore: intel?.lead_score != null ? String(intel.lead_score) : "",
    churnRisk: intel?.churn_risk || "",
    vendorSource: intel?.vendor_source || "",
  };
  for (const [name, value] of Object.entries(params)) {
    client.parameter({ name, value });
  }
  return response;
}

// Inbound call from the FMO transfer hits here first.
twilioVoiceRouter.post("/twilio/voice", requireTwilioSignature, routingReplay, async (req, res) => {
  const callSid = req.body.CallSid;
  const from = req.body.From;
  const to = req.body.To;
  let claimedAgent = null;

  try {
    const { contact } = await findOrCreateContactByPhone({
      phone: from,
      source: "fmo_transfer",
    });

    // Claim (not just read) the agent here: marks them busy the instant
    // they're selected so a second call arriving in the same instant
    // cannot also be routed to them before they've even started ringing.
    const agent = await claimNextAvailableAgent({ callSid });
    claimedAgent = agent;

    const { data: inboundCall, error } = await supabase
      .from("inbound_calls")
      .insert({
        tenant_id: config.defaultTenantId,
        contact_id: contact?.id || null,
        twilio_call_sid: callSid,
        from_number: from,
        to_number: to,
        routed_agent_id: agent?.agent_id || null,
        status: agent ? "ringing" : "voicemail",
      })
      .select("*")
      .single();
    if (error) throw new Error(`inbound_calls insert failed: ${error.message}`);

    await logEvent({
      inboundCallId: inboundCall.id,
      callSid,
      event: agent ? "routing_agent_selected" : "routing_no_agents",
      payload: { from, to, agent_id: agent?.agent_id || null },
    });

    if (contact?.id) {
      await logContactActivity({
        contactId: contact.id,
        type: "call",
        refId: inboundCall.id,
        summary: `Inbound call from ${from}`,
      });
    }

    if (!agent) {
      return sendTwiml(res, voicemailTwiml());
    }

    const intel = contact?.id ? await latestLeadIntel(contact.id) : null;
    return sendTwiml(
      res,
      dialAgentTwiml({ agent, inboundCall, contact, intel, triedAgentIds: [] })
    );
  } catch (err) {
    console.error("/twilio/voice failed:", err);
    // Don't strand a claimed agent as busy if we never actually dialed
    // them (e.g. the inbound_calls insert failed after the claim).
    if (claimedAgent) {
      try { await releaseAgent(claimedAgent.agent_id, callSid); }
      catch (releaseError) { console.error("Reservation cleanup failed:", releaseError); return res.status(503).end(); }
    }
    return sendTwiml(res, voicemailTwiml());
  }
});

// Dial outcome: agent answered, declined, or timed out. Reroute to the
// next available agent, or voicemail when nobody is left.
twilioVoiceRouter.post("/twilio/dial-result", requireTwilioSignature, routingReplay, async (req, res) => {
  const inboundCallId = req.query.inboundCallId;
  const tried = String(req.query.tried || "").split(",").filter(Boolean);
  const dialStatus = req.body.DialCallStatus;
  const callSid = req.body.CallSid;
  let claimedAgent = null;

  try {
    await logEvent({
      inboundCallId,
      callSid,
      event: "dial_result",
      payload: { dial_status: dialStatus, tried },
    });

    if (dialStatus === "completed" || dialStatus === "answered" || dialStatus === "canceled") {
      await releaseAgent(tried[tried.length - 1], callSid);
      await supabase
        .from("inbound_calls")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", inboundCallId);
      const response = new VoiceResponse();
      response.hangup();
      return sendTwiml(res, response);
    }

    const { data: inboundCall } = await supabase
      .from("inbound_calls")
      .select("*")
      .eq("id", inboundCallId)
      .maybeSingle();
    if (!inboundCall || inboundCall.twilio_call_sid !== callSid) return sendTwiml(res, voicemailTwiml());
    if (inboundCall.ended_at) {
      await releaseAgent(null, callSid);
      const response = new VoiceResponse();
      response.hangup();
      return sendTwiml(res, response);
    }

    // Release only this call's reservation; late callbacks cannot free a newer call.
    const justTriedAgentId = tried[tried.length - 1];
    if (justTriedAgentId) await releaseAgent(justTriedAgentId, callSid);

    const nextAgent = await claimNextAvailableAgent({ callSid, exclude: tried });
    claimedAgent = nextAgent;

    if (!nextAgent) {
      await supabase
        .from("inbound_calls")
        .update({ status: "voicemail" })
        .eq("id", inboundCallId);
      return sendTwiml(res, voicemailTwiml());
    }

    const { error: routingError } = await supabase
      .from("inbound_calls")
      .update({ status: "ringing", routed_agent_id: nextAgent.agent_id })
      .eq("id", inboundCallId);
    if (routingError) throw new Error(`Routing update failed: ${routingError.message}`);

    const { data: contact } = inboundCall.contact_id
      ? await supabase
          .from("contacts")
          .select("*")
          .eq("id", inboundCall.contact_id)
          .maybeSingle()
      : { data: null };
    const intel = contact?.id ? await latestLeadIntel(contact.id) : null;

    return sendTwiml(
      res,
      dialAgentTwiml({
        agent: nextAgent,
        inboundCall,
        contact,
        intel,
        triedAgentIds: tried,
      })
    );
  } catch (err) {
    console.error("/twilio/dial-result failed:", err);
    if (claimedAgent) {
      try { await releaseAgent(claimedAgent.agent_id, callSid); }
      catch (releaseError) { console.error("Reservation cleanup failed:", releaseError); return res.status(503).end(); }
    }
    return sendTwiml(res, voicemailTwiml());
  }
});
