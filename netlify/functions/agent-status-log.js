import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity } from './_recordingAccess.js';

const allowed = new Set(['from', 'to', 'agent', 'status', 'offset', 'limit']);
const statuses = ['available', 'callbacks_only', 'busy', 'offline'];
const integer = (value, fallback, maximum) => {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > maximum) throw new EvidenceError(400, 'Invalid page.');
  return Number(value);
};

export function createAgentStatusLogHandler({
  authenticate = request => requireClerkAuth(request, { allowBypass: false }),
  getDb = getEvidenceServiceClient,
} = {}) {
  return async request => {
    if (request.method !== 'GET') return evidenceJson(405, { error: 'Method not allowed.' });
    try {
      const auth = await authenticate(request);
      if (auth.response) return auth.response;
      if (!auth.sessionId) throw new EvidenceError(401, 'Sign in to view agent status history.');
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => !allowed.has(key))) throw new EvidenceError(400, 'Invalid status-log filter.');
      const offset = integer(params.get('offset'), 0, 1_000_000);
      const limit = integer(params.get('limit'), 50, 100);
      if (!limit) throw new EvidenceError(400, 'Invalid page.');
      const dates = ['from', 'to'].map(key => {
        const value = params.get(key);
        if (!value || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) {
          throw new EvidenceError(400, 'Choose a valid date range.');
        }
        return new Date(value);
      });
      if (dates[0] >= dates[1] || dates[1] - dates[0] > 31 * 86400000) {
        throw new EvidenceError(400, 'Choose a date range of up to 31 days.');
      }
      const status = params.get('status');
      if (status && !statuses.includes(status)) throw new EvidenceError(400, 'Invalid status.');
      const db = getDb();
      // Match the dashboard's agency read scope, using the service-managed
      // availability map rather than browser-writable CRM agent names/roles.
      const identity = await recordingIdentity(db, auth);
      const slugs = [];
      for (let start = 0; ; start += 1000) {
        const rows = checked(await db.from('availability_agent_subjects').select('agent_slug')
          .eq('tenant_id', identity.tenant.id).order('agent_slug').range(start, start + 999)) || [];
        slugs.push(...rows.map(row => row.agent_slug));
        if (rows.length < 1000) break;
      }
      const agent = params.get('agent');
      if (agent && !slugs.includes(agent)) throw new EvidenceError(403, 'Agent is unavailable in this agency.');
      if (!slugs.length) return evidenceJson(200, { rows: [], agents: [], count: 0 });
      const agents = checked(await db.from('agent_availability').select('agent_id, agent_name')
        .in('agent_id', slugs).order('agent_name').order('agent_id')) || [];
      let query = db.from('agent_availability_log')
        .select('id, agent_id, agent_name, status, available, changed_at', { count: 'exact' })
        .in('agent_id', agent ? [agent] : slugs)
        .gte('changed_at', dates[0].toISOString()).lt('changed_at', dates[1].toISOString())
        .order('changed_at', { ascending: false }).order('id', { ascending: false });
      if (status) query = query.eq('status', status);
      const result = await query.range(offset, offset + limit - 1);
      return evidenceJson(200, { rows: checked(result) || [], agents, count: result.count || 0 });
    } catch (error) {
      return evidenceFailure(error);
    }
  };
}

export default createAgentStatusLogHandler();
