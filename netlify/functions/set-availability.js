import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceJson, evidenceFailure, getEvidenceServiceClient, resolveCallAccessIdentity } from './_evidenceAccess.js';

const STATUSES = ['available', 'callbacks_only', 'busy', 'offline'];
const COLUMNS = 'agent_id, agent_name, status, available, toggled_at, active_call_sid, wrap_up_call_sid';

export async function availabilityTarget(db, auth, requestedId) {
  if (!auth.userId || !auth.sessionId || auth.userId === 'dev-bypass') {
    throw new EvidenceError(401, 'Sign in to change availability.');
  }
  auth = { ...auth, orgId: auth.orgId ?? auth.tokenPayload?.o?.id ?? null };
  const identity = await resolveCallAccessIdentity(db,auth);
  const admin = identity.admin ? 'organization' : null;
  let query = db.from('availability_agent_subjects')
    .select('tenant_id, clerk_org_id, clerk_user_id, agent_slug, is_active').eq('tenant_id',identity.tenant.id);
  if (admin && requestedId) {
    query = query.eq('agent_slug', requestedId);
    query = query.eq('clerk_org_id', identity.tenant.clerk_org_id);
  } else {
    query = query.eq('clerk_user_id', auth.userId);
    if (auth.orgId) query = query.eq('clerk_org_id', auth.orgId);
  }
  const rows = checked(await query.limit(2)) || [];
  if (rows.length !== 1 || !rows[0].is_active || (requestedId && rows[0].agent_slug !== requestedId)) {
    throw new EvidenceError(403, 'Availability is unavailable for this agent.');
  }
  const target = rows[0];
  // Enrolled membership is service-managed by 063. Deactivation also revokes
  // availability access; a writable tenant_agents row cannot grant it back.
  const enrolled = checked(await db.from('enrolled_agents').select('is_active')
    .eq('tenant_id', target.tenant_id).eq('clerk_user_id', target.clerk_user_id).maybeSingle());
  if (!enrolled?.is_active) throw new EvidenceError(403, 'Agent is inactive.');
  return target.agent_slug;
}

export function createAvailabilityHandler({
  authenticate = request => requireClerkAuth(request, { allowBypass: false }),
  getDb = getEvidenceServiceClient,
  now = () => new Date().toISOString(),
} = {}) {
  return serverRequest('set-availability',async request => {
    if (!['GET', 'POST'].includes(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
    }
    try {
      const auth = await authenticate(request);
      if (auth.response) return auth.response;
      let input = {};
      if (request.method === 'POST') {
        try { input = await request.json(); } catch { throw new EvidenceError(400, 'Invalid JSON.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input) || !STATUSES.includes(input.status)) {
          throw new EvidenceError(400, 'Choose available, callbacks_only, busy, or offline.');
        }
      }
      const requestedId = request.method === 'GET' ? new URL(request.url).searchParams.get('agent_id') : input.agent_id;
      if (requestedId != null && (typeof requestedId !== 'string' || !requestedId || requestedId.length > 128)) {
        throw new EvidenceError(400, 'Invalid agent ID.');
      }
      const db = adminActionClient(getDb());
      const slug = await availabilityTarget(db, auth, requestedId);
      const table = db.from('agent_availability');
      // Exactly the deployed v11 write fields. Existing triggers protect live
      // reservations, resume_status and presence; never write those ourselves.
      const query = request.method === 'POST'
        ? table.update({ status: input.status, available: input.status === 'available', toggled_at: now() })
        : table;
      const row = checked(await query.select(COLUMNS).eq('agent_id', slug).maybeSingle());
      if (!row) throw new EvidenceError(404, 'Agent availability is not configured.');
      return evidenceJson(200, { ...row, status: row.wrap_up_call_sid && !row.active_call_sid ? 'wrap_up' : row.status, success: true });
    } catch (error) {
      return evidenceFailure(error);
    }
  });
}

export default createAvailabilityHandler();
