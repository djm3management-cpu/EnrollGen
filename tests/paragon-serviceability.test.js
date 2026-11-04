import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createParagonCallbacksHandler} from '../netlify/functions/paragon-zip-confirm.js';
const pg=new PGlite(),base=evidenceDb(pg);
const db={...base,async rpc(name,args){const result=await base.rpc(name,args);if(name==='decrypt_pii_value'&&result.data)result.data=result.data[0]?.[name];return result;}};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),foreign=id(2),source=id(3),dylan=id(4),mark=id(5),mike=id(6),legacy=id(10),legacyTask=id(11);
const sql=async(query,args=[]) => (await pg.query(query,args)).rows;
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const sid=n=>'CA'+String(n).padStart(32,'0');
async function addCall(n,{state=null,zip=null,wrong=false,answer='dylan_maria'}={}){
 const call=id(n),record=id(n+1000);
 await sql(`INSERT INTO call_records(id,tenant_id,customer_first_name,customer_last_name) VALUES($1,$2,'Jane','Doe')`,[record,tenant]);
 await sql(`INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,source_kind,lead_source_id,routed_agent_id,from_number,caller_state,confirmed_state,confirmed_zip,wrong_state,call_record_id,status)
 VALUES($1,$2,$3,'publisher',$4,$5,'+15555550123','FL',$6,$7,$8,$9,'completed')`,[call,tenant,sid(n),source,answer,state,zip,wrong,record]);
 const [ping]=await sql(`INSERT INTO paragon_ping_decisions(source_id,available,reason,matched_call_sid,vendor_call_id) VALUES($1,true,'accepted_full',$2,$3) RETURNING id`,[source,sid(n),'vendor-'+n]);
 await sql(`INSERT INTO paragon_call_billing(parent_call_sid,tenant_id,source_id,ping_id,inbound_call_id,arrived_at,ended_at,billable_seconds,finalized_at,rate_per_call)
 VALUES($1,$2,$3,$4,$5,'2026-10-29T14:00:00Z','2026-10-29T14:02:00Z',120,now(),28)`,[sid(n),tenant,source,ping.id,call]);
 return call;
}
const authenticate=async()=>({userId:'dylan-user',orgId:'org-a'});
const handler=options=>createParagonCallbacksHandler({authenticate,getDb:()=>db,...options});
const request=body=>new Request('https://app.test/api/paragon-zip-confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function existingCallback(n){
 const call=await addCall(n,{state:'AZ',zip:'85001',wrong:true});
 const [task]=await sql(`INSERT INTO paragon_callback_tasks(inbound_call_id,tenant_id,assigned_agent_id,caller_state,confirmed_zip)
 VALUES($1,$2,'mark_endres','AZ','85001') RETURNING id`,[call,tenant]);
 return {call,task};
}
const rollback=async work=>{await pg.exec('BEGIN');try{await work();}finally{await pg.exec('ROLLBACK');}};
before(async()=>{
 await pg.exec(readFileSync(new URL('./fixtures/paragon-billing-schema.sql',import.meta.url),'utf8'));
 await pg.exec(`ALTER TABLE tenants ADD clerk_org_id text;ALTER TABLE tenant_agents ADD clerk_user_id text;
 ALTER TABLE inbound_calls ADD routed_agent_id text,ADD return_reason text;
 ALTER TABLE call_records ADD contact_id uuid,ADD customer_first_name text,ADD customer_last_name text;
 CREATE TABLE call_transcripts(id uuid PRIMARY KEY,disposition text);`);
 await sql(`INSERT INTO tenants VALUES($1,'org-a'),($2,'org-b')`,[tenant,foreign]);
 await sql(`INSERT INTO lead_sources(id,tenant_id,name,type,active) VALUES($1,$2,'Paragon Media','publisher',true)`,[source,tenant]);
 for(const [agent,name,npn,slug,user] of [[dylan,'Dylan Maria','22167358','dylan_maria','dylan-user'],[mark,'Mark Endres','20856361','mark_endres','mark-user'],[mike,'Mike Shiomos','20574678','mike_shiomos','mike-user']])await sql(`INSERT INTO tenant_agents(id,tenant_id,name,npn,agent_slug,clerk_user_id,is_active) VALUES($1,$2,$3,$4,$5,$6,true)`,[agent,tenant,name,npn,slug,user]);
 await pg.exec(`INSERT INTO agent_availability(agent_id,status,available) VALUES('dylan_maria','available',true),('mark_endres','offline',false),('mike_shiomos','available',true)`);
 for(const name of ['051_paragon_vendor_matrix.sql','052_paragon_ping_and_claim.sql','053_paragon_zip_and_reports.sql','055_paragon_vendor_report.sql','056_resolve_recent_paragon_ping.sql','057_paragon_vendor_report_proof.sql','067_paragon_billing_hours.sql','098_ancillary_sale_disposition.sql'])await pg.exec(migration(name));
 await addCall(10,{state:'NY',zip:'10001',wrong:true});
 await sql(`INSERT INTO paragon_callback_tasks(id,inbound_call_id,tenant_id,assigned_agent_id,caller_state,confirmed_zip) VALUES($1,$2,$3,'mike_shiomos','NY','10001')`,[legacyTask,legacy,tenant]);
 await addCall(12,{state:'AZ',zip:'85001',wrong:true});
 await sql(`INSERT INTO paragon_callback_tasks(id,inbound_call_id,tenant_id,assigned_agent_id,caller_state,confirmed_zip) VALUES($1,$2,$3,'mike_shiomos','AZ','85001')`,[id(13),id(12),tenant]);
 await pg.exec(migration('126_paragon_out_of_state_tasks.sql'));
});
after(()=>pg.close());
test('migration closes unserviceable legacy fallback tasks and exposes the confirmed state on report',async()=>{
 const [task]=await sql('SELECT * FROM paragon_callback_tasks WHERE id=$1',[legacyTask]);assert.equal(task.status,'cancelled');assert.equal(task.reason,'out_of_state_not_serviceable');assert.ok(task.closed_at);
 const [call]=await sql('SELECT * FROM inbound_calls WHERE id=$1',[legacy]);assert.equal(call.paragon_serviceability,'not_serviceable');assert.equal(call.confirmed_state,'NY');assert.equal(call.return_reason,'out_of_state_not_serviceable');
 const report=(await sql(`SELECT * FROM paragon_vendor_report($1,'2026-10-29','2026-10-30')`,[source])).find(row=>row.call_id==='vendor-10');assert.equal(report.caller_state,'NY');assert.equal(report.serviceability,'Out of state: not serviceable');assert.equal(report.billable,'yes','a dispute flag does not rewrite stored billing evidence');
 const [eligibleLegacy]=await sql('SELECT * FROM paragon_callback_tasks WHERE id=$1',[id(13)]);assert.equal(eligibleLegacy.assigned_agent_id,'mark_endres');assert.equal(eligibleLegacy.status,'open');
 await sql(`UPDATE paragon_callback_tasks SET status='completed' WHERE id=$1`,[id(13)]);
});
test('assigned agent sees existing callback details/count and can reschedule/complete without residence confirmation',()=>rollback(async()=>{
 const {call,task}=await existingCallback(25);
 const own=handler({authenticate:async()=>({userId:'mark-user',orgId:'org-a'})});
 let response=await own(new Request('https://app.test/api/paragon-zip-confirm?summary=1'));assert.equal(response.status,200);assert.equal((await response.json()).count,1);
 const body=await (await own(new Request('https://app.test/api/paragon-zip-confirm'))).json();assert.equal(body.tasks[0].caller_name,'Jane Doe');assert.equal(body.tasks[0].caller_phone,'+15555550123');assert.equal(body.tasks[0].caller_state,'AZ');assert.equal(body.tasks[0].inbound_call_id,call);assert.equal(Object.hasOwn(body.tasks[0],'confirmed_zip'),false);
 assert.equal((await handler()(request({action:'complete',task_id:task.id}))).status,403,'wrong agent cannot complete');
 assert.equal((await own(request({action:'reschedule',task_id:task.id,due_at:'2026-11-02T14:00:00Z'}))).status,200);
 assert.equal((await own(request({action:'complete',task_id:task.id}))).status,200);
 assert.equal((await own(request({action:'complete',task_id:task.id}))).status,403);
 assert.equal((await sql('SELECT status FROM paragon_callback_tasks WHERE id=$1',[task.id]))[0].status,'completed');
 assert.equal((await (await own(new Request('https://app.test/api/paragon-zip-confirm?summary=1'))).json()).count,0);
}));
test('removed residence-confirmation requests cannot read or write call confirmation fields',()=>rollback(async()=>{
 const call=await addCall(26),before=await sql('SELECT confirmed_zip,confirmed_state,wrong_state FROM inbound_calls WHERE id=$1',[call]);
 assert.equal((await handler()(request({inbound_call_id:call,zip:'85001',state:'AZ'}))).status,400);
 assert.deepEqual(await sql('SELECT confirmed_zip,confirmed_state,wrong_state FROM inbound_calls WHERE id=$1',[call]),before);
 assert.equal((await sql('SELECT * FROM paragon_callback_tasks WHERE inbound_call_id=$1',[call])).length,0);
 assert.equal((await handler({authenticate:async()=>({userId:'dylan-user',orgId:'org-b'})})(new Request('https://app.test/api/paragon-zip-confirm?summary=1'))).status,403);
 await pg.exec('SAVEPOINT denied;SET ROLE authenticated');await assert.rejects(()=>sql('SELECT reconcile_paragon_serviceability($1,$2)',[call,tenant]),/permission denied/);await pg.exec('ROLLBACK TO SAVEPOINT denied');
}));

test('task caller name falls back to existing encrypted contact names when call-record names are absent',()=>rollback(async()=>{
 const {call}=await existingCallback(28);
 await pg.exec(`CREATE TABLE contacts(id uuid,tenant_id uuid,pii_encrypted jsonb);
 CREATE FUNCTION decrypt_pii_value(p_encrypted jsonb) RETURNS text LANGUAGE sql AS $$ SELECT p_encrypted->>'fixture_value' $$;`);
 await sql(`INSERT INTO contacts VALUES($1,$2,'{"first_name":{"fixture_value":"Contact"},"last_name":{"fixture_value":"Name"}}')`,[id(80),tenant]);
 await sql('UPDATE call_records SET customer_first_name=NULL,customer_last_name=NULL,contact_id=$1 WHERE id=$2',[id(80),id(1028)]);
 const own=handler({authenticate:async()=>({userId:'mark-user',orgId:'org-a'})});
 const response=await own(new Request('https://app.test/api/paragon-zip-confirm'));assert.equal(response.status,200);
 const task=(await response.json()).tasks.find(task=>task.inbound_call_id===call);assert.equal(task.caller_name,'Contact Name');assert.equal(task.contact_id,id(80));
}));
