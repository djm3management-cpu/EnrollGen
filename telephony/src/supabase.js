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

// Storage upload() doesn't forward a signal option in the installed SDK.
// Bound the actual fetch transport for the recording worker instead.
export function createRecordingServiceClient() {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(config.recordingTimeoutMs)])
        : AbortSignal.timeout(config.recordingTimeoutMs),
    }) },
  });
}
