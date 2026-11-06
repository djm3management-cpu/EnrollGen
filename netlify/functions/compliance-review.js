import {authorizeRecordingTarget,listTargetRecordings} from './_recordingAccess.js';
import {prepareVersion,saveVersion} from '../lib/complianceVersions.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {EvidenceError,checked,evidenceJson,evidenceFailure,getEvidenceServiceClient,resolveCallAccessIdentity} from './_evidenceAccess.js';
import {transcriptCoverage,sortTranscript} from '../../src/compliance/rules/transcript.js';
import {RULES_VERSION} from '../../src/compliance/rules/catalog.js';
export function createComplianceReviewHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,transport=fetch,env=process.env}={}){
 return async request=>{
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const input=request.method==='GET'?Object.fromEntries(new URL(request.url).searchParams):await request.json();
   if(!/^[0-9a-f-]{36}$/i.test(input.call_id||''))throw new EvidenceError(400,'Call ID required');
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
   const call=checked(await db.from('call_records').select('*').eq('id',input.call_id).eq('tenant_id',identity.tenant.id).maybeSingle());
   if(!call)throw new EvidenceError(403,'Call unavailable');
   const coverage=transcriptCoverage(call);
   if(!call.agent_name||call.agent_name==='Agent'){
    const owner=checked(await db.from('enrolled_agents').select('clerk_user_id,name').eq('id',call.agent_id).eq('tenant_id',call.tenant_id).maybeSingle());
    const subject=owner?checked(await db.from('availability_agent_subjects').select('agent_slug').eq('clerk_user_id',owner.clerk_user_id).eq('tenant_id',call.tenant_id).eq('is_active',true).maybeSingle()):null;
    call.agent_name=owner?.name&&owner.name!=='Agent'?owner.name:subject?.agent_slug?.split('_').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ')||call.agent_name;
   }
   if(request.method==='GET'){
    const versions=checked(await db.from('compliance_scorecards').select('*').eq('call_id',call.id).eq('tenant_id',call.tenant_id).order('created_at',{ascending:false}));
    const card=versions.find(c=>c.id===(input.version_id||call.compliance_scorecard_id))||versions[0]||null;
    const activePass=checked(await db.from('compliance_llm_passes').select('id,created_at').eq('call_id',call.id).eq('tenant_id',call.tenant_id).in('status',['reserved','running']).limit(1).maybeSingle());
    const items=card?checked(await db.from('scorecard_items').select('*').eq('scorecard_id',card.id).order('display_order')):[];
    let contact=null;
    if(call.contact_id){contact=checked(await db.from('contacts').select('first_name,last_name,source,pii_encrypted').eq('id',call.contact_id).eq('tenant_id',call.tenant_id).maybeSingle());
     for(const k of ['first_name','last_name'])if(contact?.pii_encrypted?.[k])contact[k]=checked(await db.rpc('decrypt_pii_value',{p_encrypted:contact.pii_encrypted[k]}));}
    return evidenceJson(200,{call:{...call,transcript_diarized:sortTranscript(call.transcript_diarized),beneficiary_name:call.beneficiary_name||[contact?.first_name,contact?.last_name].filter(Boolean).join(' ')||null},coverage,versions,scorecard:card,items,active_pass:activePass,admin:identity.admin,source:contact?.source||null});
   }
   if(!identity.admin)throw new EvidenceError(403,'Administrator required');
   const estimatedInputTokens=Math.ceil(JSON.stringify(sortTranscript(call.transcript_diarized)).length/3.5)+4000;
   const inputRate=Number(env.SCORING_INPUT_USD_PER_MILLION),outputRate=Number(env.SCORING_OUTPUT_USD_PER_MILLION),batchRate=Number(env.DEEPGRAM_BATCH_PER_MINUTE_USD);
   const priceConfigured=Number.isFinite(inputRate)&&inputRate>0&&Number.isFinite(outputRate)&&outputRate>0;
   if(input.action==='preview')return evidenceJson(200,{coverage,estimated_input_tokens:estimatedInputTokens,maximum_output_tokens:4096,estimated_cost_usd:priceConfigured?(estimatedInputTokens*inputRate+4096*outputRate)/1e6:null,gap_minutes:coverage.missingMinutes,gap_cost_usd:Number.isFinite(batchRate)&&batchRate>0?coverage.missingMinutes*(call.metadata?.recording_channel_speakers?.length||2)*batchRate:null,rules_version:RULES_VERSION});
   if(['evaluate','review'].includes(input.action)){
    if(input.action==='review'&&!['confirm','dismiss'].includes(input.decision))throw new EvidenceError(400,'Choose confirm or dismiss');
    const decision=input.action==='review'?{item_id:input.item_id,decision:input.decision,note:String(input.note||'').slice(0,2000)}:null;
    const started=Date.now();
    const payload=await prepareVersion(db,call,decision);
    Object.assign(payload.scorecard,{scoring_duration_ms:Date.now()-started,tokens_used:0,estimated_cost_usd:0,request_attempts:0});
    if(input.dry_run!==false||env.COMPLIANCE_RULES_VERSION!==RULES_VERSION)return evidenceJson(200,{dry_run:true,...payload});
    if(input.confirm!==true||!/^[0-9a-f-]{36}$/i.test(input.request_id||''))throw new EvidenceError(400,'Confirmed request ID required');
    const id=await saveVersion(db,call,payload,{requestId:input.request_id,userId:auth.userId,decision});
    return evidenceJson(200,{scorecard_id:id});
   }
   if(input.action==='fill'){
    if(env.TRANSCRIPT_GAP_FILL_ENABLED!=='true')throw new EvidenceError(409,'Manual gap fill disabled');
    if(input.confirm!==true||!/^[0-9a-f-]{36}$/i.test(input.request_id||''))throw new EvidenceError(400,'Confirmed request ID required');
    if(!Number.isFinite(batchRate)||batchRate<=0)throw new EvidenceError(409,'Contracted pricing is not configured');
    if(coverage.durationNeedsVerification)throw new EvidenceError(409,'Call duration requires verification');
    if(!call.call_end)throw new EvidenceError(409,'Call is still active');
    if(!coverage.missingRanges.length)throw new EvidenceError(409,'No transcript gaps');
    const mapping=call.metadata?.recording_channel_speakers;
    const offset=call.metadata?.recording_timeline_offset_ms;
    if(!Array.isArray(mapping)||!mapping.length||mapping.length>2||mapping.some(s=>!['agent','customer'].includes(s))||!Number.isFinite(offset))throw new EvidenceError(409,'Recording channel and timestamp mapping is not verified');
    const target=await authorizeRecordingTarget(db,identity,{call_record_id:call.id});
    const recordings=await listTargetRecordings(db,identity,target);
    const recording=recordings.find(r=>r.id===call.metadata?.gap_fill_recording_id);
    if(!recording||String(recording.id).startsWith('legacy:'))throw new EvidenceError(409,'Choose a verified full-call recording before gap fill');
    const estimated=coverage.missingMinutes*mapping.length*batchRate;
    if(!Number.isFinite(input.approved_gap_cost_usd)||!Number.isFinite(input.approved_gap_minutes)||input.approved_gap_cost_usd<estimated||input.approved_gap_minutes<coverage.missingMinutes)throw new EvidenceError(409,'Gap estimate changed; confirm again');
    const existing=checked(await db.from('manual_transcript_gap_fills').select('id').eq('request_id',input.request_id).maybeSingle());
    if(existing)return evidenceJson(200,{job_id:existing.id,reused:true});
    const job=checked(await db.from('manual_transcript_gap_fills').insert({request_id:input.request_id,call_id:call.id,tenant_id:call.tenant_id,recording_id:recording.id,requested_by:auth.userId,source_transcript:call.transcript_diarized,ranges:coverage.missingRanges,channel_speakers:mapping,timeline_offset_ms:offset,estimated_cost_usd:estimated}).select('*').single());
    const origin=new URL(env.COMPLIANCE_APP_ORIGIN||'https://enrollgen.com').origin;
    try{const response=await transport(`${origin}/.netlify/functions/transcript-gaps-background`,{method:'POST',headers:{'Content-Type':'application/json','x-enrollgen-job-secret':env.SCORE_CALL_JOB_SECRET},body:JSON.stringify({job_id:job.id}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Gap-fill delivery failed');}
    catch(error){checked(await db.from('manual_transcript_gap_fills').update({status:'failed',error:'delivery_failed'}).eq('id',job.id));throw error;}
    return evidenceJson(202,{job_id:job.id});
   }
   if(input.action==='rescore'){
    if(env.SCORING_ENABLED!=='true'||env.COMPLIANCE_RULES_VERSION!==RULES_VERSION)throw new EvidenceError(409,'Scoring disabled');
    if(!coverage.complete)throw new EvidenceError(409,'SCORING INCOMPLETE');
    if(!priceConfigured)throw new EvidenceError(409,'Contracted pricing is not configured');
    const estimate=(estimatedInputTokens*inputRate+4096*outputRate)/1e6;
    if(!Number.isFinite(input.approved_cost_usd)||input.approved_cost_usd<estimate)throw new EvidenceError(409,'Scoring estimate changed; confirm again');
    if(input.confirm!==true||!/^[0-9a-f-]{36}$/i.test(input.request_id||''))throw new EvidenceError(400,'Confirmed request ID required');
    const pass=checked(await db.rpc('claim_compliance_pass',{p_call_id:call.id,p_tenant_id:call.tenant_id,p_request_id:input.request_id,p_mode:'manual',p_requested_by:auth.userId}));
    if(pass.status!=='claimed')throw new EvidenceError(409,pass.status);
    const origin=new URL(env.COMPLIANCE_APP_ORIGIN||'https://enrollgen.com').origin;
    if(!origin.startsWith('https://'))throw new EvidenceError(503,'Invalid compliance origin');
    try{
     const response=await transport(`${origin}/.netlify/functions/compliance-review-background`,{method:'POST',headers:{'Content-Type':'application/json','x-enrollgen-job-secret':env.SCORE_CALL_JOB_SECRET},body:JSON.stringify({pass_id:pass.id}),signal:AbortSignal.timeout(10000)});
     if(!response.ok)throw Error('Manual scoring delivery failed');
    }catch(error){checked(await db.from('compliance_llm_passes').update({status:'failed'}).eq('id',pass.id));throw error;}
    return evidenceJson(202,{pass_id:pass.id});
   }
   throw new EvidenceError(409,'Rubric validation and paid-action rollout are not approved');
  }catch(error){return evidenceFailure(error);}
 };
}
export default createComplianceReviewHandler();
