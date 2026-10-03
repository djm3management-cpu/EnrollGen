import { etMidnight } from '../netlify/functions/paragon-vendor-report.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { verifiedBillingSnapshot, processBillingJob, enqueueBillingCallback, resolveParagonArrival, claimParagonArrival, verifiedParagonArrival } from '../telephony/src/paragonBilling.js';
import { validateParagonControls, paragonReportTotals } from '../netlify/functions/_paragonControls.js';
const pg=new PGlite(),db=evidenceDb(pg);const sql=(q,p=[])=>pg.query(q,p).then(r=>r.rows);
const T='00000000-0000-4000-8000-000000000001',SRC='11111111-1111-4111-8111-111111111111';
const AC='AC'+'a'.repeat(32),sid=n=>'CA'+String(n).padStart(32,'0');
const config={twilioAccountSid:AC},hash='a'.repeat(64);
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const standard={timezone:'America/New_York',days:Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map((day,index)=>[day,index<5?{enabled:true,start:'10:15',end:'17:15'}:{enabled:false}]))};
const allOpen={timezone:'America/New_York',days:Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,{enabled:true,start:'00:00',end:'23:59'}]))};
async function makeCall(n,{seconds=null,arrived=new Date(Date.now()-200000).toISOString(),wrong=false,rate=28,proof=true}={}) {
 const parent=sid(n);const ping=(await sql("INSERT INTO paragon_ping_decisions(source_id,caller_state,caller_phone,vendor_call_id,available,reason,agent_id,matched_call_sid,accepted_until,rate_per_call) VALUES($1,'KS','+15550000000',$2,$3,'accepted_full','mark',$4,now()+interval '30 seconds',$5) RETURNING id",[SRC,'vendor-'+n,proof,parent,rate]))[0].id;
 const inbound=(await sql("INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,lead_source_id,status,caller_state,wrong_state,created_at) VALUES($1,$2,'+15550000000',$3,'completed','KS',$4,$5) RETURNING id",[T,parent,SRC,wrong,arrived]))[0].id;
 if(proof)await sql('SELECT seed_paragon_billing()');
 if(seconds!==null && proof)await sql("UPDATE paragon_call_billing SET account_sid=$1,arrived_at=$2,ended_at=$3,billable_seconds=$4,finalized_at=now(),talk_seconds=10 WHERE parent_call_sid=$5",[AC,arrived,new Date(Date.parse(arrived)+seconds*1000).toISOString(),seconds,parent]);
 return {parent,ping,inbound};
}
before(async()=>{
 await pg.exec(readFileSync(new URL('./fixtures/paragon-billing-schema.sql',import.meta.url),'utf8'));
 await sql('INSERT INTO tenants VALUES($1)',[T]);
 await sql("INSERT INTO lead_sources VALUES($1,$2,'Paragon Media','publisher',true,$3)",[SRC,T,hash]);
 await sql("INSERT INTO vendor_controls VALUES($1,false,$2,now(),'fixture')",[T,JSON.stringify(standard)]);
 await sql("INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES($1,'Mark','20856361','mark',true)",[T]);
 await pg.exec("INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES('mark','Mark','available',true)");
 for(const name of ['051_paragon_vendor_matrix.sql','052_paragon_ping_and_claim.sql','053_paragon_zip_and_reports.sql','055_paragon_vendor_report.sql','056_resolve_recent_paragon_ping.sql','057_paragon_vendor_report_proof.sql','067_paragon_billing_hours.sql']) await pg.exec(migration(name));
});
after(()=>pg.close());
test('hours: exact opening/closing, weekends, winter/summer and DST-transition Sunday',async()=>{
 for(const [time,want] of [
 ['2026-10-02T14:14:59Z',false],['2026-10-02T14:15:00Z',true],['2026-10-02T21:14:59Z',true],['2026-10-02T21:15:00Z',false],
 ['2026-10-03T15:00:00Z',false],['2026-10-04T15:00:00Z',false],['2026-01-05T15:14:59Z',false],['2026-01-05T15:15:00Z',true],
 ['2026-03-06T15:15:00Z',true],['2026-03-09T14:15:00Z',true],['2026-11-02T15:15:00Z',true],['2026-10-30T14:15:00Z',true],
 ['2026-03-08T15:00:00Z',false],['2026-11-01T16:00:00Z',false]]) {
  assert.equal((await sql('SELECT paragon_hours_open($1,$2) open',[JSON.stringify(standard),time]))[0].open,want,time);
 }
 for(const hours of [null,{}, {timezone:'UTC',days:standard.days},{timezone:'America/New_York',days:{}}, {timezone:'America/New_York',days:{fri:{enabled:true,start:'garbage',end:'17:15'}}}])
  assert.equal((await sql("SELECT paragon_hours_open($1,'2026-10-02T15:00:00Z') open",[JSON.stringify(hours)]))[0].open,false);
});
test('hard and soft caps at 19/20/21; unlimited is never a cap wall',async()=>{
 await sql('UPDATE vendor_controls SET staffed_hours=$1',[JSON.stringify(allOpen)]);
 for(let n=1;n<=19;n++)await makeCall(n,{seconds:90});
 for(const count of [19,20,21]) {
  if(count>19)await makeCall(count,{seconds:90});
  for(const mode of ['soft','hard']) {
   await sql('UPDATE vendor_controls SET paragon_cap_mode=$1,paragon_daily_cap=20',[mode]);
   const gate=(await sql('SELECT paragon_new_ping_gate($1,now()) gate',[T]))[0].gate;
   assert.equal(gate,mode==='hard' && count>=20?'daily_cap_reached':null);
   const decision=(await sql("SELECT paragon_ping($1,'KS','+15550000999',$2,true) decision",[hash,mode+'-'+count]))[0].decision;
   assert.equal(decision.available,!(mode==='hard' && count>=20));
   if(decision.available) assert.equal(Number((await sql("SELECT extract(epoch FROM accepted_until-received_at) seconds FROM paragon_ping_decisions WHERE vendor_call_id=$1",[mode+'-'+count]))[0].seconds),30);
   await pg.exec('DELETE FROM paragon_agent_reservations');
  }
 }
 await pg.exec("UPDATE vendor_controls SET paragon_daily_cap=NULL,paragon_cap_mode='hard'");
 assert.equal((await sql('SELECT paragon_new_ping_gate($1,now()) gate',[T]))[0].gate,null);
});
test('new actual pings blocked by cap/hours; valid commitment survives both gates and newer denial',async()=>{
 await pg.exec("UPDATE vendor_controls SET paragon_daily_cap=20,paragon_cap_mode='hard'");
 let decision=(await sql("SELECT paragon_ping($1,'KS','+15550000001','blocked',true) decision",[hash]))[0].decision;
 assert.equal(decision.reason,'daily_cap_reached');
 const now=Date.now(),received=new Date(now-10000).toISOString(),deadline=new Date(now+20000).toISOString();
 const committed=(await sql("INSERT INTO paragon_ping_decisions(source_id,received_at,caller_state,caller_phone,vendor_call_id,available,reason,agent_id,accepted_until,rate_per_call) VALUES($1,$2,'KS','+15550000002','commit',true,'accepted_full','mark',$3,28) RETURNING id",[SRC,received,deadline]))[0].id;
 await sql("INSERT INTO paragon_agent_reservations(source_id,reservation_key,caller_state,agent_id,expires_at) VALUES($1,'id:commit','KS','mark',$2)",[SRC,deadline]);
 await sql("UPDATE vendor_controls SET staffed_hours='{}'");
 decision=(await sql("SELECT paragon_ping($1,'KS','+15550000003','new-closed',true) decision",[hash]))[0].decision;assert.equal(decision.reason,'outside_staffed_hours');
 decision=(await sql("SELECT paragon_ping($1,'KS','+15550000002','commit',true) decision",[hash]))[0].decision;assert.equal(decision.available,true);
 await sql("INSERT INTO paragon_ping_decisions(source_id,caller_state,caller_phone,vendor_call_id,available,reason) VALUES($1,'KS','+15550000002','commit',false,'outside_staffed_hours')",[SRC]);
 const matched=(await sql("SELECT * FROM resolve_recent_paragon_ping_at('+15550000002','commit',$1,$2)",[sid(100),new Date(now).toISOString()]))[0];assert.equal(matched.available,true);
 const claim=await sql("SELECT * FROM claim_paragon_call_at($1,'+15550000002','commit','{}',NULL,true,$2)",[sid(100),new Date(now).toISOString()]);assert.equal(claim[0].agent_id,'mark');
 assert.equal((await sql('SELECT matched_call_sid FROM paragon_ping_decisions WHERE id=$1',[committed]))[0].matched_call_sid,sid(100));
});
test('expired commitments reject, processing delay does not invalidate an in-window arrival, eligibility remains unchanged',async()=>{
 await pg.exec("UPDATE agent_availability SET active_call_sid=NULL,status='available',available=true; DELETE FROM paragon_agent_reservations;");
 const received=new Date(Date.now()-40000).toISOString(),deadline=new Date(Date.now()-10000).toISOString();
 await sql("INSERT INTO paragon_ping_decisions(source_id,received_at,caller_state,caller_phone,vendor_call_id,available,reason,agent_id,accepted_until,rate_per_call) VALUES($1,$2,'KS','+15550000004','delayed',true,'accepted_full','mark',$3,28)",[SRC,received,deadline]);
 let match=(await sql("SELECT * FROM resolve_recent_paragon_ping_at('+15550000004','delayed',$1,now())",[sid(101)]))[0];assert.equal(match.available,false);assert.equal(match.reason,'reservation_expired');
 assert.equal((await sql("SELECT * FROM claim_paragon_call_at($1,'+15550000004','delayed','{}',NULL,true,now())",[sid(101)])).length,0);
 assert.equal((await sql("SELECT * FROM claim_paragon_call_at($1,'+15550000004','delayed','{}',NULL,true,$2)",[sid(101),new Date(Date.parse(deadline)-1000).toISOString()]))[0].agent_id,'mark');
 assert.equal((await sql("SELECT paragon_agent_tier('mark','KS',$1) tier",[SRC]))[0].tier,'full');
 assert.equal((await sql("SELECT paragon_agent_tier('mark','NC',$1) tier",[SRC]))[0].tier,'ineligible');
});
test('89/90/91 arrival-to-end finalization is independent of callback order and cannot be repriced',async()=>{
 for(const seconds of [89,90,91])for(const order of [[0,1,2],[2,1,0],[1,0,2],[0,2,1],[1,2,0],[2,0,1]]) {
  const n=200+seconds*10+order[0]*3+order[1];const call=await makeCall(n);const arrival='2026-10-02T14:15:00Z',end=new Date(Date.parse(arrival)+seconds*1000).toISOString();
  const events=[{AccountSid:AC,CallSid:call.parent,CallStatus:'ringing',Timestamp:arrival},
   {AccountSid:AC,CallSid:sid(n+10000),ParentCallSid:call.parent,CallStatus:'in-progress',Timestamp:'2026-10-02T14:15:10Z'},
   {AccountSid:AC,CallSid:call.parent,CallStatus:'completed',Timestamp:end}];
  for(const index of order)await enqueueBillingCallback(db,config,events[index]);
  const job=(await sql("UPDATE paragon_call_billing SET lease_token=gen_random_uuid() WHERE parent_call_sid=$1 RETURNING *",[call.parent]))[0];
  const parent={sid:call.parent,accountSid:AC,direction:'inbound',status:'completed',dateCreated:arrival,endTime:end};
  const children=[{sid:sid(n+10000),accountSid:AC,parentCallSid:call.parent,status:'completed',duration:String(seconds-10),endTime:end}];
  await processBillingJob({db,config,job,fetchParent:async()=>parent,fetchChildren:async()=>children});
  const saved=(await sql('SELECT * FROM paragon_call_billing WHERE parent_call_sid=$1',[call.parent]))[0];
  assert.equal(saved.billable_seconds,seconds);assert.equal(saved.ring_seconds,10);assert.equal(saved.talk_seconds,seconds-10);
  assert.equal((await sql('SELECT is_billable FROM paragon_billing_facts WHERE parent_call_sid=$1',[call.parent]))[0].is_billable,seconds>=90);
  await assert.rejects(sql('UPDATE paragon_call_billing SET billable_seconds=999 WHERE parent_call_sid=$1',[call.parent]),/immutable/);
  await assert.rejects(sql('UPDATE paragon_call_billing SET rate_per_call=33 WHERE parent_call_sid=$1',[call.parent]),/immutable/);
 }
});
test('same proof, billable seconds and snapshotted rate drive vendor/daily/weekly; internal disputes stay out of CSV',async()=>{
 const start='2026-10-01T00:00:00Z',end='2026-10-03T00:00:00Z';
 await makeCall(400,{seconds:90,arrived:'2026-10-02T15:00:00Z',wrong:true,rate:29});
 await makeCall(401,{seconds:999,arrived:'2026-10-02T15:00:00Z',proof:false});
 await makeCall(402,{arrived:'2026-10-02T15:00:00Z'});
 const rows=await sql('SELECT * FROM paragon_vendor_report($1,$2,$3)',[SRC,start,end]);
 assert.equal(Object.keys(rows[0]).length,8);assert.ok(!rows.some(row=>row.call_id==='vendor-401'));
 assert.equal(rows.find(row=>row.call_id==='vendor-400').duration_seconds,90);assert.equal(rows.find(row=>row.call_id==='vendor-402').non_billable_reason,'billing_unverified');
 const total=(await sql('SELECT paragon_report_totals($1,$2,$3) totals',[SRC,start,end]))[0].totals;
 const weekly=(await sql('SELECT paragon_weekly_reconciliation($1,$2,$3) totals',[T,start,end]))[0].totals;
 assert.equal(Number(weekly.expected_invoice),total.reduce((n,day)=>n+Number(day.amount_due),0));
 assert.equal(Number(weekly.billable_calls),rows.filter(row=>row.billable==='yes').length);
 assert.equal(weekly.wrong_state_calls[0].billing_dispute,true);assert.equal(Number(weekly.wrong_state_calls[0].amount_due),29);
 await assert.rejects(sql('SELECT paragon_weekly_reconciliation($1,$2,$3,33)',[T,start,end]),/persisted Paragon rates/);
});
test('lease fencing, provider conflicts, missing evidence and retry preserve finalized billing',async()=>{
 const call=await makeCall(500);let job=(await sql('UPDATE paragon_call_billing SET lease_token=gen_random_uuid() WHERE parent_call_sid=$1 RETURNING *',[call.parent]))[0];
 assert.equal(await processBillingJob({db,config,job,fetchParent:async()=>{throw Error('timeout');},fetchChildren:async()=>[]}), 'retry');
 assert.equal((await sql('SELECT billable_seconds FROM paragon_call_billing WHERE parent_call_sid=$1',[call.parent]))[0].billable_seconds,null);
 const arrived='2026-10-02T15:00:00Z';
 job=(await sql('UPDATE paragon_call_billing SET lease_token=gen_random_uuid() WHERE parent_call_sid=$1 RETURNING *',[call.parent]))[0];
 const args=[call.parent,job.lease_token,AC,arrived,'2026-10-02T15:01:30Z',null,0,'{}'];
 await sql('SELECT record_paragon_billing_snapshot($1,$2,$3,$4,$5,$6,$7,$8)',args);
 assert.equal((await sql('SELECT record_paragon_billing_snapshot($1,$2,$3,$4,$5,$6,$7,$8) outcome',args))[0].outcome,'lease_lost');
 const next=(await sql('UPDATE paragon_call_billing SET lease_token=gen_random_uuid() WHERE parent_call_sid=$1 RETURNING *',[call.parent]))[0];
 args[1]=next.lease_token;args[4]='2026-10-02T15:02:00Z';
 assert.equal((await sql('SELECT record_paragon_billing_snapshot($1,$2,$3,$4,$5,$6,$7,$8) outcome',args))[0].outcome,'conflict');
 assert.equal((await sql('SELECT billable_seconds FROM paragon_call_billing WHERE parent_call_sid=$1',[call.parent]))[0].billable_seconds,90);
});
test('settings validate, are audited, and cannot alter eligibility; private ledger/RPCs deny browser roles',async()=>{
 const valid={staffed_hours:standard,daily_cap:'',cap_mode:'soft',rate:28};assert.equal(validateParagonControls(valid).cap,null);
 for(const bad of [{...valid,rate:0},{...valid,cap_mode:'wall'},{...valid,daily_cap:-1},{...valid,staffed_hours:{}}])assert.throws(()=>validateParagonControls(bad));
 const before=await sql('SELECT count(*) n FROM vendor_agent_state_eligibility');
 await sql('SELECT set_paragon_controls($1,$2,$3,$4,$5,$6)',[T,JSON.stringify(standard),20,'soft',28,'test-admin']);
 assert.equal((await sql('SELECT count(*) n FROM vendor_agent_state_eligibility'))[0].n,before[0].n);
 assert.equal((await sql('SELECT count(*)::int n FROM paragon_control_changes'))[0].n,1);
 for(const role of ['anon','authenticated']) {
  await pg.exec('SET ROLE '+role);
  for(const table of ['paragon_call_billing','paragon_billing_events','paragon_billing_facts','paragon_control_changes'])await assert.rejects(pg.exec('SELECT * FROM '+table),/permission denied/);
  await assert.rejects(pg.exec('SELECT claim_paragon_billing_jobs(1)'),/permission denied/);await pg.exec('RESET ROLE');
 }
});
test('compatibility uses old RPCs only for missing 067; never falls back on provider/DB failure',async()=>{
 const seen=[];const fake={rpc:async(name)=>{seen.push(name);return name.endsWith('_at')?{error:{code:'PGRST202'}}:{data:[]};}};
 await resolveParagonArrival(fake,{},'time');await claimParagonArrival(fake,{},'time');assert.deepEqual(seen,['resolve_recent_paragon_ping_at','resolve_recent_paragon_ping','claim_paragon_call_at','claim_paragon_call']);
 assert.equal((await resolveParagonArrival({rpc:async()=>({error:{code:'XX000'}})}, {}, 'time')).error.code,'XX000');
 const fallback=await paragonReportTotals({rpc:async()=>({error:{code:'PGRST202'}})},SRC,'start','end',[{received_at:'2026-10-02T15:00:00Z',billable:'yes'}]);assert.equal(fallback[0].amount_due,28);
 await assert.rejects(paragonReportTotals({rpc:async()=>({error:{code:'XX000'}})},SRC,'start','end',[]),/unavailable/);
});
test('provider snapshot never uses browser/recording duration; failed parent needs signed parent timestamp',()=>{
 const parent={sid:sid(600),accountSid:AC,direction:'inbound',status:'failed',dateCreated:'2026-10-02T15:00:00Z',endTime:null,duration:'999'};
 assert.equal(verifiedBillingSnapshot(parent,[],config,[]).ended,null);
 assert.equal(verifiedBillingSnapshot(parent,[],config,[{AccountSid:AC,CallSid:parent.sid,CallStatus:'failed',Timestamp:'2026-10-02T15:01:30Z',RecordingDuration:'999'}]).ended,'2026-10-02T15:01:30.000Z');
 assert.throws(()=>verifiedBillingSnapshot({...parent,accountSid:'other'},[],config),/invalid_parent/);
});

