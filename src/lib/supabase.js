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

// Fresh-token client: instead of pinning one Clerk JWT at creation (they
// expire in about 60 seconds, after which every request 401s), this
// client asks Clerk for a current token before each request via the
// supabase-js accessToken hook. One singleton serves the whole app.
let clerkTokenGetter = null;
let clerkClient = null;

export function registerClerkTokenGetter(getter) {
  clerkTokenGetter = getter;
}

export function getClerkSupabase() {
  if (!clerkTokenGetter) return null;
  if (!clerkClient) {
    clerkClient = createClient(supabaseUrl, supabaseAnonKey, {
      accessToken: async () => {
        try {
          const token = await clerkTokenGetter?.();
          // Fall back to the anon key so requests degrade to
          // RLS-anonymous instead of failing with a missing header.
          return token || supabaseAnonKey;
        } catch {
          return supabaseAnonKey;
        }
      },
    });
  }
  return clerkClient;
}

// Authenticated client factory - pass Clerk JWT for RLS.
// Prefer getClerkSupabase() for long-lived clients; this factory pins
// the given token, which Clerk expires in about 60 seconds.
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
