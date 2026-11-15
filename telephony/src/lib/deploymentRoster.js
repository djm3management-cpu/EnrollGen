import {securityEvent} from './logger.js';
import { deploymentProfile,publicDeploymentProfile } from './deploymentProfile.js';
export function validateRoster(rows, {ghl = false} = {}) {
  if (!Array.isArray(rows) || !rows.length) throw Error('Active deployment roster required');
  const active=rows.filter(row=>row.is_active===true);
  if (!active.length) throw Error('Active deployment roster required');
  for (const key of ['id','clerk_user_id','agent_slug','name','npn']) {
    const values=active.map(row=>String(row[key]||'').trim());
    if(values.some(v=>!v) || new Set(values).size!==values.length) throw Error(`Invalid or ambiguous roster ${key}`);
  }
  for (const row of active) {
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.id)|| !/^\d{1,12}$/.test(row.npn)||!row.clerk_user_id.startsWith('user_'))throw Error('Invalid roster stable identity');
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(row.agent_slug) || !Array.isArray(row.identity_aliases) || !Array.isArray(row.licensed_states)) throw Error('Invalid roster binding');
    if(row.licensed_states.some(s=>!/^([A-Z]{2})$/.test(s))||row.identity_aliases.some(a=>typeof a!=='string'||!a.trim()))throw Error('Invalid roster aliases or states');
    if (ghl && !row.ghl_user_id) throw Error('Writing agent GHL mapping required');
  }
  const aliases=active.flatMap(row=>row.identity_aliases.map(alias=>String(alias).toLowerCase()));
  if(new Set(aliases).size!==aliases.length) throw Error('Ambiguous roster aliases');
  return active;
}
export async function loadDeploymentRoster(db, profile=deploymentProfile(), options={}) {
  const {data,error}=await db.from('tenant_agents').select('id,tenant_id,name,npn,clerk_user_id,agent_slug,ghl_user_id,is_active,identity_aliases,licensed_states,team,sunfire_agent_id,ams_producer_id').eq('tenant_id',profile.tenantId).eq('is_active',true).order('name');
  if(error)throw Error('Deployment roster unavailable');
  return validateRoster(data,options);
}
export function writingAgent(roster, value) {
  const matches=roster.filter(a=>a.is_active===true && (a.id===value || a.name===value));
  if(matches.length!==1)throw Error('Unknown writing agent');
  return matches[0];
}
export function rosterIdentity(user, roster=[]) {
  if (!user?.id) return null;
  const matches=roster.filter(a=>a.is_active===true && a.clerk_user_id===user.id);
  return matches.length===1 ? matches[0] : null;
}
export async function verifyDeploymentConfiguration(db,profile=deploymentProfile()) {
 const {data,error}=await db.from('deployment_settings').select('tenant_id,public_profile').eq('singleton',true).single();
 const canonical=value=>JSON.stringify(value,(_key,item)=>item && !Array.isArray(item) && typeof item==='object'?Object.fromEntries(Object.entries(item).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b))):item);
 if(error || data?.tenant_id!==profile.tenantId || canonical(data?.public_profile)!==canonical(publicDeploymentProfile(profile))){securityEvent('configuration_failed');throw Error('Provisioned deployment profile differs from service configuration');}
 return loadDeploymentRoster(db,profile);
}
