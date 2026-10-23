import { createClient } from '@supabase/supabase-js';

// This module ships inside the independent integrations-worker Docker image.
export function supabaseSecretKey(env = process.env) {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SERVICE_KEY?.trim();
}

export function supabasePublishableKey(env = process.env) {
  return env.SUPABASE_PUBLISHABLE_KEY?.trim() || env.SUPABASE_ANON_KEY?.trim();
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
