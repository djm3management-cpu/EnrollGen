import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createCallRecordDetailsHandler} from '../netlify/functions/call-record-details.js';
import {createComplianceUploadsHandler} from '../netlify/functions/compliance-uploads.js';
import {OPTIONAL_CALL_FIELDS} from '../src/lib/callRecordDetails.js';
const pg=new PGlite(),db=evidenceDb(pg);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),mike=id(2),dylan=id(3),mikeCall=id(4),dylanCall=id(5),foreignCall=id(6);
const member=userId=>({userId,orgId:'org-a',tokenPayload:{org_role:'org:member'}});
const admin={userId:'mike-user',orgId:'org-a',tokenPayload:{public_metadata:{isAdmin:true}}};
const query=async(sql,args=[]) => (await pg.query(sql,args)).rows;
before(async()=>{
 const fields=OPTIONAL_CALL_FIELDS.map(([key,,type])=>`${key} ${type==='date'?'date':'text'}`).join(',');
 await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
 CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,call_record_id uuid);
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,session_id uuid,twilio_call_sid text,call_outcome text,${fields});
 CREATE TABLE telephony_call_attempts(id uuid,tenant_id uuid,call_record_id uuid,parent_call_sid text,agent_id text);
 CREATE TABLE conversely_submissions(id uuid,tenant_id uuid,call_id uuid,twilio_recording_sid text,confirmation_code text,status text,attempts integer,last_error text,updated_at timestamptz,next_attempt_at timestamptz);
 CREATE TABLE ix_uploads(LIKE conversely_submissions);
 CREATE TABLE compliance_missing_codes(tenant_id uuid,call_start timestamptz);
 CREATE TABLE compliance_reconciliation(tenant_id uuid,day date);
 INSERT INTO tenants VALUES('${tenant}','org-a'),('${id(7)}','org-b');
 INSERT INTO enrolled_agents VALUES('${mike}','${tenant}','mike-user','Mike Shiomos',NULL,true),('${dylan}','${tenant}','dylan-user','Dylan Maria',NULL,true);
 INSERT INTO recording_agent_subjects VALUES('${tenant}','mike-user','mike_shiomos'),('${tenant}','dylan-user','dylan_maria');
 INSERT INTO sessions VALUES('${id(8)}','${tenant}','${mike}','${mikeCall}'),('${id(9)}','${tenant}','${dylan}','${dylanCall}');
 INSERT INTO call_records(id,tenant_id,agent_id,session_id,call_outcome) VALUES('${mikeCall}','${tenant}','${mike}','${id(8)}','incomplete'),('${dylanCall}','${tenant}','${dylan}','${id(9)}','incomplete'),('${foreignCall}','${id(7)}','${id(10)}',NULL,'incomplete');`);
});
after(()=>pg.close());
for(const [label,auth,target,expected] of [['agent-own',member('dylan-user'),dylanCall,200],['admin-other',admin,dylanCall,200],['global-admin-no-org',{...admin,orgId:null},dylanCall,200],['agent-other',member('mike-user'),dylanCall,403],['admin-foreign',admin,foreignCall,403]]){
 test(`optional call details ${label} follows owner-or-admin authorization`,async()=>{
  const handler=createCallRecordDetailsHandler({authenticate:async()=>auth,getDb:()=>db});
  const url=`https://app.test/api/call-record-details?call_record_id=${target}`;
  assert.equal((await handler(new Request(url))).status,expected);
  const response=await handler(new Request(url,{method:'PATCH',body:JSON.stringify({plan_name:label,call_outcome:'enrolled',agent_id:mike,role:'admin'})}));assert.equal(response.status,expected);
  const [record]=await query('SELECT agent_id,call_outcome FROM call_records WHERE id=$1',[target]);assert.equal(record.agent_id,target===foreignCall?id(10):dylan);assert.equal(record.call_outcome,'incomplete');
 });
 test(`compliance code correction ${label} follows the same administrator rule`,async()=>{
  const handler=createComplianceUploadsHandler({authenticate:async()=>auth,getDb:()=>db});
  const response=await handler(new Request('https://app.test/api/compliance-uploads',{method:'PATCH',body:JSON.stringify({call_id:target,sunfire_code:'SF-'+label})}));assert.equal(response.status,expected);
 });
}
test('compliance queue admin access recognizes signed isAdmin while ordinary agents remain denied',async()=>{
 for(const [auth,expected] of [[admin,200],[member('mike-user'),403]]){
  const response=await createComplianceUploadsHandler({authenticate:async()=>auth,getDb:()=>db})(new Request('https://app.test/api/compliance-uploads'));assert.equal(response.status,expected);
 }
});
