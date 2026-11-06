import {scoringCost,scoringDailyCap} from '../../src/compliance/shared/scoringConfig.js';
import {sendProviderFailureAlert} from '../lib/postCallProvider.js';
// Uses the existing tenant-scoped telemetry/billing table and its service-role RLS.
export function llmRuntime(supabase, tenantId, context, metadata = {}) {
  return {
    waitUntil: context?.waitUntil?.bind(context),
    async authorizeScoringRequest(request,model,requestId) {
      if(!metadata.pass_id)throw new Error('Scoring pass is not authorized');
      const dailyCap=scoringDailyCap(process.env);
      // Byte upper bound plus framing and full output reservation. Never refund
      // uncertain or failed requests. This can stop earlier than measured usage.
      const tokens=new TextEncoder().encode(JSON.stringify(request)).length+512+(request.max_completion_tokens||4096);
      const {data,error}=await supabase.rpc('reserve_compliance_request',{p_pass_id:metadata.pass_id,p_request_id:requestId,p_model:model,p_tokens:tokens,p_daily_cap:dailyCap,p_fallback:false});
      if(error)throw error;
      if(data?.alert_claimed)await sendProviderFailureAlert(supabase,metadata.call_record_id,'scoring','daily_scoring_token_cap',{dailyClaim:data.day}).catch(error=>console.error('daily_cap_alert_failed',error.message));
      if(data?.status==='daily_cap')throw Object.assign(new Error('daily_scoring_token_cap'),{code:'daily_scoring_token_cap'});

    },
    async telemetry(row) {
      if(metadata.pass_id){
        const cost=scoringCost(row.prompt_tokens,row.completion_tokens,row.cached_tokens);
        const {error}=await supabase.from('compliance_llm_requests').update({input_tokens:row.prompt_tokens||0,cached_input_tokens:Math.min(row.prompt_tokens||0,Math.max(0,row.cached_tokens||0)),output_tokens:row.completion_tokens||0,estimated_cost_usd:cost,error_code:row.metadata?.error_code||null,completed_at:new Date().toISOString()}).eq('request_id',row.request_id).eq('pass_id',metadata.pass_id);
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
