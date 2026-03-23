import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://qzjtagnpklaxefwurorc.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6anRhZ25wa2xheGVmd3Vyb3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODY1NDQsImV4cCI6MjA4ODI2MjU0NH0.HLYREWlaqsMdhGqaoP2T2SP3SgAoxumKGG4aQuBzx4Q";

// Base client for unauthenticated/embedding queries (existing usage)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Authenticated client factory — pass Clerk JWT for RLS
export function getAuthSupabase(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
