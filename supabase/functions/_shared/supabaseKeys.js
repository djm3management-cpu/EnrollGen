// Hosted Edge Functions reserve SUPABASE_* secret names. Prefer an explicit
// per-function secret, or the platform-injected named secret-key map.
export function edgeSupabaseSecretKey(getEnv) {
  const explicit = getEnv('SUPABASE_SECRET_KEY')?.trim() || getEnv('ENROLLGEN_SUPABASE_SECRET_KEY')?.trim();
  if (explicit) return explicit;
  const named = getEnv('SUPABASE_SECRET_KEYS');
  if (named?.trim()) {
    let keys;
    try { keys = JSON.parse(named); }
    catch { throw new Error('Invalid SUPABASE_SECRET_KEYS configuration'); }
    if (typeof keys?.default === 'string' && keys.default.trim()) return keys.default.trim();
  }
  const legacy = getEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!legacy) throw new Error('Supabase secret key is not configured');
  return legacy;
}

export function edgeSupabaseFetch(key, send = (...args) => fetch(...args)) {
  return (input, init = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (/^sb_secret_/.test(key) && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
    return send(input, { ...init, headers });
  };
}
