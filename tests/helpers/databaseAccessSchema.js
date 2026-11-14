import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import roster from '../fixtures/deployment-roster.json' with {type:'json'};
import profile from '../fixtures/deployment-profile.json' with {type:'json'};
export const sql = name => readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
export const newMigrations=['152_protected_deployment_identity.sql','153_scoped_table_and_storage_access.sql','154_scoped_browser_routines.sql','155_owned_workspace_writes.sql','156_scoped_service_call_views.sql'];
export const auditTables=[...readFileSync(new URL('../../PILOT_READINESS.md',import.meta.url),'utf8').split('## Appendix D.')[1].split('### Views, RPCs')[0].matchAll(/^\| `([^`]+)`/gm)].map(m=>m[1]);
export const publicReferences=['birthday_rule_states','bulletin_feed_status','bulletins','carrier_profiles','cms_county_penetration','cms_plan_embeddings_py2027','cms_plans_py2027','csnp_carrier_verification','dsnp_eae_lookup','fema_disasters','plan_terminations','qhp_landscape_2026','snp_plans_by_county','snp_routing_rules','star_ratings_by_county','state_excess_charge_rules','zip_county_crosswalk'];
export const uuid=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const fixtureRoster=roster.slice(0,4);
export const T=profile.tenantId;
export const U=uuid(999);
const tableStatements=source=>[...source.matchAll(/create table (?:if not exists )?(?:public\.)?[a-z_]+\s*\([\s\S]*?^\);/gmi)].map(m=>m[0]);
export async function buildAccessDatabase() {
 const pg=new PGlite({extensions:{pgcrypto}});
 const realTables=new Set();
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA vault; CREATE SCHEMA pii_vault; CREATE SCHEMA storage;
 CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
 GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
 CREATE PUBLICATION supabase_realtime;
 CREATE FUNCTION is_current_tenant(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;`);
 for(const file of ['007_multi_tenant_foundation.sql','000_session_tracking.sql','001_compliance_engine.sql','006_training_completions.sql','020_sales_log.sql','013_script_templates.sql']) {
  for(const ddl of tableStatements(sql(file))) {await pg.exec(ddl);realTables.add(ddl.match(/(?:public\.)?([a-z_]+)\s*\(/i)[1]);}
 }
 await pg.exec(`ALTER TABLE training_completions ADD tenant_id uuid; ALTER TABLE enrolled_agents ADD tenant_id uuid; ALTER TABLE sessions ADD tenant_id uuid,ADD call_record_id uuid;
 ALTER TABLE call_records ADD tenant_id uuid,ADD session_id uuid,ADD sunfire_code text,ADD twilio_call_sid text,ADD call_outcome text,ADD compliance_status text,ADD compliance_scorecard_id uuid,ADD agent_notes text;
 ALTER TABLE compliance_scorecards ADD tenant_id uuid;
 CREATE TABLE agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,agency text,is_active boolean);
 CREATE TABLE call_transcripts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,session_id uuid,owner_agent_id uuid,agent_id uuid,transcript text);
 CREATE TABLE transcript_chunks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,transcript_id uuid,text text);
 CREATE TABLE agent_availability(agent_id text PRIMARY KEY,agent_name text,available boolean,status text,toggled_at timestamptz);
 CREATE TABLE availability_agent_subjects(agent_slug text PRIMARY KEY,tenant_id uuid,clerk_org_id text,clerk_user_id text,is_active boolean);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,agent_slug text,clerk_user_id text,PRIMARY KEY(tenant_id,agent_slug));
 CREATE TABLE vault.decrypted_secrets(id uuid PRIMARY KEY,decrypted_secret text);
 CREATE TABLE pii_vault.encryption_keys(key_id uuid PRIMARY KEY,vault_secret_id uuid,key_version integer,is_active boolean,created_at timestamptz DEFAULT now());
 INSERT INTO vault.decrypted_secrets VALUES('${uuid(800)}','offline-test-key');
 INSERT INTO pii_vault.encryption_keys VALUES('${uuid(801)}','${uuid(800)}',1,true,now());`);
 await pg.exec(sql('017_crm_contacts.sql').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 for(const name of ['contacts','contact_notes','contact_activities','contact_lead_intel','policies','follow_ups'])realTables.add(name);
 await pg.exec(sql('021_contact_address.sql'));
 const pii=sql('022_pii_protection_phase1.sql');await pg.exec(pii.slice(pii.indexOf('CREATE OR REPLACE FUNCTION pii_vault.get_active_key()')));
 realTables.add('pii_access_log');
 for(const file of ['023_pii_protection_phase2_rls.sql','042_auth_subject_binding.sql','044_agent_contact_details.sql','029_create_carrier_rts.sql','030_rts_ai_ingestion.sql','033_rts_agency_shared_edit.sql'])await pg.exec(sql(file));
 realTables.add('carrier_rts');realTables.add('rts_ingestion_log');
 for(const file of ['009_knowledge_base.sql','012_analytics_engine.sql','016_user_preferences.sql','018_inbound_calls.sql','060_call_logs.sql','100_cross_sell_attempts_restore.sql']) {
  for(const ddl of tableStatements(sql(file))){await pg.exec(ddl);realTables.add(ddl.match(/(?:public\.)?([a-z_]+)\s*\(/i)[1]);}
 }
 // Real vendor table definitions and pause routine; other 049/050 routines need
 // unavailable telephony bootstrap functions. No behavior of those is simulated.
 const vendor=sql('049_paragon_pay_per_call.sql');for(const ddl of tableStatements(vendor)){await pg.exec(ddl);realTables.add(ddl.match(/public\.([a-z_]+)/)[1]);}
 await pg.exec(vendor.match(/CREATE OR REPLACE FUNCTION public\.set_vendor_pause[\s\S]*?END; \$\$;/)[0]);
 // Faithful minimum shape for messaging: repository contains no CREATE baseline.
 await pg.exec(`CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,contact_id uuid,agent_id text,body text,read_at timestamptz);
 CREATE TABLE message_media(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,message_id uuid,storage_path text);
 CREATE TABLE lead_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,name text,type text,active boolean);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean DEFAULT false);
 CREATE TABLE enrollment_intakes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,call_id uuid,contact_id uuid,data jsonb,pii_encrypted jsonb,carrier_key text,follow_up_id uuid,submitted_at timestamptz,completed_at timestamptz DEFAULT now(),updated_at timestamptz,is_test_enrollment boolean);
 CREATE TABLE ghl_enrollment_deliveries(tenant_id uuid,call_id uuid,twilio_recording_sid text,enrollment_key text,intake_id uuid,payload_encrypted jsonb);
 CREATE FUNCTION enqueue_compliance_uploads(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
 CREATE FUNCTION search_transcript_chunks() RETURNS SETOF call_transcripts LANGUAGE sql SECURITY DEFINER AS $$SELECT * FROM call_transcripts$$;
 CREATE VIEW v_daily_activity AS SELECT * FROM call_records;
 CREATE VIEW v_call_log AS SELECT 'cr-'||id::text log_id,id call_record_id,tenant_id,NULL::uuid attempt_id,NULL::uuid inbound_call_id,agent_name agent,call_start occurred_at,contact_id,call_direction direction,NULL::text contact_name,NULL::text contact_phone FROM call_records;
 GRANT SELECT ON v_daily_activity TO authenticated;`);
 // Real CRM/pipeline routines and tables, not mocked policy outcomes.
 for(const file of ['058_opportunities_board.sql','059_opportunity_contact_tags.sql','061_opportunity_source_reader.sql','062_opportunity_soft_delete.sql','086_follow_ups_workspace.sql'])await pg.exec(sql(file));
 for(const name of ['pipelines','pipeline_stages','opportunities','opportunity_events','opportunity_stage_history','contact_tags'])realTables.add(name);
 const source=sql('146_script_enrollment_intake.sql');await pg.exec(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.save_enrollment_intake'),source.indexOf('NOTIFY pgrst')));
 // Every remaining Appendix D table is present, even tables without a baseline.
 // Service-ledger shapes test catalog/ACL denial only; references use no agency data.
 for(const name of auditTables.filter(n=>!n.includes('.')&&!['cms_plans_py2026','ghl_sync_log'].includes(n))) {
  if((await pg.query('SELECT to_regclass($1) r',['public.'+name])).rows[0].r)continue;
  const extra={telephony_call_attempts:',inbound_call_id uuid,call_record_id uuid,agent_id text,parent_call_sid text,status text,talk_seconds integer',inbound_calls:',call_record_id uuid',telephony_events:',twilio_call_sid text,inbound_call_id uuid',knowledge_base:',title text,content text',knowledge_updates:',knowledge_base_id uuid',followup_queue:',call_id uuid,followup_status text,notes text',training_completions:',clerk_user_id text',user_preferences:',clerk_user_id text UNIQUE,theme_preference text',call_disposition_opportunity_log:',call_id uuid'}[name]||'';
  await pg.exec(`CREATE TABLE public.${name}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,plan_year integer DEFAULT 2027${extra});`);
 }
 // Deliberately hostile installed grants and OR policies, including column ACLs.
 await pg.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated;
 GRANT UPDATE(role),INSERT(clerk_user_id) ON tenant_agents TO authenticated;
 GRANT UPDATE(tenant_id) ON contacts TO authenticated;`);
 for(const {tablename} of (await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows) {
  await pg.exec(`ALTER TABLE ${tablename} ENABLE ROW LEVEL SECURITY;CREATE POLICY legacy_open ON ${tablename} TO authenticated USING(true) WITH CHECK(true);`);
 }
 await pg.exec(sql('150_deployment_feature_switches.sql'));
 await pg.exec(sql('151_deployment_profile_roster.sql'));
 await pg.query('SELECT provision_deployment_roster($1,$2)',[JSON.stringify(profile),JSON.stringify(fixtureRoster)]);
 for(const file of newMigrations)await pg.exec(sql(file));
 return {pg,realTables};
}
