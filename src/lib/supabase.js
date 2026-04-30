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
const authClients = new Map();

const publicClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "enrollgen-public-supabase",
  },
};

const cmsClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "enrollgen-cms-supabase",
  },
};

// Base client for unauthenticated/embedding queries (existing usage)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, publicClientOptions);
export const supabaseCms = createClient(supabaseCmsUrl, supabaseCmsAnonKey, cmsClientOptions);

// Authenticated client factory - pass Clerk JWT for RLS
export function getAuthSupabase(token) {
  if (!token) return supabase;
  const cacheKey = token.slice(-24);
  if (authClients.has(cacheKey)) return authClients.get(cacheKey);

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `enrollgen-auth-supabase-${cacheKey}`,
    },
  });
  authClients.set(cacheKey, client);
  if (authClients.size > 5) {
    authClients.delete(authClients.keys().next().value);
  }
  return client;
}
