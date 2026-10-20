import { telephonyCallIdentity } from './telephonyCallIdentity.js';

// Keep the completed call mounted for disposition. Only a different accepted
// call replaces the cockpit, including its notes, transcript and session refs.
export function createCallSessionBoundary() {
  let key = 'manual';
  const calls = new WeakMap();
  let sequence = 0;
  return activeCall => {
    if (!activeCall) return key;
    const sid = telephonyCallIdentity(activeCall).twilioCallSid;
    const call = activeCall.call || activeCall;
    if (!calls.has(call)) calls.set(call, sid || `call-${++sequence}`);
    key = calls.get(call);
    return key;
  };
}
