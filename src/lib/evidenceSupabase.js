import { createClient } from "@supabase/supabase-js";

// A client belongs to one token getter. There is no shared subject/token cache
// and no fallback to anonymous access when Clerk cannot mint a template JWT.
export function createEvidenceSupabase(getToken, url, anonKey) {
  if (typeof getToken !== "function") throw new Error("Sign in to access transcript references.");
  return createClient(url, anonKey, {
    accessToken: async () => {
      const token = await getToken({ template: "supabase" });
      if (!token || token === anonKey) throw new Error("Sign in to access transcript references.");
      return token;
    },
    global: { headers: { apikey: anonKey } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getEvidenceSupabase(getToken) {
  return createEvidenceSupabase(getToken, import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
}
