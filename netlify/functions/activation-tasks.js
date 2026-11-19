// Benefit activation tasks in the CRM (docs/feature-gold-standards.md item 5).
// Verified Clerk only. Scope is resolved again in SQL: own tasks for an agent,
// the protected team for a manager, the agency for an admin. Every change is
// recorded by a person and appends admin_action_log in the same transaction.
// There is no outbound action of any kind: no dialer, text or email.
import { requireClerkAuth } from './_clerkAuth.js';
import { getEvidenceServiceClient, resolveCallAccessIdentity, evidenceJson, evidenceFailure, EvidenceError } from './_evidenceAccess.js';
import { auditedEvidenceAccess } from '../../telephony/src/lib/evidenceAudit.js';
import { serverRequest } from '../../telephony/src/lib/adminActions.js';
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';
import { featureEnabled } from '../../telephony/src/lib/deploymentFeatures.js';
import { admitGold } from './_admission.js';
import { ACTIVATION_OUTCOMES, ACTIVATION_STATUSES } from '../../src/lib/goldStandards.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checked(result) {
  if (result.error) throw new EvidenceError({ 42501: 403, 22023: 400, 40001: 409 }[result.error.code] || 503, 'Activation request failed.');
  return result.data;
}
const bad = () => { throw new EvidenceError(400, 'Invalid request.'); };

export function createActivationTasksHandler({ authenticate = request => requireClerkAuth(request, { allowBypass: false }),
  getDb = getEvidenceServiceClient, env = process.env } = {}) {
  return serverRequest('activation-tasks', async request => {
    if (!featureEnabled('BENEFIT_ACTIVATION_ENABLED', env)) return evidenceJson(404, { error: 'Not found.' });
    if (!['GET', 'POST'].includes(request.method)) return evidenceJson(405, { error: 'Use GET or POST.' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb(env); const profile = deploymentProfile(env);
      const identity = await resolveCallAccessIdentity(db, auth);
      const actor = { p_actor: auth.userId, p_org: auth.orgId || auth.tokenPayload?.o?.id || null };
      return await auditedEvidenceAccess(db, { actor: auth.userId, tenant: identity.tenant.id, resource: 'activation_tasks', action: request.method === 'GET' ? 'list' : 'read' }, async () => {
        if (request.method === 'GET') {
          const p = new URL(request.url).searchParams; const filters = {};
          if (p.get('status')) { if (!Object.hasOwn(ACTIVATION_STATUSES, p.get('status'))) bad(); filters.status = p.get('status'); }
          if (p.get('assignee')) { if (!UUID.test(p.get('assignee'))) bad(); filters.assignee = p.get('assignee'); }
          if (p.get('carrier')) { if (p.get('carrier').length > 100) bad(); filters.carrier = p.get('carrier'); }
          if (p.get('overdue')) { if (!['true', 'false'].includes(p.get('overdue'))) bad(); filters.overdue = p.get('overdue') === 'true'; }
          const offset = Number(p.get('offset') || 0); const limit = Number(p.get('limit') || 100);
          if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 200) bad();
          await admitGold(db, 'activationRead', auth.userId, profile);
          return evidenceJson(200, checked(await db.rpc('read_activation_tasks', { ...actor, p_filters: filters, p_limit: limit, p_offset: offset })));
        }
        let input; try { const body = await request.text(); if (body.length > 4000) throw new Error(); input = JSON.parse(body); } catch { bad(); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) bad();
        await admitGold(db, 'activationWrite', auth.userId, profile);
        switch (input.action) {
          case 'record':
            if (!UUID.test(input.item || '') || !Object.hasOwn(ACTIVATION_OUTCOMES, input.outcome) || (input.note !== undefined && input.note !== null && typeof input.note !== 'string')) bad();
            return evidenceJson(200, checked(await db.rpc('activation_record_item', { ...actor, p_item: input.item, p_outcome: input.outcome, p_note: input.note || null })));
          case 'add_benefit':
            if (!UUID.test(input.task || '') || typeof input.label !== 'string') bad();
            return evidenceJson(200, checked(await db.rpc('activation_add_benefit', { ...actor, p_task: input.task, p_label: input.label })));
          case 'close':
            if (!UUID.test(input.task || '') || !['completed', 'unreachable', 'cancelled'].includes(input.status)) bad();
            return evidenceJson(200, checked(await db.rpc('activation_close_task', { ...actor, p_task: input.task, p_status: input.status })));
          case 'due_days':
            if (!Number.isInteger(input.days)) bad();
            return evidenceJson(200, checked(await db.rpc('activation_set_due_days', { ...actor, p_days: input.days })));
          default: return bad();
        }
      });
    } catch (error) { return evidenceFailure(error); }
  });
}

export default createActivationTasksHandler();
export const config = { path: '/api/activation-tasks' };
