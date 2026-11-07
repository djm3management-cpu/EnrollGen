import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('vendor reports, totals, reconciliation and daily email exclude test-only enrollments',async()=>{
 const pg=new PGlite();
 const sql=async(q,args=[]) => (await pg.query(q,args)).rows;
 try{
  await pg.exec(readFileSync(new URL('./fixtures/paragon-billing-schema.sql',import.meta.url),'utf8'));
  await pg.exec('CREATE TABLE call_transcripts(id uuid PRIMARY KEY,disposition text); ALTER TABLE inbound_calls ADD duplicate_flag boolean DEFAULT false');
  for(const name of ['051_paragon_vendor_matrix.sql','052_paragon_ping_and_claim.sql','053_paragon_zip_and_reports.sql','055_paragon_vendor_report.sql','056_resolve_recent_paragon_ping.sql','057_paragon_vendor_report_proof.sql','067_paragon_billing_hours.sql','076_duplicate_callers.sql','098_ancillary_sale_disposition.sql','126_paragon_out_of_state_tasks.sql'])await pg.exec(migration(name));
  await pg.exec(`ALTER TABLE call_records ADD is_test_enrollment boolean NOT NULL DEFAULT false;
   ALTER TABLE lead_sources ADD report_emails text[],ADD report_cursor date;
   ALTER TABLE inbound_calls ADD aggregator_source_id uuid;
   CREATE TABLE integration_deliveries(kind text,source_id uuid,dedupe_key text UNIQUE,payload jsonb,expires_at timestamptz);
   CREATE TABLE integration_report_log(source_id uuid,report_date date,call_count integer,result text,UNIQUE(source_id,report_date));`);
  const daily=migration('048_vendor_integrations.sql');
  await pg.exec(daily.slice(daily.indexOf('CREATE FUNCTION enqueue_daily_vendor_reports'),daily.indexOf('CREATE FUNCTION claim_integration_delivery')));
  const safeguard=migration('132_ix_test_enrollment_safeguards.sql');
  await pg.exec(safeguard.slice(safeguard.indexOf('DO $reports$'),safeguard.indexOf("NOTIFY pgrst,'reload schema';")));
  await sql('INSERT INTO tenants VALUES($1)',[id(1)]);
  await sql(`INSERT INTO lead_sources(id,tenant_id,name,type,active,report_emails) VALUES($1,$2,'Paragon Media','publisher',true,ARRAY['example@test.invalid'])`,[id(2),id(1)]);
  for(const [n,isTest] of [[3,true],[4,false]]){
   await sql(`INSERT INTO call_records(id,tenant_id,call_outcome,app_written,is_test_enrollment) VALUES($1,$2,'enrolled',true,$3)`,[id(n),id(1),isTest]);
   const sid='CA'+String(n).repeat(32);
   const [ping]=await sql(`INSERT INTO paragon_ping_decisions(source_id,available,reason,matched_call_sid,vendor_call_id) VALUES($1,true,'accepted_full',$2,$3) RETURNING id`,[id(2),sid,'vendor-'+n]);
   await sql(`INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,lead_source_id,call_record_id,status,created_at) VALUES($1,$2,$3,$4,$5,'completed','2026-10-29T14:00:00Z')`,[id(n+10),id(1),sid,id(2),id(n)]);
   await sql(`INSERT INTO paragon_call_billing(parent_call_sid,tenant_id,source_id,ping_id,inbound_call_id,arrived_at,ended_at,billable_seconds,rate_per_call,finalized_at) VALUES($1,$2,$3,$4,$5,'2026-10-29T14:00:00Z','2026-10-29T14:02:00Z',120,28,now())`,[sid,id(1),id(2),ping.id,id(n+10)]);
  }
  const args=[id(2),'2026-10-29','2026-10-30'];
  const rows=await sql('SELECT * FROM paragon_vendor_report($1,$2,$3)',args);
  assert.deepEqual(rows.map(row=>row.call_id),['vendor-4']);
  const [{totals}]=await sql('SELECT paragon_report_totals($1,$2,$3) AS totals',args);
  assert.equal(totals[0].calls,1);assert.equal(totals[0].amount_due,28);
  const [{result}]=await sql('SELECT paragon_weekly_reconciliation($1,$2,$3) AS result',[id(1),...args.slice(1)]);
  assert.equal(result.total_calls,1);assert.equal(result.apps_written,1);assert.equal(result.expected_invoice,28);
  await sql(`SELECT enqueue_daily_vendor_reports('2026-10-30T12:00:00Z')`);
  const [{payload}]=await sql(`SELECT payload FROM integration_deliveries WHERE kind='report'`);
  assert.equal(payload.calls.length,1);
  assert.equal((await sql('SELECT call_count FROM integration_report_log'))[0].call_count,1);
 }finally{await pg.close();}
});
