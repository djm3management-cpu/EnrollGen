// Tiny pub/sub bridging the telephony /agent WebSocket (which lives in
// InboundCallContext) to whichever message UI is mounted.

const subscribers = new Set();

export function publishSms(event) {
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
