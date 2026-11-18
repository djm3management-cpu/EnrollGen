// Generic, per-source ping field mapping (spec section 8). Independent of
// paragonPingAdapter.js. Pings carry identifiers, state, ZIP and coarse flags only.
import { normalizePhoneE164 } from '../phone.js';

export const PING_FIELD_DEFAULTS = Object.freeze({
  phone: 'phone', state: 'state', zip: 'zip', call_id: 'call_id', sub_id: 'sub_id',
  campaign: 'campaign', consent_cert_id: 'consent_cert_id', t65: 't65',
});
const FIELD_NAME = /^[A-Za-z][\w.-]{0,63}$/;

/** One source's map; unknown keys and unsafe names are ignored. */
export function parsePingFieldMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return PING_FIELD_DEFAULTS;
  const result = { ...PING_FIELD_DEFAULTS };
  for (const key of Object.keys(PING_FIELD_DEFAULTS)) {
    if (typeof value[key] === 'string' && FIELD_NAME.test(value[key])) result[key] = value[key];
  }
  return Object.freeze(result);
}

/** JSON object keyed by lead source name, e.g. {"Source A":{"phone":"ani"}}. */
export function parsePingFieldMaps(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([source, map]) => [source, parsePingFieldMap(map)]));
  } catch { return {}; }
}

export const fieldMapFor = (maps, sourceName) =>
  (sourceName && Object.hasOwn(maps || {}, sourceName) ? maps[sourceName] : PING_FIELD_DEFAULTS);

const text = value => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : null) || null;

function readT65(value) {
  if (value === undefined || value === null || value === '') return { t65: null, invalid: false };
  if (value === true || value === 'true' || value === '1' || value === 1) return { t65: true, invalid: false };
  if (value === false || value === 'false' || value === '0' || value === 0) return { t65: false, invalid: false };
  return { t65: null, invalid: true };
}

/** Reads a body with the mapped field names, falling back to the generic names. */
export function readPing(body, map = PING_FIELD_DEFAULTS) {
  const get = key => {
    const source = body instanceof URLSearchParams ? Object.fromEntries(body) : (body || {});
    return Object.hasOwn(source, map[key]) ? source[map[key]] : source[PING_FIELD_DEFAULTS[key]];
  };
  const rawPhone = text(get('phone'));
  const phone = rawPhone ? normalizePhoneE164(rawPhone) : null;
  const zip = text(get('zip'));
  const { t65, invalid: invalidT65 } = readT65(get('t65'));
  return {
    phone,
    rawPhone,
    invalidPhone: Boolean(rawPhone && !phone),
    state: text(get('state'))?.toUpperCase() ?? null,
    zip,
    invalidZip: Boolean(zip && !/^[0-9]{5}$/.test(zip)),
    callId: text(get('call_id'))?.slice(0, 128) ?? null,
    subId: text(get('sub_id'))?.slice(0, 128) ?? null,
    campaign: text(get('campaign'))?.slice(0, 128) ?? null,
    consentCertId: text(get('consent_cert_id'))?.slice(0, 128) ?? null,
    t65,
    invalidT65,
  };
}

/**
 * Server-built p_payload. Invalid fields are forwarded so ping_decide records
 * invalid_payload; routing_enabled is never read from the request body.
 */
export function pingPayload(fields, { routingEnabled }) {
  return {
    phone: fields.invalidPhone ? fields.rawPhone?.slice(0, 64) : fields.phone,
    state: fields.state,
    zip: fields.zip?.slice(0, 16) ?? null,
    call_id: fields.callId,
    sub_id: fields.subId,
    consent_cert_id: fields.consentCertId,
    t65: fields.invalidT65 ? 'invalid' : fields.t65,
    routing_enabled: routingEnabled === true,
  };
}

/** Last four digits only; never log the full number. */
export const phoneLast4 = phone => (typeof phone === 'string' && /\d{4}$/.test(phone) ? phone.slice(-4) : null);
