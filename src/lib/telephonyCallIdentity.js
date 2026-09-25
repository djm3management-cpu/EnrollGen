// Inbound SDK CallSid is the child leg: prefer the explicitly supplied parent.
// Outbound CallSid becomes available on accept. Retain it through disconnect.
export function telephonyCallIdentity(active) {
  if(!active)return {};
  const sid=active.params?.twilioCallSid || active.call?.parameters?.CallSid || active.call?.parameters?.CallSID;
  return { telephonyCall:true, twilioCallSid:/^CA[0-9a-f]{32}$/i.test(sid || '')?sid:null };
}
