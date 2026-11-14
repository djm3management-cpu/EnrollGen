import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceJson, evidenceFailure, getEvidenceServiceClient, resolveEvidenceIdentity } from './_evidenceAccess.js';

const EVENTS = new Set(['session_lock', 'session_unlock', 'session_unlock_failed']);
// Reuse the existing append-only event sink. Client reports are diagnostics,
// never proof of authentication or authority to access a record.
export function createSessionLockEventsHandler({ authenticate = request => requireClerkAuth(request, { allowBypass: false }), getDb = getEvidenceServiceClient } = {}) {
  return async request => {
    if (request.method !== 'POST') return evidenceJson(405, { error: 'Method not allowed' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb();
      const identity = await resolveEvidenceIdentity(db, auth);
      let input;
      try { input = await request.json(); } catch { throw new EvidenceError(400, 'Invalid event'); }
      if (!EVENTS.has(input?.event)) throw new EvidenceError(400, 'Invalid event');
      checked(await db.from('telephony_events').insert({
        tenant_id: identity.tenant.id, event: input.event,
        payload: { source: 'browser_session_lock', clerk_user_id: auth.userId, result: input.event === 'session_unlock_failed' ? 'failed' : 'success' },
      }));
      return evidenceJson(200, { recorded: true });
    } catch (error) { return evidenceFailure(error); }
  };
}
export default createSessionLockEventsHandler();
