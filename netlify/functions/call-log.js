import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity } from './_recordingAccess.js';

const terminal = new Set(['completed', 'canceled', 'failed', 'busy', 'no-answer']);
const allowed = new Set(['offset', 'limit', 'from', 'to', 'direction', 'disposition', 'agent', 'search', 'ascending', 'contact_id', 'record_ids', 'outcome']);
const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
    if (row.attempt_id || row.combined_count > 0) return row;
    const evidence = [...attempts.values()].filter(attempt => row.inbound_call_id
      ? attempt.inbound_call_id === row.inbound_call_id
      : attempt.call_record_id === row.call_record_id).filter(attempt => terminal.has(attempt.status));
    return { ...row, duration_seconds: evidence.length
      ? evidence.reduce((total, attempt) => total + Number(attempt.talk_seconds), 0) : null };
  });
}

// v_call_log supports older schemas without a call_outcome column. Resolve the
// saved outcome from call_records first, in bounded batches to keep REST URLs
// small, then merge the matching calls before applying the requested page.
async function outcomeCallLogResult(db, tenantId, outcome, query, offset, limit, ascending) {
  const needed = offset + limit;
  const compare = (a, b) => {
    const dateOrder = (Date.parse(a.occurred_at) || 0) - (Date.parse(b.occurred_at) || 0);
    const idOrder = a.log_id < b.log_id ? -1 : a.log_id > b.log_id ? 1 : 0;
    return (dateOrder || idOrder) * (ascending ? 1 : -1);
  };
  let candidates = [], count = 0;
  for (let recordOffset = 0; ; recordOffset += 100) {
    const records = checked(await db.from('call_records').select('id')
      .eq('tenant_id', tenantId).eq('call_outcome', outcome).order('id')
      .range(recordOffset, recordOffset + 99)) || [];
    if (!records.length) break;
    const ids = records.map(record => record.id);
    for (let callOffset = 0; callOffset < needed; callOffset += 500) {
      const size = Math.min(500, needed - callOffset);
      const result = await query().in('call_record_id', ids).range(callOffset, callOffset + size - 1);
      const rows = checked(result) || [];
      if (!callOffset) count += result.count || 0;
      candidates = [...candidates, ...rows].sort(compare).slice(0, needed);
      if (rows.length < size) break;
    }
    if (records.length < 100) break;
  }
  return { data: candidates.slice(offset, needed), count, error: null };
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
      const filters = [];
      const query = () => filters.reduce((current, apply) => apply(current), db.from('v_call_log').select('*', { count: 'exact' })
        .eq('tenant_id', identity.tenant.id)
        .order('occurred_at', { ascending: ascending === '1' }).order('log_id', { ascending: ascending === '1' }));
      const contactId = params.get('contact_id');
      if (contactId) {
        if (!validUuid(contactId)) throw new EvidenceError(400, 'Invalid contact.');
        filters.push(query => query.eq('contact_id', contactId));
      }
      if (params.has('record_ids')) {
        const ids = params.get('record_ids').split(',');
        if (ids.length > 100 || !ids.every(validUuid)) throw new EvidenceError(400, 'Invalid call records.');
        filters.push(query => query.in('call_record_id', ids));
      }
      for (const [parameter, method] of [['from', 'gte'], ['to', 'lt']]) {
        const date = params.get(parameter);
        if (date) {
          if (!/^\d{4}-\d\d-\d\dT/.test(date) || !Number.isFinite(Date.parse(date))) throw new EvidenceError(400, 'Invalid date.');
          filters.push(query => query[method]('occurred_at', new Date(date).toISOString()));
        }
      }
      const direction = params.get('direction');
      if (direction && !['inbound', 'outbound'].includes(direction)) throw new EvidenceError(400, 'Invalid direction.');
      for (const field of ['direction', 'disposition', 'agent']) {
        const value = params.get(field);
        if (value) {
          if (value.length > 100) throw new EvidenceError(400, 'Invalid filter.');
          filters.push(query => query.eq(field, value));
        }
      }
      const search = params.get('search');
      if (search) {
        if (search.length > 100) throw new EvidenceError(400, 'Search is too long.');
        // Quoted PostgREST values cannot inject another filter expression.
        const like = `%${search.replace(/[\\%_]/g, char => '\\' + char)}%`;
        const quoted = '"' + like.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        filters.push(query => query.or(`contact_name.ilike.${quoted},contact_phone.ilike.${quoted}`));
      }
      const outcome = params.get('outcome');
      if (outcome && !/^[a-z][a-z0-9_]{0,79}$/.test(outcome)) throw new EvidenceError(400, 'Invalid outcome.');
      const result = outcome
        ? await outcomeCallLogResult(db, identity.tenant.id, outcome, query, offset, limit, ascending === '1')
        : await query().range(offset, offset + limit - 1);
      const rows = await measuredCallLogRows(db, identity.tenant.id, checked(result) || []);
      const recordIds = [...new Set(rows.map(row => row.call_record_id).filter(Boolean))];
      const statuses = [];
      for (let offset = 0; offset < recordIds.length; offset += 100) {
        statuses.push(...(checked(await db.from('call_records')
          .select('id, compliance_status, compliance_scorecard_id, call_outcome').eq('tenant_id', identity.tenant.id).in('id', recordIds.slice(offset, offset + 100))) || []));
      }
      const cardIds = [...new Set(statuses.map(record => record.compliance_scorecard_id).filter(Boolean))];
      const cards = [];
      for (let offset = 0; offset < cardIds.length; offset += 100) {
        cards.push(...(checked(await db.from('compliance_scorecards')
          .select('id, overall_grade, pass_fail').eq('tenant_id', identity.tenant.id).in('id', cardIds.slice(offset, offset + 100))) || []));
      }
      const cardById = new Map(cards.map(card => [card.id, card]));
      const recordById = new Map(statuses.map(record => [record.id, record]));
      return evidenceJson(200, { rows: rows.map(row => {
        const record = recordById.get(row.call_record_id);
        const card = cardById.get(record?.compliance_scorecard_id);
        return { ...row, compliance_status: record?.compliance_status || null,
          call_outcome: record?.call_outcome ?? row.call_outcome ?? null,
          compliance_grade: card?.overall_grade || null, compliance_pass_fail: card?.pass_fail || null };
      }), count: result.count || 0 });
    } catch (error) { return evidenceFailure(error); }
  };
}
export default createCallLogHandler();