test('ET report day boundaries include the 23/25-hour DST days',()=>{
 assert.equal(etMidnight('2026-03-08'),'2026-03-08T05:00:00.000Z');
 assert.equal(etMidnight('2026-03-09'),'2026-03-09T04:00:00.000Z');
 assert.equal(etMidnight('2026-11-01'),'2026-11-01T04:00:00.000Z');
 assert.equal(etMidnight('2026-11-02'),'2026-11-02T05:00:00.000Z');
});

test('admission uses verified parent arrival rather than late webhook receipt',async()=>{
 const time='2026-10-02T15:00:00Z',parent={sid:sid(700),accountSid:AC,direction:'inbound',dateCreated:time};
 assert.equal(await verifiedParagonArrival(config,parent.sid,async()=>parent),'2026-10-02T15:00:00.000Z');
 for(const invalid of [{...parent,accountSid:'other'},{...parent,sid:sid(701)},{...parent,direction:'outbound-api'},{...parent,dateCreated:null}])
  await assert.rejects(verifiedParagonArrival(config,parent.sid,async()=>invalid),/could not be verified/);
});
test('durable callback errors require retry; wrong account never reaches the ledger',async()=>{
 let calls=0;const fake={rpc:async()=>{calls++;return {error:{code:'XX000'}};}};
 await assert.rejects(enqueueBillingCallback(fake,config,{AccountSid:AC,CallSid:sid(702),CallStatus:'completed'}),/persistence failed/);
 await assert.rejects(enqueueBillingCallback(fake,config,{AccountSid:'other',CallSid:sid(702)}),/account mismatch/);assert.equal(calls,1);
});
test('parent completion before late child visibility fills talk without changing immutable billable seconds',async()=>{
 const call=await makeCall(703),parent={sid:call.parent,accountSid:AC,direction:'inbound',dateCreated:'2026-10-02T15:00:00Z',status:'completed',endTime:'2026-10-02T15:01:30Z'};
 let job=(await sql('UPDATE paragon_call_billing SET lease_token=gen_random_uuid() WHERE parent_call_sid=$1 RETURNING *',[call.parent]))[0];
 await processBillingJob({db,config,job,fetchParent:async()=>parent,fetchChildren:async()=>[]});
 const original=(await sql('SELECT * FROM paragon_call_billing WHERE parent_call_sid=$1',[call.parent]))[0];assert.equal(original.billable_seconds,90);
 job=(await sql('UPDATE paragon_call_billing SET lease_token=gen_random_uuid() WHERE parent_call_sid=$1 RETURNING *',[call.parent]))[0];
 await processBillingJob({db,config,job,fetchParent:async()=>parent,fetchChildren:async()=>[{sid:sid(704),accountSid:AC,parentCallSid:call.parent,status:'completed',duration:'80',endTime:parent.endTime}]});
 const late=(await sql('SELECT * FROM paragon_call_billing WHERE parent_call_sid=$1',[call.parent]))[0];assert.equal(late.billable_seconds,90);assert.equal(late.talk_seconds,80);assert.equal(late.ring_seconds,10);assert.equal(late.finalized_at.getTime(),original.finalized_at.getTime());
});
