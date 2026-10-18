/** PREPARED ONLY: do not execute against production without the user's approval.
 * Export the read-only inventory query to JSON; pass --plan path.json.
 * Dry-run is the default. --execute explicitly authorizes queueing listed sessions.
 * Recovery finalizes transcript evidence and scores; it never resubmits sales/webhooks.
 */
import fs from 'node:fs/promises';
import {createSupabaseAdminClient} from '../sep-data/common.js';
import {postCallRequestKey} from '../../netlify/functions/post-call.js';
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
if (!args.includes('--plan')) throw new Error('Export dylan_missing_post_call_output.sql as JSON, then pass --plan <file>.');
const plan=JSON.parse(await fs.readFile(value('--plan'),'utf8'));
if (!Array.isArray(plan) || !plan.every(row=>/^[0-9a-f-]{36}$/i.test(row.session_id || ''))) throw new Error('Invalid session inventory.');
if (!args.includes('--execute')) {
 console.log(JSON.stringify({dry_run:true,session_ids:[...new Set(plan.map(row=>row.session_id))],count:plan.length}));
 process.exit(0);
}
const db=await createSupabaseAdminClient();
const checked=result=>{if(result.error)throw result.error;return result.data;};
const roster=checked(await db.from('tenant_agents').select('tenant_id,clerk_user_id').eq('agent_slug','dylan_maria').eq('is_active',true).single());
const agent=checked(await db.from('enrolled_agents').select('id').eq('tenant_id',roster.tenant_id).eq('clerk_user_id',roster.clerk_user_id).eq('is_active',true).single());
const tenant=checked(await db.from('tenants').select('clerk_org_id').eq('id',roster.tenant_id).single());
for(const sessionId of [...new Set(plan.map(row=>row.session_id))]) {
 const session=checked(await db.from('sessions').select('id,call_record_id,flow,ended_at').eq('id',sessionId).eq('tenant_id',roster.tenant_id).eq('agent_id',agent.id).single());
 if (!session.ended_at) {
  console.log(JSON.stringify({session_id:sessionId,status:'skipped_open_session',note:'Review and close this session before recovery.'}));
  continue;
 }
 const transcript=checked(await db.from('call_transcripts').select('id,transcript_text,call_record_id,disposition,product_line,carrier,plan_name,enrollment_period').eq('session_id',sessionId).eq('tenant_id',roster.tenant_id).order('created_at',{ascending:false}).limit(1).maybeSingle());
 const record=checked(await db.from('call_records').select('id,transcript_raw,compliance_scorecard_id,call_outcome,product_type,carrier_name,plan_name,plan_id,election_period,call_duration_seconds').eq('session_id',sessionId).eq('tenant_id',roster.tenant_id).order('created_at',{ascending:false}).limit(1).maybeSingle());
 if(record?.compliance_scorecard_id && !args.includes('--verify-embeddings')){
  console.log(JSON.stringify({session_id:sessionId,status:'already_scored',note:'Any missing manual wrap-up must be completed by the agent.'}));
  continue;
 }
 const text=transcript?.transcript_text || record?.transcript_raw;
 if(!text?.trim())throw new Error(`No transcript for ${sessionId}`);
 let payload={action:'recover',session_id:sessionId,call_record_id:record?.id || transcript?.call_record_id || session.call_record_id,
 transcript_id:transcript?.id || null,transcript_text:text,flow:session.flow,final:true,
 disposition:transcript?.disposition || undefined,call_outcome:record?.call_outcome || undefined,
 product_type:record?.product_type || transcript?.product_line || session.flow,
 carrier_name:record?.carrier_name || transcript?.carrier || undefined,
 plan_name:record?.plan_name || transcript?.plan_name || undefined,plan_id:record?.plan_id || undefined,
 election_period:record?.election_period || transcript?.enrollment_period || undefined,
 ...(record?.call_duration_seconds != null?{call_duration_seconds:record.call_duration_seconds}:{}),
 };
 let requestKey=postCallRequestKey(payload);
 if (args.includes('--retry-failed')) {
  const prior=checked(await db.from('post_call_requests').select('request_key,payload').eq('session_id',sessionId)
    .eq('action','recover').eq('status','failed').order('created_at',{ascending:false}).limit(1).maybeSingle());
  if(prior){
   if(prior.payload.session_id!==sessionId || prior.payload.action!=='recover')throw new Error('Recovery payload mismatch');
   payload=prior.payload;requestKey=prior.request_key;
   checked(await db.rpc('retry_post_call_recovery',{p_session_id:sessionId,p_request_key:requestKey}));
  }
 }
 const job=checked(await db.rpc('enqueue_post_call_request',{p_session_id:sessionId,p_tenant_id:roster.tenant_id,p_agent_id:agent.id,
 p_user_id:roster.clerk_user_id,p_org_id:tenant.clerk_org_id,p_clerk_session_id:null,
 p_request_key:requestKey,p_action:'recover',p_payload:payload}));
 if(job.dispatch){
  const response=await fetch('https://enrollgen.com/.netlify/functions/post-call-background',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({session_id:sessionId,dispatch_token:job.dispatch_token}),signal:AbortSignal.timeout(10000)});
  if(response.status!==202)throw new Error(`Dispatch failed for ${sessionId}: ${response.status}`);
 }
 console.log(JSON.stringify({session_id:sessionId,status:job.status,request_key:job.request_key}));
}
