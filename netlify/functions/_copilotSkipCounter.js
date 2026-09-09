const ENGINES = new Set(['MA', 'MEDSUP', 'ACA', 'U65']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validSkipCounter(body) {
  return !!body && ENGINES.has(body.engine) && UUID.test(body.session_id)
    && Number.isSafeInteger(body.skipped_ticks) && body.skipped_ticks > 0 && body.skipped_ticks <= 1000000;
}

export async function recordSkipCounter(supabase, tenantId, userId, body) {
  if (!validSkipCounter(body)) throw new Error('Invalid skip counter');
  const { error } = await supabase.rpc('record_llm_skipped_ticks', {
    p_tenant_id: tenantId, p_user_id: userId, p_engine: body.engine,
    p_session_id: body.session_id, p_count: body.skipped_ticks,
  });
  if (error) throw error;
}
