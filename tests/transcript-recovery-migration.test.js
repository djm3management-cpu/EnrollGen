import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL(`../supabase/migrations/${n}`,import.meta.url),'utf8');
test('recovery SQL enforces lifetime/daily caps, persists canonical repairs and isolates tenants',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE tenants(id uuid PRIMARY KEY);
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,call_end timestamptz,call_outcome text,compliance_scorecard_id uuid,twilio_call_sid text,call_duration_seconds int,transcript_diarized jsonb,transcript_raw text,metadata jsonb,compliance_status text);
 CREATE TABLE recording_ingestion(id uuid PRIMARY KEY,call_record_id uuid,tenant_id uuid,provider_status text,recording_source text,recording_channels int,parent_call_sid text,recording_duration_seconds int,attempt_id uuid,provider_created_at timestamptz,direction text);
 CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,call_record_id uuid,tenant_id uuid,answered_at timestamptz,ended_at timestamptz);
 CREATE TABLE call_conferences(call_id uuid,tenant_id uuid);
 CREATE TABLE call_participants(id uuid,call_id uuid);
 CREATE TABLE compliance_scorecards(call_id uuid);
 CREATE TABLE compliance_llm_passes(id uuid DEFAULT gen_random_uuid(),call_id uuid,tenant_id uuid,request_id uuid,mode text,requested_by text,status text DEFAULT 'reserved',created_at timestamptz DEFAULT now());
 CREATE TABLE compliance_runtime_control(id boolean,enabled boolean);INSERT INTO compliance_runtime_control VALUES(true,true);
 CREATE TABLE compliance_daily_budget(day date,halted boolean);
 CREATE FUNCTION compliance_call_excluded(call_records) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE usage_records(metadata jsonb,record_type text);
 CREATE TABLE transcript_score_dispatch(call_id uuid,revision int,delivered_revision int,dispatch_attempts int,available_at timestamptz,transcript_ready_at timestamptz,last_error text);
 CREATE FUNCTION get_sale_compliance_dispatch() RETURNS SETOF transcript_score_dispatch LANGUAGE sql AS $$ SELECT * FROM transcript_score_dispatch WHERE false $$;
 CREATE TABLE telephony_transcript_segments(id uuid PRIMARY KEY,attempt_id uuid,speaker text,text text,captured_at timestamptz,start_ms int,end_ms int);
 CREATE FUNCTION is_compliance_sale(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('enrolled','enrolled_pending_verification') $$;
 CREATE FUNCTION refresh_sale_compliance_request(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
 await pg.exec(read('137_manual_transcript_gaps.sql'));await pg.exec(read('147_bounded_transcript_recovery.sql'));
 const tenant='00000000-0000-4000-8000-000000000001',call='00000000-0000-4000-8000-000000000002',recording='00000000-0000-4000-8000-000000000003',attempt='00000000-0000-4000-8000-000000000004';
 await pg.query('INSERT INTO tenants VALUES($1)',[tenant]);
 await pg.query("INSERT INTO call_records VALUES($1,$2,now(),'enrolled',NULL,'sid',3000,'[]',NULL,'{}','queued')",[call,tenant]);
 await pg.query("INSERT INTO recording_ingestion VALUES($1,$2,$3,'completed','DialVerb',2,'sid',3000,$4,'2026-11-09T12:00:00Z','inbound')",[recording,call,tenant,attempt]);
 await pg.query("INSERT INTO telephony_call_attempts VALUES($1,$2,$3,'2026-11-09T12:00:00Z',now())",[attempt,call,tenant]);
 await pg.query('INSERT INTO transcript_score_dispatch VALUES($1,1,0,1,now(),now(),NULL)',[call]);
 const claim=async(t=tenant,cost=.0086)=>(await pg.query("SELECT claim_automatic_transcript_recovery($1,$2,$3,'[{\"start_ms\":2940000,\"end_ms\":3000000}]','[\"customer\",\"agent\"]',$4) r",[call,t,recording,cost])).rows[0].r;
 await assert.rejects(claim('00000000-0000-4000-8000-000000000099'));
 assert.equal((await claim(tenant,.51)).reason,'recovery_cost_cap');
 const j=await claim();assert.equal(j.status,'claimed');assert.equal((await claim()).status,'busy');
 await pg.query("UPDATE manual_transcript_gap_fills SET status='processing' WHERE id=$1",[j.job_id]);
 await pg.query('INSERT INTO manual_transcript_gap_requests(job_id,range_index,request_id,submitted_minutes) VALUES($1,0,gen_random_uuid(),2)',[j.job_id]);
 const line={id:'00000000-0000-4000-8000-000000000005',speaker:'agent',text:'fixture recovered',start_ms:2940000,end_ms:3000000};
 await pg.query("SELECT persist_manual_gap_result($1,'[]',$2,0,'provider-fixture')",[j.job_id,JSON.stringify([line])]);
 assert.equal((await pg.query('SELECT count(*)::int n FROM telephony_transcript_segments')).rows[0].n,1);
 assert.equal((await pg.query('SELECT metadata FROM call_records')).rows[0].metadata.manual_gap_fill,false);
 await assert.rejects(pg.query("SELECT persist_manual_gap_result($1,'[]',$2,0,'provider-fixture')",[j.job_id,JSON.stringify([line])]));
 await pg.query("UPDATE manual_transcript_gap_fills SET status='complete' WHERE id=$1",[j.job_id]);
 await pg.query('SELECT finish_automatic_transcript_recovery($1,$2,$3)',[call,tenant,j.job_id]);
 assert.equal((await claim()).status,'blocked');
 assert.equal((await pg.query('SELECT dispatch_attempts FROM transcript_score_dispatch')).rows[0].dispatch_attempts,0);
 assert.equal((await pg.query('SELECT mark_transcript_recovery_blocked($1,$2,$3) n',[call,tenant,'fixture'])).rows[0].n,true);
 assert.equal((await pg.query('SELECT mark_transcript_recovery_blocked($1,$2,$3) n',[call,tenant,'fixture'])).rows[0].n,false);
 // Daily reservations include failures. No provider requests are made in this test.
 await pg.exec("UPDATE manual_transcript_gap_fills SET estimated_cost_usd=10,status='failed',mode='manual'");
 // Restore automatic reservation under a different completed call ID for the daily cap.
 await pg.query("INSERT INTO call_records SELECT gen_random_uuid(),tenant_id,call_end,call_outcome,compliance_scorecard_id,'other',call_duration_seconds,transcript_diarized,transcript_raw,metadata,compliance_status FROM call_records WHERE id=$1",[call]);
 await pg.query("UPDATE manual_transcript_gap_fills SET call_id=(SELECT id FROM call_records WHERE id<>$1),mode='automatic'",[call]);
 assert.equal((await claim()).reason,'daily_recovery_cost_cap');
 await pg.query("SELECT record_transcription_incident($1,NULL,'media_transport_closed',1998119)",[attempt]);
 assert.equal((await pg.query('SELECT count(*)::int n FROM transcription_incidents')).rows[0].n,1);
 await pg.exec("UPDATE manual_transcript_gap_fills SET status='processing',created_at=now()-interval '16 minutes';SELECT * FROM get_sale_compliance_dispatch()");
 assert.equal((await pg.query("SELECT status FROM manual_transcript_gap_fills")).rows[0].status,'failed');
 assert.equal((await pg.query("SELECT count(*)::int n FROM transcript_recovery_alerts WHERE reason='recovery_worker_expired'")).rows[0].n,1);
 await pg.query("INSERT INTO usage_records VALUES(jsonb_build_object('call_record_id',$1::text),'stt_seconds')",[call]);
 const pass=(await pg.query("SELECT claim_compliance_pass($1,$2,gen_random_uuid(),'automatic',NULL) r",[call,tenant])).rows[0].r;
 assert.equal(pass.status,'claimed');
 assert.equal((await pg.query("SELECT claim_compliance_pass($1,$2,gen_random_uuid(),'automatic',NULL) r",[call,tenant])).rows[0].r.status,'paid_pass_already_exists');
 await pg.exec('SET ROLE authenticated');
 await assert.rejects(pg.query('SELECT * FROM transcript_recovery_alerts'),/permission denied/);
 await assert.rejects(pg.query('SELECT * FROM transcription_incidents'),/permission denied/);

 }finally{await pg.close();}
});
