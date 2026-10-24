import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity, authorizeRecordingTarget, listTargetRecordings, publicRecording, recordingMediaGrant } from './_recordingAccess.js';
import { recordingComplianceGrant } from './_recordingCompliance.js';

async function availableRecordingCalls(db, identity, offset) {
  const candidates = checked(await db.from('v_call_log').select('*')
    .eq('tenant_id', identity.tenant.id).order('occurred_at', { ascending: false })
    .order('log_id', { ascending: false }).range(offset, offset + 99)) || [];
  const calls = [];
  // Use the same protected targets and legacy/provider fallbacks as playback.
  // An agent's writable CRM fields alone never grant recording access.
  for (let start = 0; start < candidates.length; start += 8) {
    const batch = await Promise.all(candidates.slice(start, start + 8).map(async row => {
      const inputs = row.attempt_id ? [{ attempt_id: row.attempt_id }] : [
        row.call_record_id && { call_record_id: row.call_record_id },
        row.inbound_call_id && { inbound_call_id: row.inbound_call_id },
      ].filter(Boolean);
      for (const input of inputs) {
        let target;
        try { target = await authorizeRecordingTarget(db, identity, input); }
        catch (error) { if (error instanceof EvidenceError && error.status === 403) continue; throw error; }
        const recordings = (await listTargetRecordings(db, identity, target)).map(publicRecording).filter(recording => recording.available);
        if (!recordings.length) continue;
        return { log_id: row.log_id, ...input, contact_name: row.contact_name, contact_phone: row.contact_phone,
          occurred_at: row.occurred_at, direction: row.direction, duration_seconds: row.duration_seconds, agent: row.agent,
          recording_available: true, recording_count: recordings.length,
          provider_available: recordings.some(recording => recording.provider_available) };
      }
      return null;
    }));
    calls.push(...batch.filter(Boolean));
  }
  return { calls, next_offset: candidates.length === 100 ? offset + 100 : null };
}

export function createRecordingsHandler({ authenticate = requireClerkAuth, getDb = getEvidenceServiceClient, env = process.env } = {}) {
  return async request => {
    if (!['GET', 'POST'].includes(request.method)) return evidenceJson(405, { error: 'Method not allowed' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb(); const identity = await recordingIdentity(db, auth);
      const params = new URL(request.url).searchParams;
      if (request.method === 'GET' && params.get('catalog') === '1') {
        if ([...params.keys()].some(key => !['catalog', 'offset'].includes(key))) throw new EvidenceError(400, 'Invalid recordings filter.');
        const rawOffset = params.get('offset') || '0';
        if (!/^\d+$/.test(rawOffset) || Number(rawOffset) > 1_000_000) throw new EvidenceError(400, 'Invalid offset.');
        return evidenceJson(200, await availableRecordingCalls(db, identity, Number(rawOffset)));
      }
      if (request.method === 'GET' && params.get('missing') === '1') {
        const offset = Math.max(0, Math.min(100_000, Number(params.get('offset')) || 0));
        if (!Number.isInteger(offset)) throw new EvidenceError(400, 'Invalid offset.');
        const candidates = checked(await db.from('calls_missing_recordings').select('*')
          .eq('tenant_id', identity.tenant.id).order('occurred_at', { ascending: false }).range(offset, offset + 99)) || [];
        const calls = [];
        for (const row of candidates) {
          if (!identity.admin) {
            try {
              if (row.call_record_id || row.inbound_call_id) await authorizeRecordingTarget(db, identity, row.call_record_id
                ? { call_record_id: row.call_record_id } : { inbound_call_id: row.inbound_call_id });
              else if (!identity.slug || row.agent_id !== identity.slug) continue;
            } catch (error) { if (error instanceof EvidenceError && error.status === 403) continue; throw error; }
          }
          calls.push({ attempt_id: row.attempt_id, inbound_call_id: row.inbound_call_id, call_record_id: row.call_record_id,
            call_sid: row.parent_call_sid, direction: row.direction, occurred_at: row.occurred_at, reason: row.reason });
        }
        let unmatched = [];
        if (identity.admin) {
          unmatched = checked(await db.from('recording_ingestion').select('id, callback_call_sid, copy_status, first_seen_at')
            .eq('tenant_id', identity.tenant.id).is('call_record_id', null).order('first_seen_at', { ascending: false }).limit(50)) || [];
        }
        return evidenceJson(200, { calls, unmatched, next_offset: candidates.length === 100 ? offset + 100 : null });
      }
      let input;
      if (request.method === 'POST') {
        try { input = await request.json(); } catch { throw new EvidenceError(400, 'Invalid JSON body.'); }
        if (!input || Array.isArray(input) || Object.keys(input).some(key =>
          !['call_record_id', 'inbound_call_id', 'attempt_id', 'recording_id', 'download', 'action', 'source', 'format'].includes(key))) {
          throw new EvidenceError(400, 'Invalid recording request.');
        }
        if (!['media', 'retry', 'conversly'].includes(input.action)) throw new EvidenceError(400, 'Invalid recording action.');
        if (input.action === 'conversly') {
          if (!identity.admin) throw new EvidenceError(403, 'Only organization admins can create Conversly links.');
          if (typeof input.recording_id !== 'string' || !input.recording_id) throw new EvidenceError(400, 'Choose one recording.');
          if (input.format != null && !['wav', 'mp3'].includes(input.format)) throw new EvidenceError(400, 'Choose WAV or MP3.');
        } else if (input.format != null) throw new EvidenceError(400, 'Format is only supported for Conversly links.');
        if (input.source != null && input.source !== 'twilio') throw new EvidenceError(400, 'Invalid recording source.');
        if (input.download != null && typeof input.download !== 'boolean') throw new EvidenceError(400, 'Invalid download option.');
      } else input = { call_record_id: params.get('call_record_id'), inbound_call_id: params.get('inbound_call_id'), attempt_id: params.get('attempt_id') };
      const target = await authorizeRecordingTarget(db, identity, input);
      const rows = await listTargetRecordings(db, identity, target);
      if (request.method === 'GET') return evidenceJson(200, { recordings: rows.map(publicRecording), can_mint_conversly: identity.admin });
      const row = input.recording_id ? rows.find(r => r.id === input.recording_id)
        : rows.find(r => r.copy_status === 'stored') || rows.find(r => publicRecording(r).available);
      if (!row) throw new EvidenceError(404, 'Recording is unavailable.');
      if (input.action === 'conversly') return evidenceJson(200,
        await recordingComplianceGrant(db, identity, row, { format: input.format, env }));
      if (input.action === 'retry') {
        if (row.id.startsWith('legacy:') || row.provider_status !== 'completed') throw new EvidenceError(400, 'This recording cannot be retried.');
        checked(await db.from('recording_ingestion').update({ copy_status: 'pending', next_attempt_at: new Date().toISOString(),
          last_error_code: null, updated_at: new Date().toISOString() }).eq('id', row.id).eq('tenant_id', identity.tenant.id)
          .in('copy_status', ['pending', 'retry', 'failed']));
        return evidenceJson(200, { queued: true });
      }
      return evidenceJson(200, await recordingMediaGrant(db, identity, row, { download: input.download === true, forceProvider: input.source === 'twilio', env }));
    } catch (error) { return evidenceFailure(error); }
  };
}
export default createRecordingsHandler();
