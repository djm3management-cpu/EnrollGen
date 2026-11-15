// Known exceptions pending server-side migration; exact names only.
const PUBLIC_API_KEY_ALLOWLIST = new Set(['VITE_BIBLIA_API_KEY']);

function isServiceRoleJwt(value) {
  try { return JSON.parse(atob((value.split('.')[1] || '').replace(/-/g,'+').replace(/_/g,'/'))).role === 'service_role'; }
  catch { return false; }
}

// Used by Vite before bundling and by the server at module startup. Never print values.
export function assertNoPublicApiKeys(env) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue;
    // Name-only exceptions still cannot contain provider secrets or copied server secrets.
    if ((!PUBLIC_API_KEY_ALLOWLIST.has(name) && /(?:API_?KEY|SECRET|SERVICE_ROLE)/i.test(name)) || /(?:sb_secret_[\w-]+|sk-(?:proj-|ant-)?[\w-]{8,}|sk_live_[\w]+|sk_test_[\w]+)/.test(value) || isServiceRoleJwt(value)) {
      throw new Error(`Unsafe public secret: ${name}. API keys must be server-side only.`);
    }
    if (Object.entries(env).some(([key, secret]) => !key.startsWith('VITE_') && /API_?KEY|SECRET|SERVICE_ROLE/i.test(key) && secret && secret === value)) {
      throw new Error(`Unsafe public secret: ${name}. API keys must be server-side only.`);
    }
  }
}

export function resolveEngine(value = 'MA') {
  const normalized = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const aliases = { MA: 'MA', MEDICAREADVANTAGE: 'MA', MEDSUP: 'MEDSUP', MEDICARESUPPLEMENT: 'MEDSUP', ACA: 'ACA', U65: 'U65', ANCILLARY: 'ANCILLARY', ANNUITY: 'ANNUITY' };
  if (!aliases[normalized]) throw new Error(`Unsupported LLM engine: ${value}`);
  return aliases[normalized];
}

export function resolveProvider(engine, env) {
  const provider = env[`LLM_PROVIDER_${engine}`] || env.LLM_PROVIDER || 'openai';
  if (provider !== 'openai') throw new Error(`Invalid LLM provider for ${engine}; only openai is supported`);
  return provider;
}

export function resolveModel(task, env) {
  const setting = { rts_ingestion: 'RTS_INGESTION_OPENAI_MODEL', knowledge_update: 'KNOWLEDGE_UPDATE_OPENAI_MODEL' }[task];
  if (!setting) return 'gpt-5.6-luna';
  const model = env[setting]?.trim();
  if (!model) throw Object.assign(new Error(`${setting} must be configured with an approved small, low-cost OpenAI model`), { code: 'model_setting_required' });
  return model;
}
