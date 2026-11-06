// Uses the existing tenant-scoped telemetry/billing table and its service-role RLS.
export function llmRuntime(supabase, tenantId, context, metadata = {}) {
  return {
    waitUntil: context?.waitUntil?.bind(context),
    async authorizeScoringRequest(request,model,requestId) {
      if(!metadata.pass_id)throw new Error('Scoring pass is not authorized');
      const dailyCap=Number(process.env.SCORING_DAILY_TOKEN_CAP);
      const inputRate=Number(process.env.SCORING_INPUT_USD_PER_MILLION),outputRate=Number(process.env.SCORING_OUTPUT_USD_PER_MILLION);
      if(!Number.isSafeInteger(dailyCap)||dailyCap<1||!(inputRate>0)||!(outputRate>0))throw new Error('Scoring budget and pricing must be configured');
      const tokens=Math.ceil(JSON.stringify(request).length/3.5)+(request.max_completion_tokens||4096);
      const {error}=await supabase.rpc('reserve_compliance_request',{p_pass_id:metadata.pass_id,p_request_id:requestId,p_model:model,p_tokens:tokens,p_daily_cap:dailyCap,p_fallback:false});
      if(error){if(error.message?.includes('daily_scoring_token_cap'))error.code='daily_scoring_token_cap';throw error;}
    },
    async telemetry(row) {
      if(metadata.pass_id){
        const env=process.env;
        const inputRate=Number(env.SCORING_INPUT_USD_PER_MILLION),outputRate=Number(env.SCORING_OUTPUT_USD_PER_MILLION);
        const cost=Number.isFinite(inputRate)&&Number.isFinite(outputRate)?((row.prompt_tokens||0)*inputRate+(row.completion_tokens||0)*outputRate)/1e6:null;
        const {error}=await supabase.from('compliance_llm_requests').update({input_tokens:row.prompt_tokens||0,output_tokens:row.completion_tokens||0,estimated_cost_usd:cost,error_code:row.metadata?.error_code||null,completed_at:new Date().toISOString()}).eq('request_id',row.request_id).eq('pass_id',metadata.pass_id);
        if(error)throw error;
      }

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
