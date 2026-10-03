import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity, authorizeRecordingTarget, listTargetRecordings, publicRecording, recordingMediaGrant } from './_recordingAccess.js';

export function createRecordingsHandler({ authenticate = requireClerkAuth, getDb = getEvidenceServiceClient, env = process.env } = {}) {
  return async request => {
    if (!['GET', 'POST'].includes(request.method)) return evidenceJson(405, { error: 'Method not allowed' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb(); const identity = await recordingIdentity(db, auth);
      const params = new URL(request.url).searchParams;
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
          !['call_record_id', 'inbound_call_id', 'recording_id', 'download', 'action', 'source'].includes(key))) {
          throw new EvidenceError(400, 'Invalid recording request.');
        }
        if (!['media', 'retry'].includes(input.action)) throw new EvidenceError(400, 'Invalid recording action.');
        if (input.source != null && input.source !== 'twilio') throw new EvidenceError(400, 'Invalid recording source.');
        if (input.download != null && typeof input.download !== 'boolean') throw new EvidenceError(400, 'Invalid download option.');
      } else input = { call_record_id: params.get('call_record_id'), inbound_call_id: params.get('inbound_call_id') };
      const target = await authorizeRecordingTarget(db, identity, input);
      const rows = await listTargetRecordings(db, identity, target);
      if (request.method === 'GET') return evidenceJson(200, { recordings: rows.map(publicRecording) });
      const row = input.recording_id ? rows.find(r => r.id === input.recording_id)
        : rows.find(r => r.copy_status === 'stored') || rows.find(r => publicRecording(r).available);
      if (!row) throw new EvidenceError(404, 'Recording is unavailable.');
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
