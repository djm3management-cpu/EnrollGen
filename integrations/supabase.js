import { createClient } from '@supabase/supabase-js';

// This module ships inside the independent integrations-worker Docker image.
export function supabaseSecretKey(env = process.env) {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SERVICE_KEY?.trim();
}

export function supabasePublishableKey(env = process.env) {
  return env.SUPABASE_PUBLISHABLE_KEY?.trim() || env.SUPABASE_ANON_KEY?.trim();
}

export async function reportSupabaseKeySelection(db, { service, env = process.env, log = console.log } = {}) {
  const key = supabaseSecretKey(env);
  const source = env.SUPABASE_SECRET_KEY?.trim() ? 'SUPABASE_SECRET_KEY'
    : env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? 'SUPABASE_SERVICE_ROLE_KEY'
      : env.SUPABASE_SERVICE_KEY?.trim() ? 'SUPABASE_SERVICE_KEY' : 'missing';
  let error;
  try {
    ({ error } = await db.from('availability_consumers').select('name', { head: true })
      .limit(1).abortSignal(AbortSignal.timeout(5000)));
  } catch { error = { code: 'connection_failed' }; }
  const result = { event: 'supabase_key_selected', service, source,
    key_type: key?.startsWith('sb_secret_') ? 'secret_api_key' : key?.startsWith('eyJ') ? 'legacy_jwt' : 'unrecognized',
    database_access: error ? 'failed' : 'ok',
    ...(error ? { code: /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code || '') ? error.code : 'connection_failed' } : {}),
  };
  log(JSON.stringify(result));
  return result;
}

export function supabaseApiKeyFetch(key, send = (...args) => fetch(...args)) {
  return (input, init = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    // Opaque API keys authenticate the application through apikey, never as a JWT.
    // Keep real user JWTs and legacy-key compatibility headers intact.
    if (/^sb_(secret|publishable)_/.test(key) && headers.get('Authorization') === `Bearer ${key}`) {
      headers.delete('Authorization');
    }
    return send(input, { ...init, headers });
  };
}

export function createSupabaseClient(url, key, options = {}) {
  return createClient(url, key, {
    ...options,
    global: { ...options.global, fetch: supabaseApiKeyFetch(key, options.global?.fetch) },
  });
}
