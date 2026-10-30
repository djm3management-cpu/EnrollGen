import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {evidenceDb} from './helpers/evidenceDb.js';
import {emptyIntake,normalizeIntake,intakeErrors,formatPhone,formatMbi,formatPremium,followUpDate,fieldVisible,planAutofill,ghlPayload,carrierKey,intakeCallFields,INTAKE_FIELDS,CARRIERS} from '../src/lib/enrollmentIntake.js';
import {createEnrollmentIntakesHandler} from '../netlify/functions/enrollment-intakes.js';
import {deliverEnrollmentWebhooks} from '../integrations/enrollmentWebhook.js';
import {converselyPayload,createComplianceWorker} from '../integrations/complianceUploads.js';
import {createIxIntegration} from '../integrations/ixUploads.js';
const pg=new PGlite({extensions:{pgcrypto}}),base=evidenceDb(pg);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),agent=id(2),contact=id(3),call=id(4),household=id(5);
const db={...base,async rpc(name,args={}){
 const prepared=Object.fromEntries(Object.entries(args).map(([key,value])=>[key,['p_data','p_payload','p_encrypted','p_decisions'].includes(key)?JSON.stringify(value):value]));
 const result=await base.rpc(name,prepared);
 if(['save_enrollment_intake','encrypt_pii_value','decrypt_pii_value'].includes(name)&&result.data)result.data=result.data[0]?.[name];
 return result;
}};
const query=async(sql,args=[]) => (await pg.query(sql,args)).rows;
const valid=(extra={})=>normalizeIntake({...emptyIntake('Mike Shiomos'),firstName:'Jane',lastName:'Doe',dob:'1955-02-28',phone:'2125550101',state:'NY',zip:'10001',mbi:'1ab2cd3ef45',prevCarrier:'Original Medicare',newCarrier:'UnitedHealthcare',planName:'Test Plan',enrollCode:'AEP',premium:'0',contractId:'H1234',planId:'001',sunfireCode:'SF-123',effectiveDate:'2027-01-01',sixtyDayDate:'2027-03-02',...extra});
const authenticate=async()=>({userId:'user-a',orgId:'org-a'});
const handler=(options={})=>createEnrollmentIntakesHandler({authenticate,getDb:()=>db,deliver:async()=>{},now:()=> '2026-10-29T16:00:00.000Z',...options});
const req=(data,extras={})=>new Request(`https://app.test/api/enrollment-intakes?call_id=${call}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,...extras})});
let intakeId;
before(async()=>{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA extensions;CREATE SCHEMA pii_vault;CREATE SCHEMA vault;
 CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE TABLE vault.decrypted_secrets(id uuid PRIMARY KEY,decrypted_secret text);
 CREATE TABLE pii_vault.encryption_keys(key_id uuid PRIMARY KEY,vault_secret_id uuid,is_active boolean,created_at timestamptz DEFAULT now());
 INSERT INTO vault.decrypted_secrets VALUES('${id(90)}','test-only-secret');
 INSERT INTO pii_vault.encryption_keys VALUES('${id(91)}','${id(90)}',true,now());
 CREATE TABLE cms_plans_py2027(id bigint PRIMARY KEY,plan_year integer,state_code text,category text,carrier text,plan_name text,contract_id text,plan_id text,segment_id text,monthly_premium numeric,county_name text);
 INSERT INTO cms_plans_py2027 SELECT n,2027,'NY','MA-PD','Aetna Health Inc.','Landscape Aetna Plan','H9999','012','0',0,'County '||n FROM generate_series(1,1001) n;
 INSERT INTO cms_plans_py2027 VALUES(1002,2027,'NY','MA','Humana','Landscape Humana Plan','H8888','012','0',0,'County'),(1003,2027,'NY','PDP','Aetna','Landscape PDP','H7777','012','0',0,'County'),(1004,2027,'NJ','MA','Aetna','Landscape NJ','H6666','012','0',0,'County');
 CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,is_active boolean,name text,npn text);
 CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid,pii_encrypted jsonb,state text,zip text,current_carrier text);
 CREATE TABLE follow_ups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,contact_id uuid,agent_id text,due_at timestamptz,reason text,status text DEFAULT 'open',updated_at timestamptz DEFAULT now());
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,contact_id uuid,call_outcome text,carrier_name text,product_type text,sunfire_code text,call_start timestamptz,agent_name text,
 enrollment_confirmation_number text,compliance_status text,compliance_scorecard_id uuid,metadata jsonb,call_type text,created_at timestamptz,call_duration_seconds integer);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
 CREATE TABLE compliance_scorecards(id uuid,tenant_id uuid,call_id uuid,overall_score numeric,is_thread_composite boolean);
 CREATE TABLE recording_ingestion(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,call_record_id uuid,recording_sid text,account_sid text,callback_call_sid text,recording_channels smallint,copy_status text DEFAULT 'stored',provider_status text,recording_duration_seconds integer,first_seen_at timestamptz DEFAULT now());
 INSERT INTO tenants VALUES('${tenant}','org-a');
 INSERT INTO enrolled_agents VALUES('${agent}','${tenant}','user-a',true,'Mike Shiomos',NULL);
 INSERT INTO contacts(id,tenant_id,state,zip,current_carrier) VALUES('${contact}','${tenant}','NY','10001','Original Medicare'),('${household}','${tenant}','NY','10001','Aetna');
 INSERT INTO call_records VALUES('${call}','${tenant}','${agent}','${contact}','incomplete','Aetna','MA',NULL,'2026-10-20T15:00:00Z','Mike Shiomos','OLD','complete',NULL,'{}','inbound',now(),120);
 INSERT INTO recording_ingestion(tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status) VALUES('${tenant}','${call}','REfixture','ACfixture','CAfixture',2,'completed');`);
 const pii=readFileSync(new URL('../supabase/migrations/022_pii_protection_phase1.sql',import.meta.url),'utf8');
 await pg.exec(pii.slice(pii.indexOf('CREATE OR REPLACE FUNCTION pii_vault.get_active_key()'),pii.indexOf('-- Blind-index HMAC key')));
 await pg.exec(readFileSync(new URL('../supabase/migrations/071_contacts_pii_json_null.sql',import.meta.url),'utf8'));
 for(const migration of ['123_compliance_uploads.sql','124_ix_uploads.sql','125_enrollment_intakes.sql'])await pg.exec(readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
});
after(()=>pg.close());
test('every required field and UHC-only confirmation rule are enforced; defaults are valid',()=>{
 assert.deepEqual(intakeErrors(valid()),{});
 for(const [key] of INTAKE_FIELDS.filter(([, , ,required])=>required))assert.ok(intakeErrors({...valid(),[key]:''})[key],key);
 assert.ok(intakeErrors(valid({sunfireCode:''})).sunfireCode);
 assert.equal(intakeErrors(valid({newCarrier:'Aetna',sunfireCode:''})).sunfireCode,undefined);
 const defaults=emptyIntake('Dylan Maria');assert.equal(defaults.aor,'Dylan Maria');assert.equal(defaults.segmentId,'0');for(const key of ['medicaid','hra','sep'])assert.equal(defaults[key],'No');
 for(const carrier of CARRIERS)assert.ok(carrierKey(carrier));
 assert.equal(carrierKey('Wellcare / Centene'),'WellCare');assert.equal(carrierKey('Elevance / Anthem'),'Anthem');assert.equal(carrierKey('Cigna / HealthSpring'),'HealthSpring');
});
test('conditional fields appear only for Yes and hidden values are cleared',()=>{
 for(const [toggle,field] of [['medicaid','medicaidNum'],['hra','hraDate']]){
  assert.equal(fieldVisible(field,{[toggle]:'No'}),false);assert.equal(fieldVisible(field,{[toggle]:'Yes'}),true);
  assert.equal(normalizeIntake({...valid(),[field]:'stale',[toggle]:'No'})[field],'');
 }
 assert.equal(intakeErrors(valid({hra:'Yes',hraDate:'not-a-date'})).hraDate,'Date of HRA (valid date required)');
});
test('typing formats phone and uppercase MBI, premiums accept zero, and calendar follow-up handles leap years and DST',()=>{
 assert.equal(formatPhone('212'),'\u0028212');assert.equal(formatPhone('2125'),'(212) 5');assert.equal(formatPhone('+1 2125550101'),'(212) 555-0101');
 assert.equal(formatMbi('1ab2c'),'1AB2-C');assert.equal(formatMbi('1ab2cd3ef45'),'1AB2-CD3-EF45');
 assert.equal(formatPremium('0'),'$0.00');assert.equal(formatPremium('$1,234.50'),'$1234.50');assert.equal(formatPremium(''), '');assert.equal(formatPremium('-1'),'');
 assert.equal(followUpDate('2027-01-01'),'2027-03-02');assert.equal(followUpDate('2028-01-01'),'2028-03-01');assert.equal(followUpDate('2026-10-01'),'2026-11-30');assert.equal(followUpDate('2027-02-30'),'');
 assert.deepEqual(planAutofill({plan_name:'Landscape',contract_id:'H9999',plan_id:'012',segment_id:'',monthly_premium:0}),{planName:'Landscape',contractId:'H9999',planId:'012',segmentId:'0',premium:'$0.00'});
});
test('GHL has exactly the legacy keys, date/phone/MBI/premium formats and mapped agent assignment',()=>{
 const payload=ghlPayload(valid({medicaid:'Yes',medicaidNum:'CASE',hra:'Yes',hraDate:'2026-10-29'}),'2026-10-29T16:00:00.000Z');
 assert.deepEqual(Object.keys(payload).sort(),'firstName,lastName,dob,phone,email,state,mbi,medicaid,medicaidNum,prevCarrier,newCarrier,planName,enrollCode,premium,sunfireCode,effectiveDate,sixtyDayDate,sep,contractId,planId,segmentId,enrollmentId,pcpName,agency,aor,assignedUserId,assignedTo,hra,hraDate,submittedAt'.split(',').sort());
 assert.equal(payload.phone,'(212) 555-0101');assert.equal(payload.mbi,'1AB2-CD3-EF45');assert.equal(payload.premium,'$0.00');assert.equal(payload.dob,'1955-02-28');assert.equal(payload.medicaid,'Yes');assert.equal(payload.sep,'No');assert.equal(payload.hra,'Yes');
 assert.equal(payload.agency,'New Gen Health Solutions');assert.equal(payload.assignedUserId,'1UVVwLG5sFIzHVOJJjmE');assert.equal(payload.assignedTo,payload.assignedUserId);
 assert.equal(ghlPayload(valid({aor:'Dylan Maria'}),'now').assignedUserId,'ybc6Z1qfF5PgD1k0DzOo');
});
test('PY2027 plan search filters carrier/state/category, pages county rows and allows manual entry when absent',async()=>{
 const response=await handler()(new Request(`https://app.test/api/enrollment-intakes?call_id=${call}&plans=1&state=NY&carrier=Aetna&q=Landscape`));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.plans.length,1);assert.equal(body.plans[0].plan_name,'Landscape Aetna Plan');assert.equal(body.plans[0].monthly_premium,0);
 const missing=await handler()(new Request(`https://app.test/api/enrollment-intakes?call_id=${call}&plans=1&state=NY&carrier=Aetna&q=Missing`));assert.deepEqual((await missing.json()).plans,[]);
});
test('disposition cannot bypass completed intake requirement and API rejects missing required fields',async()=>{
 await assert.rejects(()=>query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[call]),/Complete the Medicare/);
 const response=await handler()(req({...valid(),contractId:''}));assert.equal(response.status,400);assert.ok((await response.json()).fields.contractId);
 assert.equal((await query('SELECT * FROM enrollment_intakes')).length,0);
});
test('saving survives GHL failure, encrypts all sensitive fields and creates assigned follow-up atomically',async()=>{
 const data=valid({medicaid:'Yes',medicaidNum:'SECRET-CASE'});
 const response=await handler({deliver:async()=>{throw Error('provider unavailable');}})(req(data));
 assert.equal(response.status,200);intakeId=(await response.json()).id;assert.ok(intakeId);
 const [row]=await query('SELECT * FROM enrollment_intakes WHERE id=$1',[intakeId]);
 for(const key of ['dob','mbi','medicaidNum']){
  assert.equal(Object.hasOwn(row.data,key),false);assert.ok(row.pii_encrypted[key].c);assert.ok(row.pii_encrypted[key].k);
  assert.equal((await db.rpc('decrypt_pii_value',{p_encrypted:row.pii_encrypted[key]})).data,data[key]);
 }
 assert.ok(!JSON.stringify(row).includes('SECRET-CASE'));assert.ok(!JSON.stringify(row).includes('1955-02-28'));
 const [task]=await query('SELECT * FROM follow_ups WHERE id=$1',[row.follow_up_id]);assert.equal(task.agent_id,'mike_shiomos');assert.equal(task.contact_id,contact);assert.equal(new Date(task.due_at).toISOString(),'2027-03-02T14:00:00.000Z');
 const [delivery]=await query('SELECT * FROM ghl_enrollment_deliveries');assert.equal(delivery.status,'pending');assert.ok(delivery.payload_encrypted.c);assert.ok(!JSON.stringify(delivery).includes('SECRET-CASE'));
 await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[call]);assert.equal((await query('SELECT * FROM ix_uploads')).length,1);
});
test('GET decrypts only owned intakes and shows sync status; foreign call and organization are denied',async()=>{
 const response=await handler()(new Request(`https://app.test/api/enrollment-intakes?call_id=${call}`));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.intakes[0].data.mbi,'1AB2-CD3-EF45');assert.equal(body.intakes[0].sync.status,'pending');assert.equal(body.prefill.aor,'Mike Shiomos');
 const foreign=await handler()(new Request(`https://app.test/api/enrollment-intakes?call_id=${id(99)}`));assert.equal(foreign.status,403);
 assert.equal((await handler({authenticate:async()=>({userId:'user-a',orgId:'org-b'})})(req(valid()))).status,403);
});
test('editing reuses the follow-up task and preserves submission time; household enrollments have separate rows and contacts',async()=>{
 const first=(await query('SELECT * FROM enrollment_intakes WHERE id=$1',[intakeId]))[0];
 const response=await handler()(req(valid({sixtyDayDate:'2027-04-03',aor:'Dylan Maria'}),{id:intakeId}));assert.equal(response.status,200);
 const updated=(await query('SELECT * FROM enrollment_intakes WHERE id=$1',[intakeId]))[0];assert.equal(updated.follow_up_id,first.follow_up_id);assert.deepEqual(updated.submitted_at,first.submitted_at);
 assert.equal((await query('SELECT * FROM follow_ups')).length,1);assert.equal((await query('SELECT agent_id FROM follow_ups'))[0].agent_id,'dylan_maria');
 const householdResponse=await handler()(req(valid({firstName:'John',sunfireCode:'SF-456'}),{contact_id:household}));assert.equal(householdResponse.status,200);
 assert.equal((await query('SELECT * FROM enrollment_intakes')).length,2);assert.equal((await query('SELECT * FROM follow_ups')).length,2);assert.equal((await query('SELECT * FROM ix_uploads')).length,2);
});
test('GHL uses durable leases, exponential retries, stable idempotency, and sanitized errors',async()=>{
 const sent=[];const env={GHL_ENROLLMENT_WEBHOOK_URL:'https://ghl.test/webhook'};
 for(let attempt=1;attempt<=5;attempt++){
  await query(`UPDATE ghl_enrollment_deliveries SET next_attempt_at=CASE WHEN id=(SELECT id FROM ghl_enrollment_deliveries ORDER BY created_at LIMIT 1) THEN now()-interval '1 second' ELSE now()+interval '1 day' END`);
  await deliverEnrollmentWebhooks(db,{env,limit:1,send:async(url,body,headers)=>{sent.push({url,body:JSON.parse(body),headers});return {status:500};}});
  const [job]=await query(`SELECT *,extract(epoch FROM(next_attempt_at-updated_at))::integer AS delay FROM ghl_enrollment_deliveries ORDER BY created_at LIMIT 1`);
  assert.equal(job.attempts,attempt);assert.equal(job.delay,60*2**(attempt-1));assert.equal(job.last_error,'ghl_delivery_failed');
 }
 assert.equal(sent.length,5);assert.equal(new Set(sent.map(s=>s.headers['Idempotency-Key'])).size,1);assert.equal(sent[0].body.mbi,'1AB2-CD3-EF45');
 await query(`UPDATE ghl_enrollment_deliveries SET next_attempt_at=now()-interval '1 second'`);
 await deliverEnrollmentWebhooks(db,{env,send:async()=>({status:200})});
 assert.equal((await query(`SELECT count(*)::integer AS n FROM ghl_enrollment_deliveries WHERE status='uploaded'`))[0].n,2);
 assert.equal((await query(`SELECT count(*)::integer AS n FROM ghl_enrollment_deliveries WHERE status='failed' AND attempts=5`))[0].n,1);
});
test('compliance metadata comes only from the selected completed intake and submission timestamp',async()=>{
 const [intake]=await query('SELECT * FROM enrollment_intakes WHERE id=$1',[intakeId]);
 const callFields=intakeCallFields({id:call,carrier_name:'STALE',customer_first_name:'STALE',metadata:{contract_id:'STALE'}},intake),payload=converselyPayload(callFields,'https://recording.test/audio.mp3');
 for(const [key,value] of Object.entries({CarrierName:'UnitedHealthcare',PlanName:'Test Plan',ContractID:'H1234',PlanID:'001',SegmentID:'0',EnrollmentID:'',EffectiveDate:'2027-01-01',SubmissionDate:intake.submitted_at,ApplicantFirstName:'Jane',ApplicantLastName:'Doe',ApplicantPhoneNumber:'(212) 555-0101',ApplicantState:'NY',ApplicantZip:'10001'}))assert.equal(payload[key],value,key);
 const candidates=(await db.rpc('conversely_week_candidates',{p_week:'2026-10-19'})).data;assert.equal(candidates.filter(row=>row.call_id===call).length,2);
 assert.ok(candidates.every(row=>row.enrollment_key));
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,call_outcome,product_type,carrier_name,call_start) VALUES($1,$2,$3,'incomplete','MA','UnitedHealthcare','2026-10-20')`,[id(60),tenant,agent]);
 assert.ok(!(await db.rpc('conversely_week_candidates',{p_week:'2026-10-19'})).data.some(row=>row.call_id===id(60)));
});
test('IX receives enrollment metadata and does not deliver a queued call without an intake',async()=>{
 const received=[];
 const env={IX_UPLOAD_ENABLED:'true',TWILIO_ACCOUNT_SID:'ACfixture',TWILIO_AUTH_TOKEN:'test'};
 const integration=createIxIntegration(db,{env,ixClient:{available:true,createUpload:async args=>{received.push(args);return {url:'https://bucket.s3.amazonaws.com/audio'};},confirmUpload:async()=>({receiptId:'receipt'})},fetchImpl:async(url,options)=>url.endsWith('.json')?Response.json({sid:'REfixture',account_sid:'ACfixture',call_sid:'CAfixture',channels:2}):options.method==='PUT'?new Response(null,{status:200}):new Response(new Uint8Array([1,2]))});
 await createComplianceWorker(db,{env,...integration,log:()=>{}})({schedule:false});assert.equal(received.length,2);
 assert.equal(received[0].metadata.ContractID,'H1234');assert.equal(received[0].metadata.CarrierName,'UnitedHealthcare');assert.ok(received[0].metadata.SubmissionDate);
 await query(`INSERT INTO ix_uploads(tenant_id,call_id,twilio_recording_sid,enrollment_key,confirmation_code) VALUES($1,$2,'REfixture',$3,'ORPHAN')`,[tenant,call,id(99)]);
 await createComplianceWorker(db,{env,...integration,log:()=>{}})({schedule:false});assert.equal(received.length,2);
});
test('browser roles cannot read PII envelopes or invoke intake writes and webhook leases',async()=>{
 await pg.exec('SET ROLE authenticated');
 try{
  await assert.rejects(()=>query('SELECT * FROM enrollment_intakes'),/permission denied/);
  await assert.rejects(()=>query('SELECT * FROM ghl_enrollment_deliveries'),/permission denied/);
  await assert.rejects(()=>query(`SELECT claim_compliance_upload('ghl')`),/permission denied/);
  await assert.rejects(()=>query(`SELECT save_enrollment_intake(NULL,NULL,NULL,NULL,'{}','Other','{}')`),/permission denied/);
 }finally{await pg.exec('RESET ROLE');}
});

test('concurrent GHL claims cannot send a newer edit before its previous revision finishes',async()=>{
 await pg.exec('BEGIN');
 try{
  const response=await handler()(req(valid({firstName:'Revision'})));const {id:versioned}=await response.json();
  assert.equal(response.status,200);
  assert.equal((await handler()(req(valid({firstName:'New Revision'}),{id:versioned}))).status,200);
  const [first]=(await db.rpc('claim_compliance_upload',{p_provider:'ghl'})).data;assert.ok(first);
  const claimed=await query('SELECT intake_id FROM ghl_enrollment_deliveries WHERE id=$1',[first.id]);assert.equal(claimed[0].intake_id,versioned);
  assert.equal((await db.rpc('claim_compliance_upload',{p_provider:'ghl'})).data.length,0,'newer revision stays unclaimed during the older lease');
  await db.rpc('finish_compliance_upload',{p_provider:'ghl',p_id:first.id,p_token:first.lease_token,p_success:true});
  const [second]=(await db.rpc('claim_compliance_upload',{p_provider:'ghl'})).data;assert.ok(second);assert.notEqual(first.id,second.id);
 }finally{await pg.exec('ROLLBACK');}
});
test('UHC requirements use the intake carrier even when legacy call carrier metadata disagrees',async()=>{
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,contact_id,call_outcome,carrier_name,product_type) VALUES($1,$2,$3,$4,'incomplete','UnitedHealthcare','MA')`,[id(61),tenant,agent,contact]);
 const response=await handler()(new Request(`https://app.test/api/enrollment-intakes?call_id=${id(61)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:valid({newCarrier:'Aetna',sunfireCode:''})})}));assert.equal(response.status,200);
 await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[id(61)]);
 assert.equal((await query('SELECT * FROM ix_uploads WHERE call_id=$1',[id(61)])).length,0);
});
