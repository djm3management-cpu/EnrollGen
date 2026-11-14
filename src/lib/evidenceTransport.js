// Tables holding evidence or plaintext duplicates are readable only through
// ownership-scoped audited database routines. Keep Supabase's query/result API.
export const AUDITED_TABLES = new Set(['call_transcripts', 'transcript_chunks', 'call_records', 'sessions', 'call_logs', 'call_threads', 'compliance_flags', 'section_scores', 'compliance_scorecards', 'compliance_scores', 'intent_detections', 'phi_redactions', 'scorecard_items', 'inbound_calls', 'telephony_events', 'contact_lead_intel', 'contact_notes', 'contact_activities', 'messages', 'follow_ups', 'followup_queue', 'opportunities', 'opportunity_events', 'opportunity_stage_history', 'sales_log', 'call_insights', 'agent_coaching','v_enrollment_summary','v_agent_performance','v_compliance_overview','v_pipeline_status','v_daily_activity']);
export function evidenceTransport(send=(...args)=>fetch(...args)) {
 return async (input,init={})=>{
  const url=new URL(input instanceof Request?input.url:input);
  const table=/\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
  if(AUDITED_TABLES.has(table) && ['GET','HEAD'].includes(init.method || (input instanceof Request?input.method:'GET'))){
   url.pathname=url.pathname.replace('/rest/v1/'+table,'/rest/v1/rpc/read_evidence_'+table);
   const id=url.searchParams.get('id');
   if(/^eq\.[0-9a-f-]{36}$/i.test(id || '')){url.searchParams.set('p_resource',id.slice(3));url.searchParams.set('p_action','read');}
   const params={};for(const key of ['p_resource','p_action'])if(url.searchParams.has(key)){params[key]=url.searchParams.get(key);url.searchParams.delete(key);}
   const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init.headers).forEach((v,k)=>headers.set(k,v));headers.set('Content-Type','application/json');
   // Audited reads are POST: PostgREST GET/HEAD transactions are read only.
   return send(url.href,{...init,method:'POST',headers,body:JSON.stringify(params)});
  }
  if(['call_records','contact_notes','follow_ups','followup_queue','messages'].includes(table) && (init.method || (input instanceof Request?input.method:'GET'))==='PATCH'){
   const id=url.searchParams.get('id');
   if(/^eq\.[0-9a-f-]{36}$/i.test(id || '')){
    const expected={};
    for(const [key,value] of url.searchParams){if(key==='select')continue;if(!/^[a-z_]+$/.test(key)||!value.startsWith('eq.'))throw Error('Unsupported content filter');expected[key]=value.slice(3);}
    const patch=JSON.parse(init.body || await input.clone().text());
    url.pathname=url.pathname.replace('/rest/v1/'+table,'/rest/v1/rpc/update_evidence_'+table);
    for(const key of [...url.searchParams.keys()])if(key!=='select')url.searchParams.delete(key);
    return send(url.href,{...init,method:'POST',body:JSON.stringify({p_resource:id.slice(3),p_patch:patch,p_expected:expected})});
   }
  }
  return send(input,init);
 };
}
