import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Service role client. Server side only; never expose this key
// to the browser or vendor responses.
export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);
