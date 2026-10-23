import { createClient } from '@supabase/supabase-js';

// Kept in telephony/: this service's Docker image cannot import the repo root.
export function supabaseSecretKey(env = process.env) {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

export function createSupabaseClient(url, key, options = {}) {
  const send = options.global?.fetch || ((...args) => fetch(...args));
  return createClient(url, key, {
    ...options,
    global: { ...options.global, fetch: (input, init = {}) => {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
      if (/^sb_(secret|publishable)_/.test(key) && headers.get('Authorization') === `Bearer ${key}`) {
        headers.delete('Authorization');
      }
      return send(input, { ...init, headers });
    } },
  });
}
