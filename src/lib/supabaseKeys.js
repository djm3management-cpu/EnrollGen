export function supabasePublishableKey(env) {
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!key) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY) is required');
  assertPublicKey(key);
  return key;
}

export function supabaseCmsPublishableKey(env, primaryKey) {
  const key = env.VITE_SUPABASE_CMS_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_CMS_ANON_KEY?.trim() || primaryKey;
  assertPublicKey(key);
  return key;
}

function assertPublicKey(key) {
  if (/^sb_secret_/.test(key)) throw new Error('A Supabase secret key must never be used in browser configuration');
  try {
    const payload = JSON.parse(atob((key.split('.')[1] || '').replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.role === 'service_role') throw new Error('A Supabase service-role key must never be used in browser configuration');
  } catch (error) {
    if (error.message.includes('must never')) throw error;
  }
}

export function supabaseApiKeyFetch(key, send = (...args) => fetch(...args)) {
  return (input, init = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (/^sb_publishable_/.test(key) && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
    return send(input, { ...init, headers });
  };
}
