import { Router } from 'express';
import { requireClerkUser } from '../clerkAuth.js';
import { supabase } from '../supabase.js';

const SID = /^CA[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = new Set(['incoming', 'incoming_rejected_busy', 'accept_requested', 'accepted', 'declined',
  'end_requested', 'disconnected', 'canceled', 'rejected', 'call_error', 'device_created',
  'registered', 'unregistered', 'device_error', 'device_retired', 'device_destroyed',
  'registration_canceled', 'registration_failed', 'token_refresh_failed', 'remote_audio_unavailable']);
const PHASES = new Set(['pending', 'connecting', 'ringing', 'open', 'closed', 'reconnecting']);
const REASONS = new Set(['retired_call_ended', 'registration_canceled_idle', 'live_device_preserved',
  'effect_cleanup_idle', 'effect_cleanup_unused_device', 'effect_cleanup_live', 'agent_action']);

export const voiceEventsRouter = Router();
// Browser reports are diagnostic evidence, never authoritative call state.
// Resolve actor and call ownership on the server; ignore arbitrary extra fields.
voiceEventsRouter.post('/api/voice/events', async (req, res) => {
  const user = await requireClerkUser(req, res);
  if (!user) return;
  try {
    const { data: agent, error } = await supabase.from('tenant_agents')
      .select('agent_slug,tenant_id').eq('clerk_user_id', user.sub).eq('is_active', true).maybeSingle();
    if (error) throw error;
    if (!agent || req.body?.agent_id !== agent.agent_slug) return res.status(403).end();
    const events = req.body?.events;
    if (!Array.isArray(events) || !events.length || events.length > 20) return res.status(400).end();
    const rows = [];
    for (const item of events) {
      if (!item || !EVENTS.has(item.event)) return res.status(400).end();
      let attempt = null;
      if (item.call_sid != null) {
        if (typeof item.call_sid !== 'string' || !SID.test(item.call_sid)) return res.status(400).end();
        const { data, error } = await supabase.from('telephony_call_attempts')
          .select('parent_call_sid,child_call_sid,inbound_call_id,direction').eq('tenant_id', agent.tenant_id)
          .eq('agent_id', agent.agent_slug).or(`parent_call_sid.eq.${item.call_sid},child_call_sid.eq.${item.call_sid}`)
          .limit(1).maybeSingle();
        if (error) throw error;
        // A stale client cannot attribute events to another agent's call.
        if (!data) continue;
        attempt = data;
      }
      const sdkSid = typeof item.sdk_call_sid === 'string' && SID.test(item.sdk_call_sid) && attempt &&
        [attempt.parent_call_sid, attempt.child_call_sid].includes(item.sdk_call_sid) ? item.sdk_call_sid : null;
      rows.push({ tenant_id: agent.tenant_id, inbound_call_id: attempt?.inbound_call_id || null,
        twilio_call_sid: attempt?.parent_call_sid || null, event: `browser_voice_${item.event}`,
        payload: { source: 'browser_diagnostic', agent_id: agent.agent_slug,
          client_session_id: typeof req.body.client_session_id === 'string' && UUID.test(req.body.client_session_id)
            ? req.body.client_session_id : null,
          client_at: typeof item.client_at === 'string' && item.client_at.length <= 40 && Number.isFinite(Date.parse(item.client_at))
            ? new Date(item.client_at).toISOString() : null,
          sdk_call_sid: sdkSid, direction: attempt?.direction || null,
          device_sequence: Number.isInteger(item.device_sequence) && item.device_sequence > 0 && item.device_sequence <= 10000
            ? item.device_sequence : null,
          phase: PHASES.has(item.phase) ? item.phase : null,
          reason: REASONS.has(item.reason) ? item.reason : null,
          error_code: Number.isInteger(item.error_code) && item.error_code >= 10000 && item.error_code <= 99999 ? item.error_code : null } });
    }
    if (rows.length) {
      const { error } = await supabase.from('telephony_events').insert(rows);
      if (error) throw error;
    }
    return res.status(204).end();
  } catch {
    console.error('Browser voice telemetry persistence failed');
    return res.status(503).end();
  }
});
