import { Router } from "express";
import twilio from "twilio";
import { config, publicUrl } from "../config.js";
import { supabase } from "../supabase.js";
import { requireTwilioSignature } from "../twilioSecurity.js";
import { requireClerkUser } from "../clerkAuth.js";
import { findOrCreateContactByPhone, logContactActivity } from "../contacts.js";
import { sendToAgent } from "../media/agentSocket.js";
import { validateOutboundSms } from "../piiValidation.js";

export const smsRouter = Router();

const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);

const EXTENSION_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
  "text/vcard": "vcf",
};

function extensionFor(contentType) {
  return EXTENSION_BY_TYPE[contentType] || "bin";
}

// Twilio delivery statuses collapse into the messages.status CHECK set.
function normalizeTwilioStatus(twilioStatus) {
  switch (twilioStatus) {
    case "queued":
    case "accepted":
    case "scheduled":
      return "queued";
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "failed":
    case "undelivered":
    case "canceled":
      return "failed";
    case "received":
      return "received";
    default:
      return null;
  }
}

async function storeInboundMedia({ tenantId, messageId, body }) {
  const count = Number(body.NumMedia) || 0;
  for (let index = 0; index < count; index += 1) {
    const mediaUrl = body[`MediaUrl${index}`];
    const contentType = body[`MediaContentType${index}`] || "application/octet-stream";
    if (!mediaUrl) continue;

    const mediaRow = {
      tenant_id: tenantId,
      message_id: messageId,
      media_url: mediaUrl,
      content_type: contentType,
      storage_path: null,
    };

    try {
      const response = await fetch(mediaUrl, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64"),
        },
      });
      if (!response.ok) throw new Error(`media download failed: ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());

      const storagePath = `${tenantId}/${messageId}/${index}.${extensionFor(contentType)}`;
      const { error: uploadError } = await supabase.storage
        .from("message-media")
        .upload(storagePath, data, { contentType, upsert: true });
      if (uploadError) throw new Error(`media upload failed: ${uploadError.message}`);
      mediaRow.storage_path = storagePath;
    } catch (err) {
      // Keep the Twilio URL so the attachment is not lost entirely.
      console.error(`inbound media ${index} for message ${messageId}:`, err.message);
    }

    const { error: insertError } = await supabase.from("message_media").insert(mediaRow);
    if (insertError) console.error("message_media insert failed:", insertError.message);
  }
}

// Inbound SMS/MMS from the Twilio number.
smsRouter.post("/twilio/sms", requireTwilioSignature, async (req, res) => {
  try {
    const { contact, error: contactError } = await findOrCreateContactByPhone({
      phone: req.body.From,
      source: "sms_inbound",
    });
    if (contactError || !contact) {
      throw new Error(contactError || "could not resolve contact for inbound SMS");
    }

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        tenant_id: contact.tenant_id,
        contact_id: contact.id,
        direction: "inbound",
        channel: "sms",
        from_number: req.body.From,
        to_number: req.body.To,
        body: req.body.Body || "",
        twilio_message_sid: req.body.MessageSid || null,
        status: "received",
      })
      .select("*")
      .single();
    if (messageError) throw new Error(`message insert failed: ${messageError.message}`);

    await storeInboundMedia({ tenantId: contact.tenant_id, messageId: message.id, body: req.body });

    await logContactActivity({
      contactId: contact.id,
      tenantId: contact.tenant_id,
      type: "sms",
      refId: message.id,
      summary: `SMS received: ${(req.body.Body || "(media)").slice(0, 100)}`,
    });

    // Real-time push goes to the assigned agent only. Unassigned
    // contacts surface through the tenant-wide unread badge instead.
    if (contact.assigned_agent_id) {
      sendToAgent(contact.assigned_agent_id, { type: "sms", message, contact });
    }
  } catch (err) {
    console.error("/twilio/sms failed:", err);
  }
  return res.type("text/xml").send("<Response/>");
});

// Delivery status callbacks for outbound messages.
smsRouter.post("/twilio/sms-status", requireTwilioSignature, async (req, res) => {
  res.status(204).end();
  const sid = req.body.MessageSid || req.body.SmsSid;
  const status = normalizeTwilioStatus(req.body.MessageStatus || req.body.SmsStatus);
  if (!sid || !status) return;
  const { error } = await supabase
    .from("messages")
    .update({ status })
    .eq("twilio_message_sid", sid);
  if (error) console.error("sms status update failed:", error.message);
});

// Outbound send from the agent browser.
// Body: { contact_id, body, media_urls?, agent_id? }
smsRouter.post("/api/sms/send", async (req, res) => {
  const clerkUser = await requireClerkUser(req, res);
  if (!clerkUser) return;

  const { contact_id: contactId, body, media_urls: mediaUrls, agent_id: agentId } = req.body || {};
  const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0;
  if (!contactId || (!body?.trim() && !hasMedia)) {
    return res.status(400).json({ error: "contact_id and body (or media_urls) are required" });
  }
  if (!config.twilioPhoneNumber) {
    return res.status(500).json({ error: "TWILIO_PHONE_NUMBER is not configured" });
  }
  if (body?.trim()) {
    const validation = validateOutboundSms(body);
    if (validation.blocked) {
      return res.status(422).json({ error: validation.reason });
    }
  }

  try {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, tenant_id, phone, do_not_call")
      .eq("id", contactId)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    if (!contact.phone) return res.status(422).json({ error: "Contact has no phone number" });
    if (contact.do_not_call) {
      return res.status(403).json({ error: "Contact is flagged do not call" });
    }

    const twilioMessage = await twilioClient.messages.create({
      from: config.twilioPhoneNumber,
      to: contact.phone,
      body: body?.trim() || undefined,
      ...(hasMedia ? { mediaUrl: mediaUrls } : {}),
      statusCallback: publicUrl("/twilio/sms-status"),
    });

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        tenant_id: contact.tenant_id,
        contact_id: contact.id,
        direction: "outbound",
        channel: "sms",
        from_number: config.twilioPhoneNumber,
        to_number: contact.phone,
        body: body?.trim() || "",
        twilio_message_sid: twilioMessage.sid,
        status: normalizeTwilioStatus(twilioMessage.status) || "queued",
        agent_id: agentId || null,
      })
      .select("*")
      .single();
    if (messageError) throw new Error(`message insert failed: ${messageError.message}`);

    if (hasMedia) {
      const mediaRows = mediaUrls.map((url) => ({
        tenant_id: contact.tenant_id,
        message_id: message.id,
        media_url: url,
        content_type: null,
        storage_path: null,
      }));
      const { error: mediaError } = await supabase.from("message_media").insert(mediaRows);
      if (mediaError) console.error("outbound media insert failed:", mediaError.message);
    }

    await logContactActivity({
      contactId: contact.id,
      tenantId: contact.tenant_id,
      type: "sms",
      refId: message.id,
      summary: `SMS sent: ${(body || "(media)").slice(0, 100)}`,
    });

    return res.status(201).json({ message });
  } catch (err) {
    console.error("/api/sms/send failed:", err);
    return res.status(500).json({ error: err.message || "send failed" });
  }
});
