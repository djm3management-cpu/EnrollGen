import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classifyCaller } from '../telephony/src/paragonRouting.js';
const pg=new PGlite();
const sql=(q,p=[])=>pg.query(q,p).then(r=>r.rows);
const T='00000000-0000-4000-8000-000000000001', U='00000000-0000-4000-8000-000000000002';
const S='11111111-1111-4111-8111-111111111111', R='11111111-1111-4111-8111-111111111112';
const at='2026-10-03T16:00:00Z', sid=n=>'CA'+String(n).padStart(32,'0');
async function call(n,{phone='+16095550000',time=at,tenant=T,source=S,classification='known'}={}) {
 return (await sql(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,lead_source_id,source_kind,created_at,status,caller_classification)
 VALUES($1,$2,$3,$4,'publisher',$5,'completed',$6) RETURNING *`,[tenant,sid(n),phone,source,time,classification]))[0];
}
before(async()=>{
 await pg.exec(readFileSync(new URL('./fixtures/paragon-billing-schema.sql',import.meta.url),'utf8'));
 await sql('INSERT INTO tenants VALUES($1),($2)',[T,U]);
 await sql("INSERT INTO lead_sources VALUES($1,$2,'Paragon Media','publisher',true,$3),($4,$2,'Paragon Media','publisher',true,$3)",[S,T,'a'.repeat(64),R]);
 await sql("INSERT INTO vendor_controls VALUES($1,false,'{}',now(),'fixture')",[T]);
 for(const name of ['051_paragon_vendor_matrix.sql','052_paragon_ping_and_claim.sql','053_paragon_zip_and_reports.sql','055_paragon_vendor_report.sql','056_resolve_recent_paragon_ping.sql','057_paragon_vendor_report_proof.sql','067_paragon_billing_hours.sql'])
  await pg.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 // 049's columns, already present in the real schema.
 await pg.exec("ALTER TABLE inbound_calls ADD COLUMN duplicate_flag boolean NOT NULL DEFAULT false, ADD COLUMN caller_classification text");
 await call(900,{phone:'+16095559999'});
 await pg.exec('UPDATE inbound_calls SET duplicate_flag=true WHERE twilio_call_sid=\''+sid(900)+'\'');
 await pg.exec(readFileSync(new URL('../supabase/migrations/076_duplicate_callers.sql',import.meta.url),'utf8'));
});
after(()=>pg.close());
test('repeat within 90 days records latest prior ID, independent of new/known; normalized phone and >20 history rows',async()=>{
 const phone='(609) 555-0001';
 for(let n=1;n<=25;n++)await call(n,{phone,time:'2026-10-01T16:00:00Z'});
 const latest=await call(26,{phone:'+16095550001',time:'2026-10-02T16:00:00Z'});
 const repeat=await call(27,{phone:'6095550001',classification:'new'});
 assert.equal(repeat.duplicate_flag,true);assert.equal(repeat.duplicate_prior_call_id,latest.id);
 const known=await call(28,{phone:'+16095550001'});
 assert.equal(known.duplicate_flag,true);assert.ok(known.duplicate_prior_call_id);
});
test('exact 90-day boundary included; day 91 and future calls excluded',async()=>{
 const day=n=>new Date(Date.parse(at)-n*86400000).toISOString();
 const prior=await call(30,{phone:'+16095550002',time:day(90)});
 assert.equal((await call(31,{phone:'+16095550002'})).duplicate_prior_call_id,prior.id);
 await call(32,{phone:'+16095550003',time:day(91)});
 const fresh=await call(33,{phone:'+16095550003'});
 assert.equal(fresh.duplicate_flag,false);assert.equal(fresh.duplicate_prior_call_id,null);
 await call(34,{phone:'+16095550004',time:day(-1)});
 assert.equal((await call(35,{phone:'+16095550004'})).duplicate_flag,false);
});
test('existing contact with a prior call is flagged, without changing classification',async()=>{
 const classification=classifyCaller({contact:{id:'existing'},priorCalls:[]});
 const prior=await call(40,{phone:'+16095550005',time:'2026-10-02T16:00:00Z'});
 const repeat=await call(41,{phone:'+16095550005',classification});
 assert.equal(repeat.caller_classification,'known');assert.equal(repeat.duplicate_flag,true);
 assert.equal(repeat.duplicate_prior_call_id,prior.id);
});
test('different tenant/source and invalid phones do not match; same CallSid excluded',async()=>{
 await call(50,{phone:'+16095550006',tenant:U});
 assert.equal((await call(51,{phone:'+16095550006'})).duplicate_flag,false);
 await call(52,{phone:'+16095550007',source:R});
 assert.equal((await call(53,{phone:'+16095550007'})).duplicate_flag,false);
 await call(54,{phone:'anonymous'});
 assert.equal((await call(55,{phone:'anonymous'})).duplicate_flag,false);
 const row=await call(56,{phone:'+16095550008'});
 assert.equal((await sql('SELECT find_duplicate_prior_call($1,$2,$3,$4,$5) id',[T,S,row.from_number,at,row.twilio_call_sid]))[0].id,null);
});
test('ledger before/after inbound, daily/weekly and internal disputes retain prior ID; vendor CSV still eight columns',async()=>{
 const prior=await call(60,{phone:'+16095550009',time:'2026-10-02T16:00:00Z'});
 for(const n of [61,62]) {
  await sql("INSERT INTO paragon_ping_decisions(source_id,caller_state,caller_phone,vendor_call_id,available,reason,matched_call_sid,rate_per_call) VALUES($1,'KS','+16095550009',$2,true,'accepted_full',$3,28)",[S,'vendor-'+n,sid(n)]);
  if(n===61)await sql('SELECT seed_paragon_billing()');
  const inbound=await call(n,{phone:'+16095550009'});
  if(n===62)await sql('SELECT seed_paragon_billing()');
  const ledger=(await sql('SELECT * FROM paragon_call_billing WHERE parent_call_sid=$1',[sid(n)]))[0];
  assert.equal(ledger.duplicate_flag,true);assert.equal(ledger.duplicate_prior_call_id,n===61?prior.id:inbound.duplicate_prior_call_id);
  await sql("UPDATE paragon_call_billing SET arrived_at=$1,ended_at=$1::timestamptz+interval '95 seconds',billable_seconds=95,finalized_at=now() WHERE parent_call_sid=$2",[at,sid(n)]);
 }
 const start='2026-10-03T00:00:00Z',end='2026-10-04T00:00:00Z';
 const daily=(await sql('SELECT paragon_report_totals($1,$2,$3) r',[S,start,end]))[0].r;
 assert.equal(daily[0].duplicate_calls,2);assert.equal(daily[0].disputed_calls,2);assert.equal(Number(daily[0].amount_due),56);
 const weekly=(await sql('SELECT paragon_weekly_reconciliation($1,$2,$3) r',[T,start,end]))[0].r;
 assert.equal(weekly.duplicate_calls,2);assert.equal(weekly.duplicate_calls_detail.length,2);
 assert.equal(weekly.duplicate_calls_detail[0].duplicate_flag,true);assert.equal(Number(weekly.expected_invoice),56);
 const disputes=await sql('SELECT * FROM paragon_duplicate_disputes');
 assert.equal(disputes.length,2);assert.equal(disputes[0].billing_dispute,true);assert.ok(disputes[0].duplicate_prior_call_id);
 const vendor=await sql('SELECT * FROM paragon_vendor_report($1,$2,$3)',[S,start,end]);
 assert.equal(Object.keys(vendor[0]).length,8);assert.equal(vendor[0].billable,'yes');
});
test('migration preserves historical flag; index exists; duplicate surfaces deny browser roles',async()=>{
 const old=(await sql('SELECT * FROM inbound_calls WHERE twilio_call_sid=$1',[sid(900)]))[0];
 assert.equal(old.duplicate_flag,true);assert.equal(old.duplicate_prior_call_id,null);
 assert.equal((await sql("SELECT count(*) n FROM pg_indexes WHERE indexname='inbound_duplicate_history'"))[0].n,1);
 for(const role of ['anon','authenticated']) {
  await pg.exec('SET ROLE '+role);
  await assert.rejects(sql('SELECT * FROM paragon_duplicate_disputes'),/permission denied/);
  await assert.rejects(sql('SELECT find_duplicate_prior_call($1,$2,$3,$4,$5)',[T,S,'+16095550000',at,sid(999)]),/permission denied/);
  await pg.exec('RESET ROLE');
 }
});
