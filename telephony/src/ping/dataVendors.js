// Consumer data vendor slot (spec section 1; session S9). A provider gets only
// coarse ping attributes {state, zip, t65, product_line}, never a phone, name
// or other identifier, and returns normalized signals {intent_score 0 to 100,
// sep_signals string[], source}. Every provider call has a 300 ms budget and
// fails open: a timeout, a throw or an unusable answer means no signals for
// that provider, never a rejected ping. The database applies each tenant's
// data_vendor_settings (enabled, min_intent_score) to the signals passed in.
// Only the 'stub' provider is implemented; real vendors are out of scope.
import { createHash } from 'node:crypto';

export const DEFAULT_TIMEOUT_MS = 300;
export const PROVIDERS = Object.freeze(['stub']);
const SIGNAL = /^[a-z0-9_]{1,64}$/;
const SOURCE = /^[a-z0-9_]{1,32}$/;
const PRODUCT_LINES = ['ma', 'medsupp', 'u65', 'aca', 'annuity'];

/** The only attributes a provider may see. */
export function vendorQuery({ state = null, zip = null, t65 = null, product_line: productLine = null } = {}) {
  return {
    state: typeof state === 'string' && /^[A-Z]{2}$/.test(state) ? state : null,
    zip: typeof zip === 'string' && /^[0-9]{5}$/.test(zip) ? zip : null,
    t65: typeof t65 === 'boolean' ? t65 : null,
    product_line: PRODUCT_LINES.includes(productLine) ? productLine : null,
  };
}

/** Normalized signals, or null when the answer is unusable. */
export function normalizeSignals(raw, provider) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const score = Number(raw.intent_score);
  if (raw.intent_score === null || raw.intent_score === '' || !Number.isFinite(score) || score < 0 || score > 100) return null;
  const sep = Array.isArray(raw.sep_signals) ? raw.sep_signals.filter(value => typeof value === 'string' && SIGNAL.test(value)) : [];
  return {
    intent_score: Math.round(score),
    sep_signals: [...new Set(sep)].slice(0, 10),
    source: typeof raw.source === 'string' && SOURCE.test(raw.source) ? raw.source : provider,
  };
}

/**
 * Deterministic stand-in for a real vendor: the score is derived from the
 * state and ZIP only, so tests and staging get stable signals with no network.
 */
export const stubProvider = Object.freeze({
  name: 'stub',
  async enrich({ state, zip, t65, product_line: productLine }) {
    const digest = createHash('sha256').update(`${state ?? ''}:${zip ?? ''}:${productLine ?? ''}`).digest();
    const sep = [];
    if (t65 === true) sep.push('turning_65');
    return { intent_score: digest[0] % 101, sep_signals: sep, source: 'stub' };
  },
});

const withTimeout = (work, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('data_vendor_timeout')), ms);
  Promise.resolve().then(work).then(value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); });
});

/** "stub" or "stub,other" from the deployment setting; unknown names are ignored. */
export function parseVendorList(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map(name => name.trim().toLowerCase()).filter(name => PROVIDERS.includes(name)))];
}

/**
 * providers: {name: {enrich(query)}} implementations; enabled: names to call.
 * enrich(ping) resolves to {provider: signals} for the providers that answered
 * in time, or null when no provider is enabled, so callers keep their plain
 * decision path. It never rejects.
 */
export function createDataVendors({ providers = { stub: stubProvider }, enabled = [], timeoutMs = DEFAULT_TIMEOUT_MS,
  onFailure = () => {} } = {}) {
  const active = enabled.filter(name => typeof providers[name]?.enrich === 'function');
  return Object.freeze({
    enabled: active.length > 0,
    providers: Object.freeze([...active]),
    async enrich(ping) {
      if (!active.length) return null;
      const query = vendorQuery(ping);
      const answers = await Promise.all(active.map(async name => {
        try {
          const signals = normalizeSignals(await withTimeout(() => providers[name].enrich({ ...query }), timeoutMs), name);
          if (!signals) onFailure(name, 'invalid');
          return [name, signals];
        } catch (error) {
          onFailure(name, error?.message === 'data_vendor_timeout' ? 'timeout' : 'error');
          return [name, null];
        }
      }));
      return Object.fromEntries(answers.filter(([, signals]) => signals));
    },
  });
}

/** No vendors: every route keeps its pre-S9 decision call. */
export const NO_DATA_VENDORS = createDataVendors({ enabled: [] });
