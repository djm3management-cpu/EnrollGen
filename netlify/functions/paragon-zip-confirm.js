import { requireClerkAuth } from './_clerkAuth.js';
import { NGHS_TENANT_ID, JSON_HEADERS, getSupabase } from './_tenantSettings.js';

const json = (body,status=200) => new Response(JSON.stringify(body),{ status,headers:JSON_HEADERS });
export function createParagonZipHandler({authenticate=requireClerkAuth,getDb=getSupabase}={}) {
 return async request => {
 try {
  if (!['GET','POST'].includes(request.method)) return json({ error:'Method not allowed' },405);
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const db = getDb();
  if(auth.orgId){
    const {data:tenant,error}=await db.from('tenants').select('clerk_org_id').eq('id',NGHS_TENANT_ID).maybeSingle();
    if(error||!tenant||tenant.clerk_org_id!==auth.orgId)return json({error:'Agency unavailable'},403);
  }
  const { data:agent,error:agentError } = await db.from('tenant_agents')
    .select('id,agent_slug').eq('tenant_id',NGHS_TENANT_ID).eq('clerk_user_id',auth.userId)
    .eq('is_active',true).maybeSingle();
  if (agentError || !agent) return request.method === 'GET' ? json({ tasks:[] }) : json({ error:'Agent unavailable' },403);
  if (request.method === 'GET') {
    const params=new URL(request.url).searchParams;
    const summary=params.get('summary')==='1';
    const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||500);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500)return json({error:'Invalid callback page.'},400);
    const result=await db.from('paragon_callback_tasks')
      .select('id,inbound_call_id,assigned_agent_id,caller_state,confirmed_zip,created_at,due_at,status',{count:'exact',head:summary})
      .eq('tenant_id',NGHS_TENANT_ID).eq('assigned_agent_id',agent.agent_slug).eq('status','open')
      .order('created_at',{ascending:false}).order('id').range(offset,offset+limit-1);
    if(result.error)return json({error:'Callback tasks unavailable'},503);
    if(summary)return json({count:result.count||0});
    const tasks=result.data||[],ids=tasks.map(task=>task.inbound_call_id);
    const calls=[],records=[];
    for(let offset=0;offset<ids.length;offset+=100){
      const {data,error}=await db.from('inbound_calls').select('id,from_number,call_record_id').eq('tenant_id',NGHS_TENANT_ID).in('id',ids.slice(offset,offset+100));
      if(error)return json({error:'Callback call details unavailable'},503);calls.push(...(data||[]));
    }
    const recordIds=[...new Set(calls.map(call=>call.call_record_id).filter(Boolean))];
    for(let offset=0;offset<recordIds.length;offset+=100){
      const {data,error}=await db.from('call_records').select('id,contact_id,customer_first_name,customer_last_name').eq('tenant_id',NGHS_TENANT_ID).in('id',recordIds.slice(offset,offset+100));
      if(error)return json({error:'Callback caller details unavailable'},503);records.push(...(data||[]));
    }
    const contactNames=new Map();
    const missingNameIds=[...new Set(records.filter(record=>record.contact_id&&(!record.customer_first_name||!record.customer_last_name)).map(record=>record.contact_id))];
    for(let offset=0;offset<missingNameIds.length;offset+=100){
      const {data:contacts,error}=await db.from('contacts').select('id,pii_encrypted').eq('tenant_id',NGHS_TENANT_ID).in('id',missingNameIds.slice(offset,offset+100));
      if(error)return json({error:'Callback contact details unavailable'},503);
      for(const contact of contacts||[]){
        const names=await Promise.all(['first_name','last_name'].map(async key=>{
          const encrypted=contact.pii_encrypted?.[key];if(!encrypted)return '';
          const {data,error}=await db.rpc('decrypt_pii_value',{p_encrypted:encrypted});if(error)throw Error('Contact name unavailable');return data||'';
        }));
        contactNames.set(contact.id,names);
      }
    }
    return json({count:result.count||0,tasks:tasks.map(task=>{
      const call=calls.find(call=>call.id===task.inbound_call_id),record=records.find(record=>record.id===call?.call_record_id);
      return {...task,caller_phone:call?.from_number||'',caller_name:[record?.customer_first_name||contactNames.get(record?.contact_id)?.[0],record?.customer_last_name||contactNames.get(record?.contact_id)?.[1]].filter(Boolean).join(' ')||'Unknown caller',call_record_id:call?.call_record_id||null,contact_id:record?.contact_id||null};
    })});
  }
  const { inbound_call_id,zip,state,action,task_id,due_at } = await request.json().catch(() => ({}));
  if (['complete','reschedule'].includes(action)) {
    if(typeof task_id!=='string'||!/^[0-9a-f-]{36}$/i.test(task_id))return json({error:'Task ID required'},400);
    if(action==='reschedule'&&(!due_at||!Number.isFinite(Date.parse(due_at))))return json({error:'A valid due date is required'},400);
    const patch=action==='complete'?{status:'completed',closed_at:new Date().toISOString()}:{due_at:new Date(due_at).toISOString()};
    const {data,error}=await db.from('paragon_callback_tasks').update(patch)
      .eq('id',task_id).eq('tenant_id',NGHS_TENANT_ID).eq('assigned_agent_id',agent.agent_slug).eq('status','open').select('id').maybeSingle();
    return error?json({error:'Unable to update callback task'},503):!data?json({error:'Callback task unavailable'},403):json({saved:true});
  }
  if (typeof inbound_call_id !== 'string' || !/^\d{5}$/.test(zip || '')) return json({ error:'Enter a valid five digit ZIP.' },400);
  const { data:call,error:callError } = await db.from('inbound_calls').select('id,routed_agent_id,source_kind,lead_source_id,tenant_id')
    .eq('id',inbound_call_id).eq('tenant_id',NGHS_TENANT_ID).maybeSingle();
  if (callError || !call || call.routed_agent_id!==agent.agent_slug || call.source_kind!=='publisher') return json({ error:'Call unavailable' },403);
  const { data:source } = await db.from('lead_sources').select('id').eq('id',call.lead_source_id)
    .eq('name','Paragon Media').maybeSingle();
  if (!source) return json({ error:'Not a Paragon call' },403);
  const { data:zipRows,error:zipError } = await db.from('zip_county_crosswalk').select('state_code').eq('zip',zip);
  if (zipError) return json({ error:'ZIP lookup unavailable' },503);
  const states = [...new Set((zipRows || []).map(row => row.state_code).filter(value => /^[A-Z]{2}$/.test(value)))].sort();
  if (!states.length) return json({ error:'ZIP not found. Verify the beneficiary residence ZIP.' },422);
  if (states.length>1 && !state) return json({ states,needs_state_selection:true });
  const confirmedState = state || states[0];
  if (!states.includes(confirmedState)) return json({ error:'State does not match ZIP.' },400);
  const {data:result,error}=await db.rpc('confirm_paragon_call_state',{
    p_call:call.id,p_tenant:NGHS_TENANT_ID,p_agent:agent.agent_slug,p_zip:zip,p_state:confirmedState,
  });
  return error?json({error:'Unable to confirm eligibility and callback assignment'},503):json(result);
 }catch{return json({error:'Paragon callbacks unavailable. Please retry.'},503);}
 };
}
export default createParagonZipHandler();
