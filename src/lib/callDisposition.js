// Availability and background metadata never determine the browser's call phase.
export function phoneHasInProgressCall(phone) {
  return Boolean(phone?.activeCall || phone?.dialingCall || phone?.incomingCall || phone?.hasCallInProgress?.());
}
export function mayShowCallDisposition(phone, serverInProgress, task) {
  return Boolean(task?.ended_at && task?.agent_leg_sid && !serverInProgress && !phoneHasInProgressCall(phone));
}
export function connectedCallSeconds(attempt) {
  if (attempt.talk_seconds > 0) return attempt.talk_seconds;
  return Math.max(0, Math.floor((Date.parse(attempt.ended_at)-Date.parse(attempt.answered_at))/1000));
}
