import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabaseUrl = requiredEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = requiredEnv("VITE_SUPABASE_ANON_KEY");
const supabaseCmsUrl = import.meta.env.VITE_SUPABASE_CMS_URL || supabaseUrl;
const supabaseCmsAnonKey = import.meta.env.VITE_SUPABASE_CMS_ANON_KEY || supabaseAnonKey;

// Base client for unauthenticated/embedding queries (existing usage)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseCms = createClient(supabaseCmsUrl, supabaseCmsAnonKey);

// Authenticated client factory - pass Clerk JWT for RLS
export function getAuthSupabase(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
