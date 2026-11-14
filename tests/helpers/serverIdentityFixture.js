import {installEvidenceAuditFixture} from './evidenceAuditFixture.js';
import {readFileSync} from 'node:fs';
// Older handler suites reconstruct only the tables they need. Extend those
// explicit synthetic fixtures with the new protected maps, then execute the REAL
// resolver body from 152. No authorization result is mocked or cached.
const prepared=new WeakMap();
export function prepareServerIdentity(pg) {
 if(prepared.has(pg))return prepared.get(pg);
 const work=(async()=>{
  const savedRole=(await pg.query("SELECT current_setting('role') r")).rows[0].r;
  await pg.exec('RESET ROLE');
  try {
  if((await pg.query("SELECT to_regprocedure('public.resolve_deployment_subject(text,text)') r")).rows[0].r)return;
  for(const role of ['anon','authenticated','service_role'])if(!(await pg.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)await pg.exec('CREATE ROLE '+role);
  await pg.exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS clerk_org_id text;
   ALTER TABLE enrolled_agents ADD COLUMN IF NOT EXISTS role text DEFAULT 'agent';
   CREATE TABLE IF NOT EXISTS tenant_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,name text,npn text,clerk_user_id text,agent_slug text,is_active boolean,role text DEFAULT 'agent');
   ALTER TABLE tenant_agents ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),ADD COLUMN IF NOT EXISTS name text,ADD COLUMN IF NOT EXISTS npn text,ADD COLUMN IF NOT EXISTS role text DEFAULT 'agent',ADD COLUMN IF NOT EXISTS agent_slug text;
   CREATE TABLE IF NOT EXISTS recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
   CREATE TABLE IF NOT EXISTS availability_agent_subjects(tenant_id uuid,agent_slug text);
   ALTER TABLE availability_agent_subjects ADD COLUMN IF NOT EXISTS clerk_user_id text,ADD COLUMN IF NOT EXISTS clerk_org_id text,ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
   CREATE TABLE IF NOT EXISTS deployment_settings(singleton boolean PRIMARY KEY DEFAULT true,tenant_id uuid,public_profile jsonb);`);
  const tenants=(await pg.query('SELECT id,clerk_org_id FROM tenants ORDER BY id')).rows;
  if(tenants[0])await pg.query('INSERT INTO deployment_settings(singleton,tenant_id,public_profile) VALUES(true,$1,$2) ON CONFLICT(singleton) DO NOTHING',[tenants[0].id,JSON.stringify({organizationId:tenants[0].clerk_org_id})]);
  const agents=(await pg.query('SELECT * FROM enrolled_agents')).rows;
  for(const e of agents){
   const org=tenants.find(t=>t.id===e.tenant_id)?.clerk_org_id;
   const roster=(await pg.query('SELECT * FROM tenant_agents WHERE clerk_user_id=$1 AND tenant_id=$2',[e.clerk_user_id,e.tenant_id])).rows;
   const recording=(await pg.query('SELECT agent_slug FROM recording_agent_subjects WHERE clerk_user_id=$1 AND tenant_id=$2',[e.clerk_user_id,e.tenant_id])).rows[0];
   const available=(await pg.query('SELECT * FROM availability_agent_subjects WHERE (clerk_user_id=$1 OR agent_slug=$1) AND tenant_id=$2',[e.clerk_user_id,e.tenant_id])).rows[0];
   const slug=roster[0]?.agent_slug||recording?.agent_slug||available?.agent_slug||'fixture_'+e.id.replaceAll('-','');
   if(!roster.length)await pg.query('INSERT INTO tenant_agents(id,tenant_id,name,clerk_user_id,agent_slug,is_active,role) VALUES($1,$2,$3,$4,$5,$6,\'agent\')',[e.id,e.tenant_id,e.name||'Synthetic agent',e.clerk_user_id,slug,e.is_active]);
   else await pg.query('UPDATE tenant_agents SET agent_slug=coalesce(agent_slug,$1) WHERE clerk_user_id=$2 AND tenant_id=$3',[slug,e.clerk_user_id,e.tenant_id]);
   if(!recording)await pg.query('INSERT INTO recording_agent_subjects(tenant_id,clerk_user_id,agent_slug) VALUES($1,$2,$3)',[e.tenant_id,e.clerk_user_id,slug]);
   if(!available)await pg.query('INSERT INTO availability_agent_subjects(tenant_id,agent_slug,clerk_user_id,clerk_org_id,is_active) VALUES($1,$2,$3,$4,$5)',[e.tenant_id,slug,e.clerk_user_id,org,e.is_active]);
   else await pg.query('UPDATE availability_agent_subjects SET clerk_user_id=coalesce(clerk_user_id,$1),clerk_org_id=coalesce(clerk_org_id,$2) WHERE tenant_id=$3 AND agent_slug=$4',[e.clerk_user_id,org,e.tenant_id,slug]);
  }
  const source=readFileSync(new URL('../../supabase/migrations/152_protected_deployment_identity.sql',import.meta.url),'utf8');
  // No other migration grants/policies are needed in legacy service-client
  // fixtures; the new direct-browser suite runs all new migrations in full.
  const start=source.indexOf('CREATE TABLE public.deployment_authorities');
  const end=source.indexOf('CREATE FUNCTION public.current_deployment_identity');
  await pg.exec(source.slice(start,end));
  await pg.exec('GRANT SELECT ON tenants TO service_role');
  await pg.exec(readFileSync(new URL('../../supabase/migrations/156_scoped_service_call_views.sql',import.meta.url),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
  await installEvidenceAuditFixture(pg);
  } finally { if(savedRole!=='none')await pg.exec('SET ROLE '+savedRole); }
 })();prepared.set(pg,work);return work;
}
