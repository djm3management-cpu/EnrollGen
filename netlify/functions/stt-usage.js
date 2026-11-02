import { requireClerkAuth } from './_clerkAuth.js';
import { createSupabaseClient, supabaseSecretKey } from '../../integrations/supabase.js';
import { resolveTenantIdForOrg } from './_subscriptionGate.js';

export function validateSttUsage(body) {
  if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.connectionId || '')
    || (body.callSid !== null && !/^CA[0-9a-f]{32}$/i.test(body.callSid || ''))
    || typeof body.seconds !== 'number' || !Number.isFinite(body.seconds) || body.seconds < 0 || body.seconds > 86400) return null;
  return { id: body.connectionId, quantity: body.seconds, record_type: 'stt_seconds',
    metadata: { call_sid: body.callSid, track: 'customer', source: 'browser', model: 'nova-2', connection_id: body.connectionId } };
}
export function createSttUsageHandler({ authenticate = requireClerkAuth,
  getDb = () => createSupabaseClient(process.env.SUPABASE_URL, supabaseSecretKey()), resolveTenant = resolveTenantIdForOrg } = {}) {
  return async request => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    let body;
    try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    const row = validateSttUsage(body);
    if (!row) return new Response('Invalid STT usage', { status: 400 });
    try {
      const db = getDb();
      const tenantId = await resolveTenant(db, auth.orgId);
      if (!tenantId) return new Response('Tenant required', { status: 403 });
      const { error } = await db.from('usage_records').upsert({ ...row, tenant_id: tenantId,
        metadata: { ...row.metadata, user_id: auth.userId, reported_by: 'client' } }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return new Response(null, { status: 204 });
    } catch { return new Response('Usage reporting failed', { status: 503 }); }
  };
}
export default createSttUsageHandler();
export const config = { path: '/api/stt-usage' };
