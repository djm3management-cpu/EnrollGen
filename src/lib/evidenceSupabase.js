import { createClient } from "@supabase/supabase-js";
import { createClerkFetch } from './clerkFetch.js';
import { supabasePublishableKey, supabaseApiKeyFetch } from './supabaseKeys.js';

// A client belongs to one token getter. There is no shared subject/token cache
// and no fallback to anonymous access when Clerk cannot mint a template JWT.
export function createEvidenceSupabase(getToken, url, publicKey) {
  if (typeof getToken !== "function") throw new Error("Sign in to access transcript references.");
  return createClient(url, publicKey, {
    accessToken: async () => {
      const token = await getToken({ template: "supabase" });
      if (!token || token === publicKey || /^sb_(secret|publishable)_/.test(token)) throw new Error("Sign in to access transcript references.");
      return token;
    },
    global: { headers: { apikey: publicKey }, fetch: supabaseApiKeyFetch(publicKey, createClerkFetch(getToken, {tokenOptions:{template:'supabase'}})) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getEvidenceSupabase(getToken) {
  return createEvidenceSupabase(getToken, import.meta.env.VITE_SUPABASE_URL, supabasePublishableKey(import.meta.env));
}
