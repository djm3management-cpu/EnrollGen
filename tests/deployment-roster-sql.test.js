import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {publicDeploymentProfile,deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
test('unapplied roster migration provisions 12 identities atomically, enforces server-only writes and uses stable IDs/timezone in intake',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE tenants(id uuid PRIMARY KEY,name text,clerk_org_id text,agency_display_name text);
 CREATE TABLE tenant_agents(id uuid PRIMARY KEY,tenant_id uuid,name text,npn text,clerk_user_id text,agent_slug text,ghl_user_id text,is_active boolean);
 GRANT ALL ON tenant_agents TO authenticated;GRANT UPDATE(name) ON tenant_agents TO authenticated;
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,clerk_user_id text UNIQUE,name text,npn text,role text,is_active boolean);
 CREATE TABLE agent_availability(agent_id text PRIMARY KEY,agent_name text,available boolean,status text,toggled_at timestamptz);
 CREATE TABLE availability_agent_subjects(agent_slug text PRIMARY KEY,tenant_id uuid,clerk_org_id text,clerk_user_id text,is_active boolean);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,agent_slug text,clerk_user_id text,PRIMARY KEY(tenant_id,agent_slug));
 CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid);
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,sunfire_code text);
 CREATE TABLE follow_ups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,contact_id uuid,agent_id text,due_at timestamptz,reason text,updated_at timestamptz);
 CREATE TABLE enrollment_intakes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,call_id uuid,contact_id uuid,data jsonb,pii_encrypted jsonb,carrier_key text,follow_up_id uuid,submitted_at timestamptz,completed_at timestamptz DEFAULT now(),updated_at timestamptz,is_test_enrollment boolean);
 CREATE TABLE ghl_enrollment_deliveries(tenant_id uuid,call_id uuid,twilio_recording_sid text,enrollment_key text,intake_id uuid,payload_encrypted jsonb);
 CREATE FUNCTION encrypt_pii_value(v text) RETURNS jsonb LANGUAGE sql AS $$SELECT to_jsonb(v)$$;
 CREATE FUNCTION enqueue_compliance_uploads(v uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
 CREATE VIEW profile_day AS SELECT (now() AT TIME ZONE 'America/New_York')::date AS day;`);
 const source=migration('146_script_enrollment_intake.sql');await pg.exec(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.save_enrollment_intake'),source.indexOf("NOTIFY pgrst")));
 await pg.exec(migration('151_deployment_profile_roster.sql'));
 await pg.exec(`CREATE TABLE lead_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,name text,type text,ping_key_hash text,postback_url text,postback_secret text,report_emails text[],active boolean,UNIQUE(tenant_id,name));
 CREATE TABLE availability_consumers(name text PRIMARY KEY,key_hash text,active boolean,push_url text,push_secret text,push_enabled boolean);
 CREATE TABLE vendor_routing_config(source_id uuid PRIMARY KEY,allowed_states text[],required_carriers text[],critical_carriers text[],plan_year integer,reservation_ttl_seconds integer);
 CREATE TABLE vendor_controls(tenant_id uuid PRIMARY KEY,vendor_pause boolean,staffed_hours jsonb,paragon_daily_cap integer,paragon_cap_mode text,paragon_rate numeric,updated_by text);
 CREATE TABLE paragon_report_tokens(source_id uuid PRIMARY KEY,token_hash text,updated_by text);
 CREATE TABLE vendor_agent_state_eligibility(source_id uuid,plan_year integer,agent_id uuid,state text,aetna boolean,humana boolean,uhc boolean,wellcare boolean,devoted boolean,healthspring boolean,updated_by text);`);
 const p={...publicDeploymentProfile(deploymentProfile()),timezone:'America/Los_Angeles'};
 assert.equal((await pg.query('SELECT provision_deployment_roster($1,$2) AS count',[JSON.stringify(p),JSON.stringify(roster)])).rows[0].count,12);
 assert.equal((await pg.query('SELECT count(*)::int n FROM enrolled_agents WHERE is_active')).rows[0].n,12);
 assert.equal((await pg.query('SELECT count(*)::int n FROM availability_agent_subjects WHERE is_active')).rows[0].n,12);
 assert.equal((await pg.query('SELECT count(*)::int n FROM recording_agent_subjects')).rows[0].n,12);
 assert.equal((await pg.query('SELECT deployment_timezone() zone')).rows[0].zone,'America/Los_Angeles');
 const vendor={...JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON).paragon,eligibility:[{agentId:roster[0].id,state:'NY',carriers:['aetna','uhc']}]};
 await pg.query('SELECT configure_deployment_vendor($1)',[JSON.stringify(vendor)]);
 assert.equal((await pg.query('SELECT vendor_pause FROM vendor_controls')).rows[0].vendor_pause,true);
 assert.equal((await pg.query('SELECT count(*)::int n FROM vendor_agent_state_eligibility')).rows[0].n,1);
 assert.equal((await pg.query('SELECT staffed_hours FROM vendor_controls')).rows[0].staffed_hours.timezone,p.timezone);
 assert.equal((await pg.query('SELECT postback_url FROM lead_sources')).rows[0].postback_url,vendor.postbackUrl);
 await assert.rejects(pg.query('SELECT configure_deployment_vendor($1)',[JSON.stringify({...vendor,eligibility:[{agentId:roster[0].id,state:'CA',carriers:['uhc']}]})]),/active licensed roster/);

 assert.match((await pg.query("SELECT pg_get_viewdef('profile_day'::regclass) definition")).rows[0].definition,/deployment_timezone/);
 for(const role of ['anon','authenticated']){
 await pg.exec('SET ROLE '+role);
 await assert.rejects(pg.exec("UPDATE tenant_agents SET name='changed'"),/permission denied/);
 await assert.rejects(pg.query('SELECT provision_deployment_roster($1,$2)',[JSON.stringify(p),JSON.stringify(roster)]),/permission denied/);
 await pg.exec('RESET ROLE');
 }
 const call='30000000-0000-4000-8000-000000000001',contact='30000000-0000-4000-8000-000000000002';
 await pg.query('INSERT INTO contacts VALUES($1,$2)',[contact,p.tenantId]);await pg.query('INSERT INTO call_records VALUES($1,$2,NULL)',[call,p.tenantId]);
 for(const agent of roster){
 await pg.query('SELECT save_enrollment_intake(NULL,$1,$2,$3,$4,$5,$6)',[p.tenantId,call,contact,JSON.stringify({aor:agent.name,writingAgentId:agent.id,sixtyDayDate:'2026-03-09',testEnrollment:false}),'Aetna',JSON.stringify({submittedAt:'2026-11-14T12:00:00Z'})]);
 }
 const tasks=(await pg.query('SELECT agent_id,due_at FROM follow_ups ORDER BY agent_id')).rows;assert.equal(tasks.length,12);assert.deepEqual(tasks.map(t=>t.agent_id),roster.map(a=>a.agent_slug));assert.ok(tasks.every(t=>new Date(t.due_at).toISOString()==='2026-03-09T16:00:00.000Z'));
 await assert.rejects(pg.query('SELECT save_enrollment_intake(NULL,$1,$2,$3,$4,$5,$6)',[p.tenantId,call,contact,JSON.stringify({aor:'Unknown Agent 13',writingAgentId:'40000000-0000-4000-8000-000000000013',sixtyDayDate:'2026-03-09'}),'Aetna',JSON.stringify({submittedAt:'2026-11-14T12:00:00Z'})]),/no rows/);
 await pg.query("UPDATE agent_availability SET available=true,status='available' WHERE agent_id=$1",[roster[0].agent_slug]);
 const renamed=roster.slice(0,11).map((a,i)=>i===0?{...a,agent_slug:'renamed_agent_01'}:a);
 await pg.query('SELECT provision_deployment_roster($1,$2)',[JSON.stringify(p),JSON.stringify(renamed)]);
 assert.equal((await pg.query('SELECT available FROM agent_availability WHERE agent_id=$1',[roster[0].agent_slug])).rows[0].available,false);assert.equal((await pg.query('SELECT count(*)::int n FROM enrolled_agents WHERE is_active')).rows[0].n,11);assert.equal((await pg.query('SELECT count(*)::int n FROM recording_agent_subjects')).rows[0].n,11);
 }finally{await pg.close();}
});
