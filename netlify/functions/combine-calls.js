import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient } from './_evidenceAccess.js';
import { authorizeRecordingTarget, listTargetRecordings, publicRecording, recordingIdentity, UUID } from './_recordingAccess.js';

export function createCombineCallsHandler({ authenticate = requireClerkAuth, getDb = getEvidenceServiceClient } = {}) {
  return async request => {
    if (!['GET', 'POST'].includes(request.method)) return evidenceJson(405, { error: 'Method not allowed' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb();
      const identity = await recordingIdentity(db, auth);
      const tenantId = identity.tenant.id;
      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams;
        const id = params.get('call_id');
        if (!UUID.test(id || '')) throw new EvidenceError(400, 'Choose a saved call.');
        const { record } = await authorizeRecordingTarget(db, identity, { call_record_id: id });
        if (params.get('mode') === 'candidates') {
          if (!record.contact_id) return evidenceJson(200, { rows: [] });
          const rows = checked(await db.from('v_call_log').select('*').eq('tenant_id', tenantId)
            .eq('contact_id', record.contact_id).order('occurred_at', { ascending: false }).limit(100)) || [];
          return evidenceJson(200, { rows: rows.filter(row => row.call_record_id && row.call_record_id !== id) });
        }
        const children = checked(await db.from('call_records')
          .select('id,call_start,created_at,transcript_raw,transcript_diarized,recording_url,recording_storage_path')
          .eq('tenant_id', tenantId).eq('parent_call_id', id).order('call_start')) || [];
        const rows = [];
        for (const child of children) {
          const target = await authorizeRecordingTarget(db, identity, { call_record_id: child.id });
          const entries = checked(await db.from('v_call_log_entries').select('*')
            .eq('tenant_id', tenantId).eq('call_record_id', child.id).limit(100)) || [];
          const facts = checked(await db.from('v_call_combine_facts').select('talk_seconds')
            .eq('tenant_id', tenantId).eq('id', child.id).single());
          const recording = (await listTargetRecordings(db, identity, target)).find(row => publicRecording(row).available);
          rows.push({ ...child, ...entries[0], call_record_id: child.id,
            occurred_at: entries[0]?.occurred_at || child.call_start || child.created_at,
            recording_url: entries[0]?.recording_url || child.recording_url || recording?.recording_url,
            recording_storage_path: entries[0]?.recording_storage_path || child.recording_storage_path || recording?.storage_path,
            duration_seconds: facts.talk_seconds });
        }
        return evidenceJson(200, { rows });
      }
      let body;
      try { body = await request.json(); } catch { throw new EvidenceError(400, 'Invalid request.'); }
      if (!body || !['preview', 'combine', 'uncombine'].includes(body.action)
        || !UUID.test(body.first_id || '') || !UUID.test(body.second_id || '') || body.first_id === body.second_id) {
        throw new EvidenceError(400, 'Choose two different saved calls.');
      }
      const result = await db.rpc('combine_call_records', {
        p_tenant_id: tenantId, p_actor: auth.userId, p_admin: identity.admin,
        p_action: body.action, p_first: body.first_id, p_second: body.second_id,
        p_confirm_different: body.confirm_different === true,
        p_expected_primary: UUID.test(body.expected_primary || '') ? body.expected_primary : null,
      });
      if (result.error?.code === '42501') throw new EvidenceError(403, 'Call unavailable for this agent.');
      if (result.error?.code === '22023') throw new EvidenceError(409, result.error.message);
      return evidenceJson(200, checked(result));
    } catch (error) { return evidenceFailure(error); }
  };
}
export default createCombineCallsHandler();
