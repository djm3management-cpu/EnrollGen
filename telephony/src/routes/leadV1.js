// Web lead ping-post (spec section 8.3; session S9).
// POST /api/ping/v1/lead: a lead ping with no direct identifier (state, ZIP,
// t65 or age band, product line, sub_id, consent certificate id). Direct to
// the publisher's own lead campaign, or through the exchange with
// "exchange": true (PING_EXCHANGE_ENABLED). An accepted ping opens a 60 second
// post window. POST /api/post/v1/lead: the lead for an accepted ping (first
// and last name, phone, email, ZIP, state, optional street address, consent
// certificate id). Any other field, an MBI, SSN, DOB or health detail
// included, is a 400 and nothing is stored. Same key auth, admission, sandbox
// semantics and logging as /api/ping/v1. Responses never echo lead data.
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { createLogger } from '../lib/logger.js';
import { limitsFor } from '../lib/admission.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import { normalizePhoneE164 } from '../phone.js';
import { createDataVendors, NO_DATA_VENDORS, parseVendorList } from '../ping/dataVendors.js';

const defaultLogger = createLogger('telephony', 'leadv1');
export const LEAD_PING_PATH = '/api/ping/v1/lead';
export const LEAD_POST_PATH = '/api/post/v1/lead';
export const LEAD_PING_FIELDS = Object.freeze(['state', 'zip', 't65', 'age_band', 'product_line', 'sub_id',
  'consent_cert_id', 'campaign', 'exchange']);
export const LEAD_POST_FIELDS = Object.freeze(['lead_ping_id', 'first_name', 'last_name', 'phone', 'email', 'zip',
  'state', 'address', 'consent_cert_id']);
// Literal so scripts/logging/catalog.mjs registers them.
const EVENTS = Object.freeze({ ping: { event: 'lead_v1_ping' }, post: { event: 'lead_v1_post' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) || null
  : typeof value === 'number' && Number.isFinite(value) ? String(value).slice(0, max) : null);
const isObject = body => body && typeof body === 'object' && !Array.isArray(body);
/** Field names outside the allowlist; never their values. */
export const unknownFields = (body, allowed) => (isObject(body) ? Object.keys(body).filter(key => !allowed.includes(key)) : ['body']);

function readT65(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return 'invalid';
}

/** Server-built lead ping payload: only allowlisted, coarse fields. */
export function leadPingPayload(body) {
  return {
    state: text(body.state, 8)?.toUpperCase() ?? null,
    zip: text(body.zip, 16),
    t65: readT65(body.t65),
    age_band: text(body.age_band, 32)?.toLowerCase() ?? null,
    product_line: text(body.product_line, 32)?.toLowerCase() ?? null,
    sub_id: text(body.sub_id, 128),
    consent_cert_id: text(body.consent_cert_id, 128),
  };
}

/** Server-built post payload. The phone is normalized to E.164 when it parses. */
export function leadPostPayload(body) {
  const rawPhone = text(body.phone, 64);
  const payload = {
    first_name: text(body.first_name, 128), last_name: text(body.last_name, 128),
    phone: rawPhone ? normalizePhoneE164(rawPhone) ?? rawPhone : null,
    email: text(body.email, 320), zip: text(body.zip, 16), state: text(body.state, 8)?.toUpperCase() ?? null,
    address: text(body.address, 256), consent_cert_id: text(body.consent_cert_id, 128),
  };
  // Non string values are sent as given so the database refuses them.
  for (const key of Object.keys(payload)) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') payload[key] = body[key];
  }
  return payload;
}

/** The publisher-facing ping body. The price only when the database allows disclosure (D6 keeps it off). */
export function leadPingResponse(data) {
  const body = {
    lead_ping_id: data?.lead_ping_id ?? null,
    available: data?.available === true,
    reason: data?.reason ?? 'error_rejected',
    post_expires_at: data?.available === true ? data.post_expires_at ?? null : null,
  };
  if (data?.disclose_price === true && data.price != null) body.price = Number(data.price);
  if (data?.sandbox === true) body.sandbox = true;
  return body;
}

export function leadPostResponse(data) {
  const body = { accepted: data?.accepted === true, reason: data?.reason ?? 'error_rejected' };
  if (data?.sandbox === true) body.sandbox = true;
  return body;
}

