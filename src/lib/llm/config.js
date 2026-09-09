// Used by Vite before bundling and by the server at module startup. Never print values.
export function assertNoPublicApiKeys(env) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue;
    // Preserve the explicitly retained first-party availability integration.
    // This name-only exception does not permit provider secrets under this name.
    const retainedAvailabilityKey = name === 'VITE_AGENT_API_KEY';
    if ((!retainedAvailabilityKey && /(?:API_?KEY|SECRET|SERVICE_ROLE)/i.test(name)) || /(?:sk-(?:proj-|ant-)?[\w-]{8,}|sk_live_[\w]+|sk_test_[\w]+)/.test(value)) {
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
  // The shared post-call scorer also accepts legacy product records. Preserve their
  // existing provider; this migration only routes the four requested Co-Pilot engines.
  if (engine === 'ANCILLARY' || engine === 'ANNUITY') return 'anthropic';
  const provider = env[`LLM_PROVIDER_${engine}`] || env.LLM_PROVIDER || 'openai';
  if (!['openai', 'anthropic'].includes(provider)) throw new Error(`Invalid LLM provider for ${engine}`);
  return provider;
}
