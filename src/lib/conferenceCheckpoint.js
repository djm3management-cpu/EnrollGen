// A mounted outbound workspace can flush its browser transcript before the
// telephony service switches the canonical record to participant streams.
const checkpoints = new Map();
export function registerConferenceCheckpoint(callSid, checkpoint) {
  checkpoints.set(callSid, checkpoint);
  return () => { if (checkpoints.get(callSid) === checkpoint) checkpoints.delete(callSid); };
}
export async function flushConferenceCheckpoint(callSid) {
  await checkpoints.get(callSid)?.();
}
