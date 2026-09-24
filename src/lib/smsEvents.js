import { normalizePhoneE164 } from "./phone";
// Tiny pub/sub bridging the telephony /agent WebSocket (which lives in
// InboundCallContext) to whichever message UI is mounted.

const subscribers = new Set();

export function publishSms(event) {
  event = { ...event,
    ...(event?.message ? { message: { ...event.message,
      from_number: normalizePhoneE164(event.message.from_number),
      to_number: normalizePhoneE164(event.message.to_number),
    }} : {}),
    ...(event?.contact ? { contact: { ...event.contact, phone: normalizePhoneE164(event.contact.phone) }} : {}),
  };
  for (const callback of subscribers) {
    try {
      callback(event);
    } catch (err) {
      console.error("[smsEvents] subscriber failed:", err);
    }
  }
}

export function subscribeSms(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
