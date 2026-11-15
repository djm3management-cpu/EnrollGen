import {deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {canonicalCarrier,CARRIER_ALIASES} from '../src/lib/carrierAliases.js';
export {canonicalCarrier,CARRIER_ALIASES};
export function converselyConfiguration(env={}) {
  const samples=Number(env.CONVERSELY_SAMPLES_PER_AGENT ?? 1);
  if(!Number.isSafeInteger(samples) || samples<1 || samples>100)throw Error('invalid_conversely_sample_count');
  const configured=env.CONVERSELY_CARRIERS == null ? Object.keys(CARRIER_ALIASES) : env.CONVERSELY_CARRIERS.split(',').map(s=>s.trim()).filter(Boolean);
  const carriers=[...new Set(configured.map(name=>{
    const carrier=canonicalCarrier(name);if(!carrier)throw Error('invalid_conversely_carrier');return carrier;
  }))];
  // Contract exceptions are configuration data keyed by stable roster slug/UUID/Clerk ID.
  const exclusions=JSON.parse(env.CONVERSELY_AGENT_EXCLUSIONS ?? '{}');
  if(!exclusions || Array.isArray(exclusions) || typeof exclusions!=='object')throw Error('invalid_conversely_exclusions');
  for(const [agent,values] of Object.entries(exclusions)){
    if(!agent || !Array.isArray(values))throw Error('invalid_conversely_exclusions');
    exclusions[agent]=values.map(value=>{const carrier=canonicalCarrier(value);if(!carrier)throw Error('invalid_conversely_exclusions');return carrier;});
  }
  return {samples,carriers,exclusions};
}
export function carrierEligibility(call,config) {
  const carrier=canonicalCarrier(call.carrier_name);
  if(!carrier || !config.carriers.includes(carrier))return 'carrier_not_sms';
  if([call.agent_id,call.agent_slug,call.clerk_user_id].filter(Boolean).some(agent=>config.exclusions[agent]?.includes(carrier)))return 'agent_contract_excluded';
  return null;
}
// Last completed Monday–Sunday week in the deployment timezone. Calendar arithmetic avoids DST drift.
export function previousConverselyWeek(now=Date.now(),timezone=deploymentProfile().timezone) {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const date=new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7)-7);
  return date.toISOString().slice(0,10);
}
export function currentConverselyWeek(now=Date.now(),timezone=deploymentProfile().timezone) {
  const monday=new Date(`${previousConverselyWeek(now,timezone)}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate()+7);return monday.toISOString().slice(0,10);
}
export function selectWeeklySamples(candidates,config) {
  const decisions=candidates.filter(row=>row.call_id).map(row=>{
    const reason=carrierEligibility(row,config) || (row.already_submitted?'already_submitted':null) ||
      (row.compliance_status!=='complete' || row.score==null || !Number.isFinite(Number(row.score))?'score_incomplete':null) ||
      (!row.playable?'recording_unplayable':null);
    return {...row,eligible:!reason,selected:false,reason:reason || 'eligible'};
  });
  const agents=new Map(candidates.map(row=>[`${row.tenant_id}:${row.agent_id}`,row]));
  for(const [key,agent] of agents){
    const eligible=decisions.filter(row=>`${row.tenant_id}:${row.agent_id}`===key && row.eligible)
      .sort((a,b)=>Number(b.score)-Number(a.score) || Date.parse(b.call_start)-Date.parse(a.call_start) || a.call_id.localeCompare(b.call_id));
    eligible.slice(0,config.samples).forEach((row,index)=>{row.selected=true;row.sample_rank=index+1;row.reason='selected';});
    if(!eligible.length)decisions.push({tenant_id:agent.tenant_id,agent_id:agent.agent_id,agent_slug:agent.agent_slug,eligible:false,selected:false,reason:'no_eligible_calls'});
  }
  return decisions;
}
