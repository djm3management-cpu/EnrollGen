import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity } from './_recordingAccess.js';

const terminal = new Set(['completed', 'canceled', 'failed', 'busy', 'no-answer']);
const allowed = new Set(['offset', 'limit', 'from', 'to', 'direction', 'disposition', 'agent', 'search', 'ascending']);
const integer = (value, fallback, max) => {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > max) throw new EvidenceError(400, 'Invalid page.');
  return Number(value);
};

// Both view versions are supported. Before 066, suppress script-timer values
// and derive display duration from service-written attempts for visible rows.
export async function measuredCallLogRows(db, tenantId, rows) {
  const inboundIds = [...new Set(rows.map(row => row.inbound_call_id).filter(Boolean))];
  const recordIds = [...new Set(rows.map(row => row.call_record_id).filter(Boolean))];
  const attempts = new Map();
  for (const [field, ids] of [['inbound_call_id', inboundIds], ['call_record_id', recordIds]]) {
    if (!ids.length) continue;
    for (let offset = 0; ; offset += 1000) {
      const data = checked(await db.from('telephony_call_attempts')
        .select('id, inbound_call_id, call_record_id, status, talk_seconds')
        .eq('tenant_id', tenantId).in(field, ids).order('id').range(offset, offset + 999)) || [];
      for (const attempt of data) attempts.set(attempt.id, attempt);
      if (data.length < 1000) break;
    }
  }
  return rows.map(row => {
    // 066's attempt rows already contain authoritative measured durations.
    if (row.attempt_id) return row;
    const evidence = [...attempts.values()].filter(attempt => row.inbound_call_id
      ? attempt.inbound_call_id === row.inbound_call_id
      : attempt.call_record_id === row.call_record_id).filter(attempt => terminal.has(attempt.status));
    return { ...row, duration_seconds: evidence.length
      ? evidence.reduce((total, attempt) => total + Number(attempt.talk_seconds), 0) : null };
  });
}

export function createCallLogHandler({ authenticate = requireClerkAuth, getDb = getEvidenceServiceClient } = {}) {
  return async request => {
    if (request.method !== 'GET') return evidenceJson(405, { error: 'Method not allowed' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb();
      const identity = await recordingIdentity(db, auth);
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => !allowed.has(key))) throw new EvidenceError(400, 'Invalid call-log filter.');
      const offset = integer(params.get('offset'), 0, 1_000_000);
      const limit = integer(params.get('limit'), 50, 500);
      if (!limit) throw new EvidenceError(400, 'Invalid page.');
      const ascending = params.get('ascending');
      if (ascending != null && !['0', '1'].includes(ascending)) throw new EvidenceError(400, 'Invalid sort.');
      let query = db.from('v_call_log').select('*', { count: 'exact' })
        .eq('tenant_id', identity.tenant.id)
        .order('occurred_at', { ascending: ascending === '1' }).order('log_id', { ascending: ascending === '1' })
        .range(offset, offset + limit - 1);
      for (const [parameter, method] of [['from', 'gte'], ['to', 'lt']]) {
        const date = params.get(parameter);
        if (date) {
          if (!/^\d{4}-\d\d-\d\dT/.test(date) || !Number.isFinite(Date.parse(date))) throw new EvidenceError(400, 'Invalid date.');
          query = query[method]('occurred_at', new Date(date).toISOString());
        }
      }
      const direction = params.get('direction');
      if (direction && !['inbound', 'outbound'].includes(direction)) throw new EvidenceError(400, 'Invalid direction.');
      for (const field of ['direction', 'disposition', 'agent']) {
        const value = params.get(field);
        if (value) {
          if (value.length > 100) throw new EvidenceError(400, 'Invalid filter.');
          query = query.eq(field, value);
        }
      }
      const search = params.get('search');
      if (search) {
        if (search.length > 100) throw new EvidenceError(400, 'Search is too long.');
        // Quoted PostgREST values cannot inject another filter expression.
        const like = `%${search.replace(/[\\%_]/g, char => '\\' + char)}%`;
        const quoted = '"' + like.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        query = query.or(`contact_name.ilike.${quoted},contact_phone.ilike.${quoted}`);
      }
      const result = await query;
      const rows = await measuredCallLogRows(db, identity.tenant.id, checked(result) || []);
      return evidenceJson(200, { rows, count: result.count || 0 });
    } catch (error) { return evidenceFailure(error); }
  };
}
export default createCallLogHandler();
