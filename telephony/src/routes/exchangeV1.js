// POST /api/exchange/v1/ping (spec section 9). One publisher ping reaches every
// routed buyer campaign; the database picks one winner. Publisher pings fail
// closed. The response never carries a price, another buyer, a candidate count
// or the winner's identity. One structured event per auction; phone numbers
// are logged as last 4 only.
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { createLogger } from '../lib/logger.js';
import { limitsFor } from '../lib/admission.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import { deploymentProfile } from '../lib/deploymentProfile.js';
import { fieldMapFor, parsePingFieldMaps, phoneLast4, pingPayload, readPing } from '../ping/adapter.js';

const defaultLogger = createLogger('telephony', 'exchangev1');
export const EXCHANGE_FLAGS = Object.freeze(['PING_PLATFORM_ENABLED', 'PING_EXCHANGE_ENABLED']);

/** The publisher-facing body: only these five fields, plus "sandbox": true for a sandbox source. */
export function exchangeResponse(data) {
  const body = {
    auction_id: data?.auction_id ?? null,
    available: data?.available === true,
    reason: data?.reason ?? 'error_rejected',
    ttl_seconds: data?.available === true ? data.ttl_seconds ?? null : null,
    transfer_number: data?.available === true ? data.transfer_number ?? null : null,
  };
  if (data?.sandbox === true) body.sandbox = true;
  return body;
}

export function createExchangeV1Router({
  db,
  enabled = name => featureEnabled(name),
  routingEnabled = () => false,
  fieldMaps = {},
  sourceName = () => null,
  admissionLimit = () => limitsFor('vendorPing').minute,
  log = event => defaultLogger.info(JSON.stringify(event)),
} = {}) {
  const router = Router();
  router.post('/api/exchange/v1/ping', async (req, res) => {
    const missing = EXCHANGE_FLAGS.find(name => !enabled(name));
    if (missing) return res.status(503).json({ status: 'disabled', feature: missing });
    const started = Date.now();
    let fields = null;
    const reply = (body, status = 200) => {
      log({
        event: 'exchange_v1_auction', status, auction_id: body.auction_id ?? null,
        reason: body.reason ?? body.error ?? null, available: body.available === true,
        state: fields?.state ?? null, phone_last4: phoneLast4(fields?.phone), latency_ms: Date.now() - started,
      });
      return res.status(status).json(body);
    };
    const failed = () => reply(exchangeResponse({ reason: 'error_rejected' }));
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
      const { data, error } = await db().rpc('exchange_ping', {
        p_key_hash: hash, p_payload: pingPayload(fields, { routingEnabled: routingEnabled() }),
      });
      if (error || !data) return failed();
      if (data.status === 'disabled') {
        const feature = EXCHANGE_FLAGS.includes(data.feature) ? data.feature : 'PING_EXCHANGE_ENABLED';
        return reply({ status: 'disabled', feature }, 503);
      }
      if (!data.authorized) return reply({ error: 'Unauthorized' }, 401);
      return reply(exchangeResponse(data));
    } catch {
      return failed();
    }
  });
  return router;
}

let defaultRouter;
/** Lazily bound to the service client so importing this module has no side effects. */
export async function exchangeV1Router() {
  if (defaultRouter) return defaultRouter;
  const [{ supabase }, { config }] = await Promise.all([import('../supabase.js'), import('../config.js')]);
  defaultRouter = createExchangeV1Router({
    db: () => supabase,
    // The same routing switch POST /api/ping/v1 sends to ping_decide.
    routingEnabled: () => config.paragonStateRoutingEnabled,
    fieldMaps: parsePingFieldMaps(config.pingFieldMaps),
    sourceName: () => deploymentProfile().paragon?.sourceName ?? null,
  });
  return defaultRouter;
}