export function createLeadV1Router({
  db,
  enabled = name => featureEnabled(name),
  admissionLimit = () => limitsFor('vendorPing').minute,
  dataVendors = NO_DATA_VENDORS,
  log = event => defaultLogger.info(JSON.stringify(event)),
} = {}) {
  const router = Router();

  // Shared key auth and admission, exactly as /api/ping/v1.
  async function admit(req, reply) {
    const key = req.header('x-api-key');
    if (!key || key.length > 512) { reply({ error: 'Unauthorized' }, 401); return null; }
    const hash = createHash('sha256').update(key).digest('hex');
    const gate = await db().rpc('admit_vendor', { p_key_hash: hash, p_route: 'vendorPing', p_limit: admissionLimit() });
    if (gate.error || !gate.data) { reply({ error: 'Admission unavailable' }, 503); return null; }
    if (!gate.data.authorized) { reply({ error: 'Unauthorized' }, 401); return null; }
    if (!gate.data.allowed) {
      const retryAfter = Math.max(1, Math.ceil(Number(gate.data.retry_after) || 60));
      reply.header('Retry-After', String(retryAfter));
      reply({ error: 'admission_limited', retry_after: retryAfter }, 429);
      return null;
    }
    return hash;
  }

  const replier = (res, kind, started, fields) => {
    const reply = (body, status = 200) => {
      log({
        ...EVENTS[kind], status, lead_ping_id: body.lead_ping_id ?? fields.leadPingId ?? null,
        reason: body.reason ?? body.error ?? null, available: body.available === true || body.accepted === true,
        exchange: fields.exchange === true, latency_ms: Date.now() - started,
      });
      return res.status(status).json(body);
    };
    reply.header = (name, value) => res.setHeader(name, value);
    return reply;
  };

  router.post(LEAD_PING_PATH, async (req, res) => {
    if (!enabled('PING_PLATFORM_ENABLED')) return res.status(503).json({ status: 'disabled', feature: 'PING_PLATFORM_ENABLED' });
    const fields = { exchange: req.body?.exchange === true };
    if (fields.exchange && !enabled('PING_EXCHANGE_ENABLED')) {
      return res.status(503).json({ status: 'disabled', feature: 'PING_EXCHANGE_ENABLED' });
    }
    const reply = replier(res, 'ping', Date.now(), fields);
    try {
      const hash = await admit(req, reply);
      if (!hash) return undefined;
      if (unknownFields(req.body, LEAD_PING_FIELDS).length || (req.body.exchange !== undefined && typeof req.body.exchange !== 'boolean')) {
        return reply({ available: false, reason: 'invalid_payload' }, 400);
      }
      const payload = leadPingPayload(req.body);
      const signals = dataVendors.enabled ? await dataVendors.enrich({ state: payload.state, zip: payload.zip,
        t65: typeof payload.t65 === 'boolean' ? payload.t65 : payload.age_band === 'turning_65' ? true : null,
        product_line: payload.product_line }) : null;
      const { data, error } = fields.exchange
        ? await db().rpc('exchange_lead_ping', { p_key_hash: hash, p_payload: payload, p_signals: signals })
        : await db().rpc('lead_ping_decide', { p_key_hash: hash, p_campaign: text(req.body.campaign, 128),
          p_payload: payload, p_signals: signals });
      if (error || !data) return reply(leadPingResponse({ reason: 'error_rejected' }));
      if (data.status === 'disabled') {
        const feature = ['PING_PLATFORM_ENABLED', 'PING_EXCHANGE_ENABLED'].includes(data.feature) ? data.feature : 'PING_PLATFORM_ENABLED';
        return reply({ status: 'disabled', feature }, 503);
      }
      if (!data.authorized) return reply({ error: 'Unauthorized' }, 401);
      return reply(leadPingResponse(data));
    } catch {
      return reply(leadPingResponse({ reason: 'error_rejected' }));
    }
  });

  router.post(LEAD_POST_PATH, async (req, res) => {
    if (!enabled('PING_PLATFORM_ENABLED')) return res.status(503).json({ status: 'disabled', feature: 'PING_PLATFORM_ENABLED' });
    const leadPingId = typeof req.body?.lead_ping_id === 'string' && UUID.test(req.body.lead_ping_id) ? req.body.lead_ping_id : null;
    const reply = replier(res, 'post', Date.now(), { leadPingId });
    try {
      const hash = await admit(req, reply);
      if (!hash) return undefined;
      if (!leadPingId || unknownFields(req.body, LEAD_POST_FIELDS).length) {
        return reply({ accepted: false, reason: 'invalid_payload' }, 400);
      }
      const { data, error } = await db().rpc('lead_post_accept', {
        p_key_hash: hash, p_lead_ping_id: leadPingId, p_payload: leadPostPayload(req.body),
      });
      if (error || !data) return reply(leadPostResponse({ reason: 'error_rejected' }));
      if (data.status === 'disabled') return reply({ status: 'disabled', feature: 'PING_PLATFORM_ENABLED' }, 503);
      if (!data.authorized) return reply({ error: 'Unauthorized' }, 401);
      return reply(leadPostResponse(data), data.reason === 'invalid_payload' ? 400 : 200);
    } catch {
      return reply(leadPostResponse({ reason: 'error_rejected' }));
    }
  });
  return router;
}

let defaultRouter;
/** Lazily bound to the service client so importing this module has no side effects. */
export async function leadV1Router() {
  if (defaultRouter) return defaultRouter;
  const [{ supabase }, { config }] = await Promise.all([import('../supabase.js'), import('../config.js')]);
  defaultRouter = createLeadV1Router({
    db: () => supabase,
    dataVendors: createDataVendors({ enabled: parseVendorList(config.pingDataVendors) }),
  });
  return defaultRouter;
}
