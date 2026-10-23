import { debugLog } from "./debugLog.js";
import { createClient } from "@supabase/supabase-js";
import { createClerkFetch } from './clerkFetch.js';
import { supabasePublishableKey, supabaseCmsPublishableKey, supabaseApiKeyFetch } from './supabaseKeys.js';

function requiredEnv(name) {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabaseUrl = requiredEnv("VITE_SUPABASE_URL");
const supabasePublicKey = supabasePublishableKey(import.meta.env);
const supabaseCmsUrl = import.meta.env.VITE_SUPABASE_CMS_URL || supabaseUrl;
const supabaseCmsPublicKey = supabaseCmsPublishableKey(import.meta.env, supabasePublicKey);
const authClients = new Map();

const publicClientOptions = {
  global: { fetch: supabaseApiKeyFetch(supabasePublicKey) },
  // Public Realtime uses its apikey connection parameter, not an opaque user JWT.
  realtime: /^sb_publishable_/.test(supabasePublicKey) ? { accessToken: async () => null } : {},
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "enrollgen-public-supabase",
  },
};

const cmsClientOptions = {
  global: { fetch: supabaseApiKeyFetch(supabaseCmsPublicKey) },
  realtime: /^sb_publishable_/.test(supabaseCmsPublicKey) ? { accessToken: async () => null } : {},
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "enrollgen-cms-supabase",
  },
};

// Base client for unauthenticated/embedding queries (existing usage)
export const supabase = createClient(supabaseUrl, supabasePublicKey, publicClientOptions);
export const supabaseCms = createClient(supabaseCmsUrl, supabaseCmsPublicKey, cmsClientOptions);

// Fresh-token client: instead of pinning one Clerk JWT at creation (they
// expire in about 60 seconds, after which every request 401s), this
// client asks Clerk for a current token before each request via the
// supabase-js accessToken hook. One singleton serves the whole app.
let clerkTokenGetter = null;
let clerkClient = null;
let cachedClerkToken = null;
let cachedClerkTokenExp = 0;
let inFlightMint = null;
let mintGeneration = 0;
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
//   "No suitable key or wrong key type". Keep this legacy Clerk-template
//   requirement until the separate native Clerk integration is configured.
//   An API key must never stand in for a missing user JWT.
async function resolveClerkAccessToken(options = {}) {
  if (options.skipCache) {
    cachedClerkToken = null;
    cachedClerkTokenExp = 0;
    inFlightMint = null;
  }
  const now = Date.now() / 1000;
  if (cachedClerkToken && cachedClerkTokenExp - now > 15) {
    return cachedClerkToken;
  }

  if (!inFlightMint) {
    const generation = ++mintGeneration;
    inFlightMint = (async () => {
      try {
        const token = await clerkTokenGetter?.(options);
        if (!token) return null;

        const header = decodeJwtPart(token, 0);
        if (header?.alg && header.alg !== "HS256") {
          if (!warnedWrongAlg) {
            warnedWrongAlg = true;
            debugLog("lib/supabase.js warn");
          }
          return null;
        }

        const payload = decodeJwtPart(token, 1);
        if (generation === mintGeneration) {
          cachedClerkToken = token;
          cachedClerkTokenExp = payload?.exp || Date.now() / 1000 + 50;
        }
        return token;
      } catch {
        const now = Date.now() / 1000;
        const cachedStillValid = cachedClerkToken && cachedClerkTokenExp - now > 0;
        return cachedStillValid ? cachedClerkToken : null;
      } finally {
        if (generation === mintGeneration) inFlightMint = null;
      }
    })();
  }

  return inFlightMint;
}

export async function refreshClerkSupabaseToken() {
  if (clerkTokenGetter) return resolveClerkAccessToken({skipCache:true});
}

export function getClerkSupabase() {
  if (!clerkTokenGetter) return null;
  if (!clerkClient) {
    clerkClient = createClient(supabaseUrl, supabasePublicKey, {
      accessToken: resolveClerkAccessToken,
      // The accessToken option only manages the Authorization bearer;
      // Supabase's gateway still requires the public API key in the apikey
      // header on every request ("No API key found in request").
      global: { headers: { apikey: supabasePublicKey }, fetch:supabaseApiKeyFetch(supabasePublicKey, createClerkFetch(resolveClerkAccessToken)) },
    });
  }
  return clerkClient;
}

// Authenticated client factory - pass Clerk JWT for RLS.
// Prefer getClerkSupabase() for long-lived clients; this factory pins
// the given token, which Clerk expires in about 60 seconds.
export function getAuthSupabase(token) {
  if (!token) return supabase;
  if (/^sb_(secret|publishable)_/.test(token)) throw new Error("A Supabase API key is not a user JWT");
  const cacheKey = token.slice(-24);
  if (authClients.has(cacheKey)) return authClients.get(cacheKey);

  let currentToken = token;
  const resolveToken = async (options = {}) => {
    if (clerkTokenGetter) currentToken = await resolveClerkAccessToken(options);
    return currentToken;
  };
  const client = createClient(supabaseUrl, supabasePublicKey, {
    // Realtime must receive the same user JWT as REST/Storage, not the API key.
    accessToken: () => resolveToken(),
    global: { headers: { Authorization: `Bearer ${token}` },
      fetch:supabaseApiKeyFetch(supabasePublicKey, createClerkFetch(resolveToken)) },
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
