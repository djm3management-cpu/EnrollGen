import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { createHandler } from './handler.js';
import { edgeSupabaseSecretKey, edgeSupabaseFetch } from '../_shared/supabaseKeys.js';

// Reuse the client across warm invocations. Never cache authentication or leases.
const secretKey = edgeSupabaseSecretKey((name: string) => Deno.env.get(name));
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!, secretKey,
  { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: edgeSupabaseFetch(secretKey) } },
);
Deno.serve(createHandler({
  rpc: (params: { p_key_hash: string; p_agent_id: string | null }) =>
    supabase.rpc('get_availability_feed', params).abortSignal(AbortSignal.timeout(2000)),
  paragonPing: (params: { p_key_hash: string; p_state: string | null; p_phone: string | null; p_call_id: string | null; p_routing_enabled: boolean }) =>
    supabase.rpc('paragon_ping', params).abortSignal(AbortSignal.timeout(2000)),
  routingEnabled: Deno.env.get('PARAGON_STATE_ROUTING_ENABLED')?.toLowerCase() === 'true',
  fieldMap: Deno.env.get('PARAGON_PING_FIELD_MAP'),
}));
