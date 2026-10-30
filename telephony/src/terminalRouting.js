// Signed parent status callbacks can arrive before a slow voice webhook has
// claimed its agent. Check after claiming, while the status route records its
// terminal evidence before releasing, so either ordering frees the reservation.
export async function endedParentCall(db, callSid) {
  const { data, error } = await db.from('telephony_events')
    .select('event,payload').eq('twilio_call_sid', callSid)
    .in('event', ['call_completed', 'call_canceled', 'call_failed', 'call_busy', 'call_no-answer'])
    .limit(1).maybeSingle();
  if (error) throw new Error(`Parent call status lookup failed: ${error.message}`);
  return data || null;
}
