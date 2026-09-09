// Uses the existing tenant-scoped telemetry/billing table and its service-role RLS.
export function llmRuntime(supabase, tenantId, context, metadata = {}) {
  return {
    waitUntil: context?.waitUntil?.bind(context),
    async telemetry(row) {
      const { error } = await supabase.from('usage_records').insert({
        ...row,
        tenant_id: tenantId,
        record_type: row.metadata?.event === 'shadow_compare' ? 'llm_shadow_compare' : 'llm_tokens',
        quantity: (row.prompt_tokens || 0) + (row.completion_tokens || 0),
        metadata: { ...metadata, ...row.metadata },
      });
      if (error) throw error;
    },
  };
}
