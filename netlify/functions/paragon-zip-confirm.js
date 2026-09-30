import { requireClerkAuth } from './_clerkAuth.js';
import { NGHS_TENANT_ID, JSON_HEADERS, getSupabase } from './_tenantSettings.js';

const json = (body,status=200) => new Response(JSON.stringify(body),{ status,headers:JSON_HEADERS });
export default async request => {
  if (!['GET','POST'].includes(request.method)) return json({ error:'Method not allowed' },405);
  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;
  const db = getSupabase();
  const { data:agent,error:agentError } = await db.from('tenant_agents')
    .select('id,agent_slug').eq('tenant_id',NGHS_TENANT_ID).eq('clerk_user_id',auth.userId)
    .eq('is_active',true).maybeSingle();
  if (agentError || !agent) return request.method === 'GET' ? json({ tasks:[] }) : json({ error:'Agent unavailable' },403);
  if (request.method === 'GET') {
    const { data:tasks,error } = await db.from('paragon_callback_tasks')
      .select('id,inbound_call_id,caller_state,confirmed_zip,created_at,status')
      .eq('tenant_id',NGHS_TENANT_ID).eq('assigned_agent_id',agent.agent_slug).eq('status','open').order('created_at',{ ascending:false }).limit(50);
    if (error) return json({ error:'Callback tasks unavailable' },503);
    const ids = (tasks || []).map(task => task.inbound_call_id);
    const { data:calls } = ids.length ? await db.from('inbound_calls').select('id,from_number').in('id',ids) : { data:[] };
    return json({ tasks:(tasks || []).map(task => ({ ...task,caller_phone:calls?.find(call => call.id===task.inbound_call_id)?.from_number || null })) });
  }
  const { inbound_call_id,zip,state,action,task_id } = await request.json().catch(() => ({}));
  if (action === 'complete') {
    if (typeof task_id !== 'string') return json({ error:'Task ID required' },400);
    const { error } = await db.from('paragon_callback_tasks').update({ status:'completed' })
      .eq('id',task_id).eq('tenant_id',NGHS_TENANT_ID).eq('assigned_agent_id',agent.agent_slug).eq('status','open');
    return error ? json({ error:'Unable to complete task' },503) : json({ completed:true });
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
  const { data:tier,error:tierError } = await db.rpc('paragon_agent_tier',{
    p_agent_id:agent.agent_slug,p_state:confirmedState,p_source_id:source.id,
  });
  if (tierError) return json({ error:'Eligibility unavailable' },503);
  const wrongState = !['full','partial'].includes(tier);
  const { error:updateError } = await db.from('inbound_calls').update({
    confirmed_zip:zip,confirmed_state:confirmedState,wrong_state:wrongState,
    return_reason:wrongState ? 'wrong_state' : null,
  }).eq('id',call.id);
  if (updateError) return json({ error:'Unable to save ZIP confirmation' },503);
  let callbackAgent = null;
  if (wrongState) {
    const { data:matrix } = await db.from('vendor_agent_state_eligibility').select('agent_id')
      .eq('source_id',source.id).eq('state',confirmedState);
    const { data:agents } = await db.from('tenant_agents').select('id,agent_slug,npn')
      .eq('tenant_id',NGHS_TENANT_ID).eq('is_active',true);
    const { data:availability } = await db.from('agent_availability').select('agent_id,last_assigned_at');
    const { data:priorTasks } = await db.from('paragon_callback_tasks')
      .select('assigned_agent_id,created_at').eq('tenant_id',NGHS_TENANT_ID)
      .order('created_at',{ ascending:false }).limit(1000);
    const eligible = [];
    for (const candidate of agents || []) {
      if (!matrix?.some(row => row.agent_id===candidate.id)) continue;
      const { data:candidateTier } = await db.rpc('paragon_agent_tier',{
        p_agent_id:candidate.agent_slug,p_state:confirmedState,p_source_id:source.id,
      });
      if (['full','partial'].includes(candidateTier)) eligible.push(candidate);
    }
    eligible.sort((a,b) => {
      const aTask = priorTasks?.find(task => task.assigned_agent_id===a.agent_slug)?.created_at || '';
      const bTask = priorTasks?.find(task => task.assigned_agent_id===b.agent_slug)?.created_at || '';
      if (aTask!==bTask) return aTask.localeCompare(bTask);
      const at = availability?.find(row => row.agent_id===a.agent_slug)?.last_assigned_at || '';
      const bt = availability?.find(row => row.agent_id===b.agent_slug)?.last_assigned_at || '';
      return at.localeCompare(bt) || a.agent_slug.localeCompare(b.agent_slug);
    });
    callbackAgent = eligible[0]?.agent_slug || agents?.find(candidate => candidate.npn==='20574678')?.agent_slug;
    if (callbackAgent) {
      const { error:taskError } = await db.from('paragon_callback_tasks').upsert({
        inbound_call_id:call.id,tenant_id:NGHS_TENANT_ID,assigned_agent_id:callbackAgent,
        caller_state:confirmedState,confirmed_zip:zip,reason:'wrong_state',
      },{ onConflict:'inbound_call_id' });
      if (taskError) return json({ error:'Unable to create callback task' },503);
    }
  }
  return json({ confirmed:true,zip,state:confirmedState,tier,wrong_state:wrongState,callback_agent_id:callbackAgent });
};
