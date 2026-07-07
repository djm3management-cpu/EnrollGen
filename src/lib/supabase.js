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
let cachedClerkToken = null;
let cachedClerkTokenExp = 0;
let inFlightMint = null;
let warnedWrongAlg = false;

export function registerClerkTokenGetter(getter) {
  clerkTokenGetter = getter;
}

function decodeJwtPart(token, index) {
  try {
    const part = token.split(".")[index];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

// Mint (or reuse) a Clerk token Supabase can actually verify.
// - Cached until shortly before its exp, so Clerk is asked roughly once
//   per minute instead of once per request (dev instances rate-limit
//   token minting; when that limit hit, the old code silently fell back
//   to the default Clerk token and every request 401ed).
// - Tokens not signed with HS256 (the default Clerk session token is
//   RS256) can never verify against the Supabase JWT secret and produce
//   "No suitable key or wrong key type"; degrade to the anon key instead.
async function resolveClerkAccessToken() {
  const now = Date.now() / 1000;
  if (cachedClerkToken && cachedClerkTokenExp - now > 15) {
    return cachedClerkToken;
  }

  if (!inFlightMint) {
    inFlightMint = (async () => {
      try {
        const token = await clerkTokenGetter?.();
        if (!token) return supabaseAnonKey;

        const header = decodeJwtPart(token, 0);
        if (header?.alg && header.alg !== "HS256") {
          if (!warnedWrongAlg) {
            warnedWrongAlg = true;
            console.warn(
              "[supabase] Clerk returned a non-HS256 token (likely the default session token; " +
                "is the 'supabase' JWT template configured?). Falling back to anonymous access."
            );
          }
          return supabaseAnonKey;
        }

        const payload = decodeJwtPart(token, 1);
        cachedClerkToken = token;
        cachedClerkTokenExp = payload?.exp || Date.now() / 1000 + 50;
        return token;
      } catch {
        const now = Date.now() / 1000;
        const cachedStillValid = cachedClerkToken && cachedClerkTokenExp - now > 0;
        return cachedStillValid ? cachedClerkToken : supabaseAnonKey;
      } finally {
        inFlightMint = null;
      }
    })();
  }

  return inFlightMint;
}

export function getClerkSupabase() {
  if (!clerkTokenGetter) return null;
  if (!clerkClient) {
    clerkClient = createClient(supabaseUrl, supabaseAnonKey, {
      accessToken: resolveClerkAccessToken,
      // The accessToken option only manages the Authorization bearer;
      // Supabase's gateway still requires the anon key in the apikey
      // header on every request ("No API key found in request").
      global: { headers: { apikey: supabaseAnonKey } },
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
