import { checked } from './_evidenceAccess.js';

// Called only after authorizeRecordingTarget. Never grant media here; the
// existing per-recording endpoint independently authorizes each download.
export async function conferencePlayback(db, identity, target, recordings) {
  const callId = target.field === 'call_record_id' ? target.id : target.record.call_record_id;
  if (!callId) return null;
  const result = await db.from('call_conferences').select('call_id,tenant_id,original_agent_id,started_at,ended_at')
    .eq('call_id', callId).eq('tenant_id', identity.tenant.id).maybeSingle();
  if (['42P01', 'PGRST205'].includes(result.error?.code)) return null;
  const room = checked(result);
  if (!room) return null;
  const participants = checked(await db.from('call_participants').select('twilio_call_sid,role,speaker,agent_id')
    .eq('call_id', callId)) || [];
  const record = checked(await db.from('call_records').select('metadata').eq('id', callId)
    .eq('tenant_id', identity.tenant.id).single());
  return { callId, startedAt: room.started_at, endedAt: room.ended_at,
    events: (record.metadata?.conference_events || []).filter(e =>
      ['customer_hold_changed', 'warm_dialed', 'warm_completed', 'warm_canceled'].includes(e.event)),
    segments: recordings.filter(r => r.provider_status !== 'absent' && (r.storage_path || r.recording_sid)).map(r => {
      const p = participants.find(p => p.twilio_call_sid === r.callback_call_sid);
      return { id: r.id, startedAt: r.provider_created_at || null, duration: r.recording_duration_seconds,
        role: p?.role || 'legacy', originalAgent: p?.agent_id === room.original_agent_id,
        providerAvailable: Boolean(r.recording_sid && r.account_sid) };
    }) };
}
