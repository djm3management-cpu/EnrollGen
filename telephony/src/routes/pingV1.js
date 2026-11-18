// POST /api/ping/v1 (spec section 8). Publisher pings fail closed. One
// structured event per decision; phone numbers are logged as last 4 only.
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { createLogger } from '../lib/logger.js';
import { limitsFor } from '../lib/admission.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import { deploymentProfile } from '../lib/deploymentProfile.js';
import { fieldMapFor, parsePingFieldMaps, phoneLast4, pingPayload, readPing } from '../ping/adapter.js';

const defaultLogger = createLogger('telephony', 'pingv1');

export function createPingV1Router({
  db,
  enabled = () => featureEnabled('PING_PLATFORM_ENABLED'),
  routingEnabled = () => false,
  fieldMaps = {},
  sourceName = () => null,
  admissionLimit = () => limitsFor('vendorPing').minute,
  log = event => defaultLogger.info(JSON.stringify(event)),
} = {}) {
  const router = Router();
  router.post('/api/ping/v1', async (req, res) => {
    if (!enabled()) return res.status(503).json({ status: 'disabled', feature: 'PING_PLATFORM_ENABLED' });
    const started = Date.now();
    let fields = null;
    const reply = (body, status = 200) => {
      log({
        event: 'ping_v1_decision', status, decision_id: body.decision_id ?? null,
        reason: body.reason ?? body.error ?? null, available: body.available === true,
        state: fields?.state ?? null, phone_last4: phoneLast4(fields?.phone), latency_ms: Date.now() - started,
      });
      return res.status(status).json(body);
    };
    const key = req.header('x-api-key');
    if (!key || key.length > 512) return reply({ error: 'Unauthorized' }, 401);
    try {
      const hash = createHash('sha256').update(key).digest('hex');
      const gate = await db().rpc('admit_vendor', { p_key_hash: hash, p_route: 'vendorPing', p_limit: admissionLimit() });
      if (gate.error || !gate.data) return reply({ error: 'Admission unavailable' }, 503);
      if (!gate.data.authorized) return reply({ error: 'Unauthorized' }, 401);
      if (!gate.data.allowed) {
        const retryAfter = Math.max(1, Math.ceil(Number(gate.data.retry_after) || 60));
        res.setHeader('Retry-After', String(retryAfter));
        return reply({ error: 'admission_limited', retry_after: retryAfter }, 429);
      }
      fields = readPing(req.body, fieldMapFor(fieldMaps, sourceName()));
      const { data, error } = await db().rpc('ping_decide', {
        p_key_hash: hash, p_campaign: fields.campaign,
        p_payload: pingPayload(fields, { routingEnabled: routingEnabled() }), p_engine: 'generic',
      });
      if (error || !data) return reply({ available: false, reason: 'error_rejected' });
      if (data.status === 'disabled') return reply({ status: 'disabled', feature: 'PING_PLATFORM_ENABLED' }, 503);
      if (!data.authorized) return reply({ error: 'Unauthorized' }, 401);
      const body = {
        decision_id: data.decision_id, available: data.available === true,
        reason: data.reason, ttl_seconds: data.ttl_seconds ?? null,
      };
      // Price disclosure is off by default (owner decision D6); ping_decide never sets it in S1.
      if (data.disclose_price === true && data.price != null) body.price = Number(data.price);
      return reply(body);
    } catch {
      return reply({ available: false, reason: 'error_rejected' });
    }
  });
  return router;
}

let defaultRouter;
/** Lazily bound to the service client so importing this module has no side effects. */
export async function pingV1Router() {
  if (defaultRouter) return defaultRouter;
  const [{ supabase }, { config }] = await Promise.all([import('../supabase.js'), import('../config.js')]);
  const maps = parsePingFieldMaps(config.pingFieldMaps);
  defaultRouter = createPingV1Router({
    db: () => supabase,
    routingEnabled: () => config.paragonStateRoutingEnabled,
    fieldMaps: maps,
    // admit_vendor authorizes only the deployment vendor in S1.
    sourceName: () => deploymentProfile().paragon?.sourceName ?? null,
  });
  return defaultRouter;
}
