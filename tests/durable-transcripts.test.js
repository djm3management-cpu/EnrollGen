import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const migration = readFileSync(new URL('../supabase/migrations/084_durable_transcripts.sql', import.meta.url),'utf8');
const t=randomUUID(), owner=randomUUID(), attempt=randomUUID(), inbound=randomUUID(), session=randomUUID();
const sid='CA'+'1'.repeat(32);
async function fixture() {
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE tenants(id uuid PRIMARY KEY,name text,agency_display_name text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,name text,clerk_user_id text,is_active boolean);
 CREATE TABLE tenant_agents(tenant_id uuid,clerk_user_id text,agent_slug text,is_active boolean);
 CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,call_record_id uuid);
 CREATE TABLE agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,agency text,is_active boolean);
 CREATE TABLE call_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,agent_name text,
 call_direction text,call_type text,product_type text,call_start timestamptz,twilio_call_sid text,contact_id uuid,
 metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz,session_id uuid,transcript_id uuid,
 transcript_raw text,transcript_diarized jsonb,call_duration_seconds integer,call_end timestamptz);
 CREATE TABLE inbound_calls(id uuid PRIMARY KEY,tenant_id uuid,call_record_id uuid,ended_at timestamptz);
 CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,parent_call_sid text,agent_id text,
 direction text,created_at timestamptz DEFAULT now(),contact_id uuid,inbound_call_id uuid,call_record_id uuid,
 answered_at timestamptz,ended_at timestamptz,talk_seconds integer DEFAULT 45);
 CREATE TABLE call_transcripts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,
 owner_agent_id uuid,call_record_id uuid,session_id uuid,call_date timestamptz,direction text,product_line text,
 transcript_text text,source_system text,source_id text,phi_scrubbed boolean,last_checkpoint_at timestamptz,updated_at timestamptz);
 CREATE TABLE scoring_jobs(call_id uuid,tenant_id uuid,status text,transcript_revision text);
 CREATE FUNCTION scoring_transcript_snapshot(p_call call_records) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('raw',p_call.transcript_raw,'diarized',p_call.transcript_diarized,'duration',p_call.call_duration_seconds) $$;`);
 // Use the real landscape column list; omit vector/other destructive 054 statements.
 const original=readFileSync(new URL('../supabase/migrations/054_cms_landscape_2027.sql',import.meta.url),'utf8');
 await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.cms_plans_py2027'),original.indexOf('CREATE INDEX')));
 await db.exec(migration);
 await db.query('INSERT INTO tenants VALUES($1,$2,$2)',[t,'Agency']);
 await db.query('INSERT INTO enrolled_agents VALUES($1,$2,$3,$4,true)',[owner,t,'Agent','user']);
 await db.query('INSERT INTO tenant_agents VALUES($1,$2,$3,true)',[t,'user','agent']);
 await db.query('INSERT INTO inbound_calls VALUES($1,$2,NULL,NULL)',[inbound,t]);
 await db.query("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,direction,inbound_call_id,answered_at) VALUES($1,$2,$3,'agent','inbound',$4,now())",[attempt,t,sid,inbound]);
 await db.query('INSERT INTO sessions VALUES($1,$2,$3,NULL)',[session,t,owner]);
 return db;
}
async function segment(db,text='Hello',id=randomUUID(),speaker='customer') {
 return (await db.query('SELECT persist_telephony_transcript($1,$2,$3,$4,now(),0,1000) AS id',[attempt,id,speaker,text])).rows[0].id;
}
test('browser closed mid-call and short call persist both speakers, terminal status queues scoring without wrap-up',async()=>{
 const db=await fixture();try {
 const id=randomUUID(); const rid=await segment(db,'Hello',id);await segment(db,'Hello',id);
 await segment(db,'Welcome',randomUUID(),'agent');
 assert.equal((await db.query('SELECT count(*)::int n FROM telephony_transcript_segments')).rows[0].n,2);
 const c=(await db.query('SELECT * FROM call_records')).rows[0];assert.equal(c.id,rid);assert.match(c.transcript_raw,/CUSTOMER: Hello/);assert.match(c.transcript_raw,/AGENT: Welcome/);assert.ok(c.transcript_id);assert.equal(c.session_id,null);
 await db.query('UPDATE inbound_calls SET ended_at=now() WHERE id=$1',[inbound]);
 await db.query('SELECT finalize_telephony_transcript($1)',[sid]);
 assert.equal((await db.query('SELECT count(*)::int n FROM transcript_score_dispatch')).rows[0].n,1);
 assert.equal((await db.query('SELECT call_duration_seconds FROM call_records')).rows[0].call_duration_seconds,45);
 await db.query('SELECT ensure_inbound_transcript_record($1,$2)',[attempt,session]);
 assert.equal((await db.query('SELECT count(*)::int n FROM call_records')).rows[0].n,1);
 assert.equal((await db.query('SELECT session_id FROM call_transcripts')).rows[0].session_id,session);
 await segment(db,'Goodbye');
 assert.equal((await db.query('SELECT revision FROM transcript_score_dispatch')).rows[0].revision,2);
 await db.query("INSERT INTO scoring_jobs SELECT id,tenant_id,'complete',md5(scoring_transcript_snapshot(call_records)::text) FROM call_records");
 await db.query('SELECT reconcile_telephony_transcripts()');
 assert.equal((await db.query('SELECT delivered_revision FROM transcript_score_dispatch')).rows[0].delivered_revision,2);
 }finally{await db.close();}
});
test('reconciliation flags answered calls with missing transcript; service-only raw segments',async()=>{
 const db=await fixture();try {
 await db.query("UPDATE telephony_call_attempts SET ended_at=now()-interval '3 minutes'");
 assert.equal((await db.query('SELECT reason FROM telephony_missing_transcripts')).rows[0].reason,'missing_transcript');
 await segment(db);assert.equal((await db.query('SELECT * FROM telephony_missing_transcripts')).rows.length,0);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM telephony_transcript_segments'),/permission denied/);
 }finally{await db.close();}
});
test('PY2027 sanctioned value is Unknown without CMS sanctions source',async()=>{
 const db=await fixture();try {
 await db.exec(`INSERT INTO cms_plans_py2027(plan_year,category,state_code,county_name,county_fips,carrier,contract_id,plan_id,segment_id,contract_plan_segment_id,plan_name,source_file)
 VALUES(2027,'MA','NJ','Ocean','34029','Carrier','H0000','001','000','H0000_001_000','Plan','landscape');`);
 assert.equal((await db.query('SELECT "Sanctioned Plan" AS value FROM "cms_plans_PY2027"')).rows[0].value,'Unknown');
 }finally{await db.close();}
});
