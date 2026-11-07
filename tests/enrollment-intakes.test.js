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
import {createIxIntegration,dailySummaries,ixCallAttribution,ixMetadata} from '../integrations/ixUploads.js';
import {createComplianceUploadsHandler} from '../netlify/functions/compliance-uploads.js';
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
 CREATE TABLE inbound_calls(id uuid,tenant_id uuid,lead_source_id uuid);
 CREATE TABLE lead_sources(id uuid,tenant_id uuid,name text);
 CREATE TABLE paragon_billing_facts(inbound_call_id uuid,tenant_id uuid,amount_due numeric,finalized_at timestamptz);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
 CREATE TABLE compliance_scorecards(id uuid,tenant_id uuid,call_id uuid,overall_score numeric,is_thread_composite boolean);
 CREATE TABLE recording_ingestion(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,call_record_id uuid,recording_sid text,account_sid text,callback_call_sid text,recording_channels smallint,copy_status text DEFAULT 'stored',provider_status text,recording_duration_seconds integer,first_seen_at timestamptz DEFAULT now());
 INSERT INTO tenants VALUES('${tenant}','org-a');
 INSERT INTO enrolled_agents VALUES('${agent}','${tenant}','user-a',true,'Mike Shiomos',NULL);
 INSERT INTO contacts(id,tenant_id,state,zip,current_carrier) VALUES('${contact}','${tenant}','NY','10001','Original Medicare'),('${household}','${tenant}','NY','10001','Aetna');
 INSERT INTO call_records VALUES('${call}','${tenant}','${agent}','${contact}','incomplete','Aetna','MA',NULL,'2026-10-20T15:00:00Z','Mike Shiomos','OLD','complete',NULL,'{}','inbound',now(),120);
 INSERT INTO recording_ingestion(tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status) VALUES('${tenant}','${call}','REbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','CAcccccccccccccccccccccccccccccccc',2,'completed');`);
 const pii=readFileSync(new URL('../supabase/migrations/022_pii_protection_phase1.sql',import.meta.url),'utf8');
 await pg.exec(pii.slice(pii.indexOf('CREATE OR REPLACE FUNCTION pii_vault.get_active_key()'),pii.indexOf('-- Blind-index HMAC key')));
 await pg.exec(readFileSync(new URL('../supabase/migrations/071_contacts_pii_json_null.sql',import.meta.url),'utf8'));
 for(const migration of ['123_compliance_uploads.sql','124_ix_uploads.sql','125_enrollment_intakes.sql','127_conversely_manual_runs.sql','128_sunfire_ix_api.sql','132_ix_test_enrollment_safeguards.sql'])await pg.exec(readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
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
test('IX sends Type A metadata and does not deliver a queued call without an intake',async()=>{
 const received=[];
 const env={IX_ENV:'production',IX_UPLOAD_ENABLED:'true',TWILIO_ACCOUNT_SID:'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',TWILIO_AUTH_TOKEN:'test'};
 const integration=createIxIntegration(db,{env,ixClient:{environment:'production',available:true,register:async args=>{received.push(args);return {callRecordingId:id(88),recordingUploads:args.callMetadata.recordings.map(({filename})=>({filename,presignedUrl:'https://bucket.s3.amazonaws.com/audio',expiresAt:'2099-01-01T00:00:00Z'}))};},finalize:async()=>({status:'finalized'})},fetchImpl:async(url,options)=>url.endsWith('.json')?Response.json({sid:'REbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',account_sid:'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',call_sid:'CAcccccccccccccccccccccccccccccccc',channels:2,start_time:'2026-10-20T15:00:00Z',duration:'120'}):options.method==='PUT'?new Response(null,{status:200}):new Response(new Uint8Array([1,2]))});
 await createComplianceWorker(db,{env,...integration,log:()=>{}})({schedule:false});assert.equal(received.length,2);
 assert.equal(received[0].sunfireEnrollmentCode,'SF-123');assert.deepEqual(Object.keys(received[0]).sort(),['callMetadata','sunfireEnrollmentCode']);assert.equal(received[0].callMetadata.recordings.length,1);assert.equal(received[0].callMetadata.teamName,'New Gen Health Solutions');
 await query(`INSERT INTO ix_uploads(tenant_id,call_id,twilio_recording_sid,enrollment_key,confirmation_code) VALUES($1,$2,'REbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',$3,'ORPHAN')`,[tenant,call,id(99)]);
 await createComplianceWorker(db,{env,...integration,log:()=>{}})({schedule:false});assert.equal(received.length,2);
});
test('browser roles cannot read PII envelopes or invoke intake writes and webhook leases',async()=>{
 await pg.exec('SET ROLE authenticated');
 try{
  await assert.rejects(()=>query('SELECT * FROM enrollment_intakes'),/permission denied/);
  await assert.rejects(()=>query('SELECT * FROM ghl_enrollment_deliveries'),/permission denied/);
  await assert.rejects(()=>query(`SELECT claim_compliance_upload('ghl')`),/permission denied/);
  await assert.rejects(()=>query('SELECT claim_ix_upload()'),/permission denied/);
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

const dylanAgent=id(70),dylanCall=id(71);
const dylanAuth={userId:'user-dylan',orgId:'org-a',tokenPayload:{org_role:'org:member'}};
const mikeAdminAuth={userId:'user-a',orgId:'org-a',tokenPayload:{public_metadata:{isAdmin:true}}};
async function withDylanCall(work){
 await pg.exec('BEGIN');
 try{
  await query(`INSERT INTO enrolled_agents VALUES($1,$2,'user-dylan',true,'Dylan Maria',NULL)`,[dylanAgent,tenant]);
  await query(`INSERT INTO call_records(id,tenant_id,agent_id,contact_id,call_outcome,product_type,agent_name) VALUES($1,$2,$3,$4,'incomplete','MA','Dylan Maria')`,[dylanCall,tenant,dylanAgent,contact]);
  await work();
 }finally{await pg.exec('ROLLBACK');}
}
const intakeRequest=(method='GET',body=null,extra='')=>new Request(`https://app.test/api/enrollment-intakes?call_id=${dylanCall}${extra}`,method==='GET'?undefined:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
for(const [label,identity] of [['agent-own',dylanAuth],['admin-other',mikeAdminAuth],['global-admin-without-active-org',{...mikeAdminAuth,orgId:null}]])test(`${label} can open, search plans, create and edit intakes while retaining the call's writing agent`,()=>withDylanCall(async()=>{
 const api=handler({authenticate:async()=>identity});
 let response=await api(intakeRequest());assert.equal(response.status,200);const initial=await response.json();assert.equal(initial.prefill.aor,'Dylan Maria');
 assert.equal((await api(intakeRequest('GET',null,'&plans=1&state=NY&carrier=Aetna'))).status,200);
 response=await api(intakeRequest('POST',{data:valid({aor:initial.prefill.aor})}));assert.equal(response.status,200);const intake=(await response.json()).id;
 response=await api(intakeRequest('POST',{id:intake,data:valid({aor:'Dylan Maria',planName:'Updated by authorized user'})}));assert.equal(response.status,200);
 const [saved]=await query('SELECT * FROM enrollment_intakes WHERE id=$1',[intake]);assert.equal(saved.data.aor,'Dylan Maria');assert.equal(saved.data.planName,'Updated by authorized user');
 assert.equal((await query('SELECT agent_id FROM follow_ups WHERE id=$1',[saved.follow_up_id]))[0].agent_id,'dylan_maria');
 const [ghl]=await query(`SELECT decrypt_pii_value(payload_encrypted)::jsonb AS payload FROM ghl_enrollment_deliveries WHERE intake_id=$1 ORDER BY revision DESC LIMIT 1`,[intake]);assert.equal(ghl.payload.aor,'Dylan Maria');assert.equal(ghl.payload.assignedUserId,'ybc6Z1qfF5PgD1k0DzOo');
 assert.equal((await query('SELECT agent_id FROM call_records WHERE id=$1',[dylanCall]))[0].agent_id,dylanAgent,'admin editing never changes call ownership');
 assert.equal((await (await api(intakeRequest())).json()).intakes[0].data.planName,'Updated by authorized user');
}));
test('non-admin Mike remains denied on Dylan calls, even with forged body or unsafe metadata admin fields',()=>withDylanCall(async()=>{
 for(const identity of [{userId:'user-a',orgId:'org-a'},{userId:'user-a',orgId:'org-a',tokenPayload:{unsafe_metadata:{role:'admin',isAdmin:true}}}]){
  const api=handler({authenticate:async()=>identity});
  assert.equal((await api(intakeRequest())).status,403);
  assert.equal((await api(intakeRequest('GET',null,'&plans=1&state=NY&carrier=Aetna'))).status,403);
  assert.equal((await api(intakeRequest('POST',{role:'admin',isAdmin:true,data:valid({aor:'Dylan Maria'})}))).status,403);
 }
 assert.equal((await query('SELECT * FROM enrollment_intakes WHERE call_id=$1',[dylanCall])).length,0);
}));
test('admin claims require the matching organization and support Clerk role and compact owner claims',()=>withDylanCall(async()=>{
 for(const tokenPayload of [{org_role:'org:admin'},{public_metadata:{role:'admin'}},{o:{id:'org-a',rol:'owner'}}]){
  const api=handler({authenticate:async()=>({userId:'user-a',orgId:tokenPayload.o?null:'org-a',tokenPayload})});assert.equal((await api(intakeRequest())).status,200);
 }
 for(const identity of [{...mikeAdminAuth,orgId:'org-b'},{userId:'user-a',orgId:null,tokenPayload:{org_role:'org:admin'}},{userId:'unknown-admin',orgId:null,tokenPayload:{public_metadata:{isAdmin:true}}}])assert.equal((await handler({authenticate:async()=>identity})(intakeRequest())).status,403);
 await query(`INSERT INTO tenants VALUES($1,'org-b')`,[id(73)]);
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,call_outcome,product_type) VALUES($1,$2,$3,'incomplete','MA')`,[id(74),id(73),id(75)]);
 assert.equal((await handler({authenticate:async()=>mikeAdminAuth})(new Request(`https://app.test/api/enrollment-intakes?call_id=${id(74)}`))).status,403);
}));

const ixEnv={IX_ENV:'production',IX_UPLOAD_ENABLED:'true',IX_USERNAME:'ix-user',IX_PASSWORD:'ix-password',TWILIO_ACCOUNT_SID:'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',TWILIO_AUTH_TOKEN:'test'};
const ixFetch=(status,extra={})=>async(url,options)=>{
 if(url.endsWith('/authenticate'))return Response.json({username:'ix-user',token:'private-token',expiresIn:100});
 if(url.endsWith('.json'))return Response.json({sid:'REbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',account_sid:'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',call_sid:'CAcccccccccccccccccccccccccccccccc',channels:2,start_time:'2026-10-20T15:00:00Z',duration:120});
 if(url.endsWith('/internalenrollment'))return Response.json({message:'Provider says ix-password private-token',...extra},{status});
 if(options?.method==='PUT')return new Response(null,{status:200});
 if(url.endsWith('/finalize'))return Response.json({status:'finalized'});
 return new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'audio/mpeg'}});
};
async function queuedIntake(code){
 await query('UPDATE ix_uploads SET retryable=false');
 const response=await handler()(req(valid({sunfireCode:code})));assert.equal(response.status,200);return (await response.json()).id;
}
for(const [http,status,error,retryable] of [[404,'needs_attention','invalid_sunfire_code',false],[409,'duplicate_on_sunfire','duplicate_on_sunfire',false],[400,'failed','ix_http_400',false],[403,'failed','ix_http_403',false],[500,'pending','ix_http_500',true]]){
 test(`IX worker persists register HTTP ${http} outcome, admin status and code remediation`,async()=>{
  await pg.exec('BEGIN');try{
   const intake=await queuedIntake(`HTTP-${http}`),fetchImpl=ixFetch(http),logs=[];
   const integration=createIxIntegration(db,{env:ixEnv,fetchImpl});
   const tick=createComplianceWorker(db,{env:ixEnv,...integration,log:value=>logs.push(value)});
   await tick({schedule:false});
   let [row]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[intake]);
   assert.equal(row.status,status);assert.equal(row.last_error,error);assert.equal(row.retryable,retryable);assert.equal(row.attempts,1);
   assert.ok(row.provider_message.includes('[redacted]'));assert.ok(!JSON.stringify(logs).includes('private-token'));assert.ok(!JSON.stringify(logs).includes('Provider says'));
   const admin=createComplianceUploadsHandler({getDb:()=>db,authenticate:async()=>({userId:'user-a',orgId:'org-a',tokenPayload:{org_role:'org:admin'}})});
   const response=await admin(new Request('https://app.test/compliance-uploads'));assert.equal(response.status,200);
   const data=await response.json();assert.ok(data.failures.some(item=>item.id===row.id&&item.status===status));
   assert.ok(!JSON.stringify(data).includes('presignedUrl'));
   if(http===404){
    assert.ok(data.missing.some(item=>item.call_id===call));
    const correction=await handler()(req(valid({sunfireCode:'CORRECTED'}),{id:intake}));assert.equal(correction.status,200);
    [row]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[intake]);
    assert.equal(row.confirmation_code,'CORRECTED');assert.equal(row.status,'pending');assert.equal(row.attempts,0);assert.equal(row.retryable,true);assert.deepEqual(row.ix_state,{});
    assert.equal((await query('SELECT * FROM compliance_missing_codes WHERE call_id=$1',[call])).length,0);
   }else if(!retryable){
    await query("UPDATE ix_uploads SET next_attempt_at=now()-interval '1 hour' WHERE id=$1",[row.id]);
    await tick({schedule:false});assert.equal((await query('SELECT attempts FROM ix_uploads WHERE id=$1',[row.id]))[0].attempts,1);
   }
  }finally{await pg.exec('ROLLBACK');}
 });
}
test('IX retries stop after five attempts with exponential delays and token-checked finishes',async()=>{
 await pg.exec('BEGIN');try{
  const intake=await queuedIntake('RETRY-FIVE'),fetchImpl=ixFetch(503);
  const tick=createComplianceWorker(db,{env:ixEnv,...createIxIntegration(db,{env:ixEnv,fetchImpl}),log:()=>{}});
  for(let attempt=1;attempt<=5;attempt++){
   await query("UPDATE ix_uploads SET next_attempt_at=now()-interval '1 minute' WHERE enrollment_key=$1",[intake]);
   await tick({schedule:false});
   const [row]=await query('SELECT *,extract(epoch FROM(next_attempt_at-updated_at))::integer AS delay FROM ix_uploads WHERE enrollment_key=$1',[intake]);
   assert.equal(row.attempts,attempt);assert.equal(row.delay,60*2**(attempt-1));assert.equal(row.status,attempt===5?'failed':'pending');
   await db.rpc('finish_ix_upload',{p_id:row.id,p_token:id(999),p_outcome:'uploaded',p_error:null,p_message:null,p_receipt:{callRecordingId:id(88),status:'finalized'}});
  }
  await tick({schedule:false});assert.equal((await query('SELECT attempts FROM ix_uploads WHERE enrollment_key=$1',[intake]))[0].attempts,5);
 }finally{await pg.exec('ROLLBACK');}
});
test('IX worker resumes durable registration after finalize failure and records a real final receipt once',async()=>{
 await pg.exec('BEGIN');try{
  const intake=await queuedIntake('RESUME'),registrationId=id(888);let registers=0,puts=0,finalizes=0;
  const fetchImpl=async(url,options)=>{
   if(url.endsWith('/internalenrollment')){registers++;const payload=JSON.parse(options.body);return Response.json({callRecordingId:registrationId,recordingUploads:payload.callMetadata.recordings.map(({filename})=>({filename,presignedUrl:'https://bucket.s3.amazonaws.com/audio',expiresAt:'2099-01-01T00:00:00Z'}))});}
   if(options?.method==='PUT'){
    puts++;const [saved]=await query('SELECT ix_state FROM ix_uploads WHERE enrollment_key=$1',[intake]);assert.equal(saved.ix_state.callRecordingId,registrationId);return new Response(null,{status:200});
   }
   if(url.endsWith('/finalize')){finalizes++;return finalizes===1?Response.json({message:'try later'},{status:500}):Response.json({status:'already_finalized'});}
   return ixFetch(200)(url,options);
  };
  const tick=createComplianceWorker(db,{env:ixEnv,...createIxIntegration(db,{env:ixEnv,fetchImpl}),log:()=>{}});
  await tick({schedule:false});let [row]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[intake]);assert.equal(row.status,'pending');assert.equal(row.ix_state.uploadedFilenames.length,1,JSON.stringify({error:row.last_error,state:row.ix_state}));
  await query("UPDATE ix_uploads SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",[row.id]);
  await tick({schedule:false});[row]=await query('SELECT * FROM ix_uploads WHERE id=$1',[row.id]);
  assert.equal(row.status,'uploaded');assert.equal(row.ix_receipt_id,registrationId);assert.ok(row.finalized_at);assert.equal(row.finalize_receipt.status,'already_finalized');
  assert.equal(registers,1);assert.equal(puts,1);assert.equal(finalizes,2);
  await db.rpc('enqueue_compliance_uploads');await tick({schedule:false});assert.equal(registers,1);
  await db.rpc('finish_ix_upload',{p_id:row.id,p_token:id(999),p_outcome:'failed',p_error:'late_failure',p_message:null,p_receipt:null});
  assert.equal((await query('SELECT status FROM ix_uploads WHERE id=$1',[row.id]))[0].status,'uploaded');
 }finally{await pg.exec('ROLLBACK');}
});
test('IX expired URL attention is durable and registration is never repeated',async()=>{
 await pg.exec('BEGIN');try{
  const intake=await queuedIntake('EXPIRED'),fetchImpl=async(url,options)=>{
   if(url.endsWith('/internalenrollment')){const payload=JSON.parse(options.body);return Response.json({callRecordingId:id(888),recordingUploads:payload.callMetadata.recordings.map(({filename})=>({filename,presignedUrl:'https://bucket.s3.amazonaws.com/audio',expiresAt:'2000-01-01T00:00:00Z'}))});}
   if(options?.method==='PUT')assert.fail('expired URL must never upload');return ixFetch(200)(url,options);
  };
  await createComplianceWorker(db,{env:ixEnv,...createIxIntegration(db,{env:ixEnv,fetchImpl}),log:()=>{}})({schedule:false});
  const [row]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[intake]);assert.equal(row.status,'needs_attention');assert.equal(row.last_error,'upload_url_expired');assert.equal(row.ix_state.callRecordingId,id(888));
  await handler()(req(valid({sunfireCode:'CHANGED-AFTER-REGISTER'}),{id:intake}));
  assert.equal((await query('SELECT status FROM ix_uploads WHERE id=$1',[row.id]))[0].status,'needs_attention');
 }finally{await pg.exec('ROLLBACK');}
});
test('IX default off and missing credentials never consume attempts; daily summaries stay durable',async()=>{
 await pg.exec('BEGIN');try{
  const intake=await queuedIntake('DISABLED');
  for(const env of [{},{IX_UPLOAD_ENABLED:'true'}])await createComplianceWorker(db,{env,...createIxIntegration(db,{env}),log:()=>{}})({schedule:false});
  assert.equal((await query('SELECT attempts FROM ix_uploads WHERE enrollment_key=$1',[intake]))[0].attempts,0);
  const reportDay=(await query('SELECT day::text FROM compliance_reconciliation ORDER BY day LIMIT 1'))[0].day;
  const sent=[],opts={env:{RESEND_API_KEY:'mail-key',INTEGRATIONS_REPORT_FROM:'reports@example.test'},now:()=>Date.parse(`${reportDay}T17:00:00Z`)+86400000,
   send:async(url,body,headers)=>{sent.push({url,body:JSON.parse(body),headers});return {status:200};}};
  await dailySummaries(db,opts);await dailySummaries(db,opts);assert.equal(sent.length,1);assert.deepEqual(sent[0].body.to,['mike@newgenhealthsolutions.com']);assert.ok(sent[0].headers['Idempotency-Key']);
 }finally{await pg.exec('ROLLBACK');}
});

test('IX uses linked, tenant-scoped source and finalized per-call billing cost when known',async()=>{
 await pg.exec('BEGIN');try{
  await query(`INSERT INTO inbound_calls VALUES($1,$2,$3)`,[id(900),tenant,id(901)]);
  await query(`INSERT INTO lead_sources VALUES($1,$2,'Paragon Media')`,[id(901),tenant]);
  await query(`INSERT INTO paragon_billing_facts VALUES($1,$2,33,now())`,[id(900),tenant]);
  const sourceCall={tenant_id:tenant,metadata:{campaign_name:'Fall',lead_medium:'phone'}};
  const attributed=await ixCallAttribution(db,sourceCall,[{inbound_call_id:id(900)}]);
  const metadata=ixMetadata(attributed,[]);assert.equal(metadata.leadSource,'Paragon Media');assert.equal(metadata.leadCost,33);assert.equal(metadata.leadCampaign,'Fall');
  const foreign=await ixCallAttribution(db,{tenant_id:id(999)},[{inbound_call_id:id(900)}]);assert.equal(foreign.lead_source,undefined);assert.equal(foreign.lead_cost,undefined);
 }finally{await pg.exec('ROLLBACK');}
});

test('completed UHC intakes queue before recordings arrive and wait without consuming attempts',async()=>{
 await pg.exec('BEGIN');try{
  await query('UPDATE ix_uploads SET retryable=false');
  await query(`INSERT INTO call_records(id,tenant_id,agent_id,contact_id,call_outcome,carrier_name,product_type) VALUES($1,$2,$3,$4,'incomplete','UHC','MA')`,[id(910),tenant,agent,contact]);
  const response=await handler()(new Request(`https://app.test/api/enrollment-intakes?call_id=${id(910)}`,{method:'POST',body:JSON.stringify({data:valid({sunfireCode:'WAIT-RECORDING'})})}));assert.equal(response.status,200);
  await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[id(910)]);
  let [row]=await query('SELECT * FROM ix_uploads WHERE call_id=$1',[id(910)]);assert.equal(row.twilio_recording_sid,'pending');
  assert.equal((await db.rpc('claim_ix_upload',{p_environment:'production'})).data.length,0);
  await query(`INSERT INTO recording_ingestion(tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,provider_status) VALUES($1,$2,'REnew','ACnew','CAnew','completed')`,[tenant,id(910)]);
  [row]=await query('SELECT * FROM ix_uploads WHERE call_id=$1',[id(910)]);assert.equal(row.twilio_recording_sid,'REnew');assert.equal(row.attempts,0);
  assert.equal((await db.rpc('claim_ix_upload',{p_environment:'production'})).data[0].id,row.id);
 }finally{await pg.exec('ROLLBACK');}
});

async function safeguardFixture(work){
 return withDylanCall(async()=>{
  await query('UPDATE ix_uploads SET retryable=false');
  const api=handler({authenticate:async()=>mikeAdminAuth});
  const create=async(testEnrollment,sunfireCode)=>{
   const response=await api(intakeRequest('POST',{data:valid({testEnrollment,sunfireCode,aor:'Dylan Maria'})}));
   assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return (await response.json()).id;
  };
  await query(`INSERT INTO recording_ingestion(tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status) VALUES($1,$2,'REbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','CAcccccccccccccccccccccccccccccccc',2,'completed')`,[tenant,dylanCall]);
  await work({api,create});
 });
}
const adminUploads=(auth=mikeAdminAuth,env={IX_ENV:'test'})=>createComplianceUploadsHandler({getDb:()=>db,authenticate:async()=>auth,env});
const retryRequest=id=>new Request('https://app.test/compliance-uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'retry_ix_upload',id})});

test('test environment sends only test intakes; real rows preserve checkpoints, attempts and scheduling until production',()=>safeguardFixture(async({create})=>{
 const real=await create(false,'SAFE-REAL'),sandbox=await create(true,'SAFE-TEST');
 await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[dylanCall]);
 await query(`UPDATE ix_uploads SET ix_state='{"sentinel":"untouched"}',next_attempt_at=now()-interval '1 minute' WHERE enrollment_key=$1`,[real]);
 const [before]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[real]);
 const registrations=[],testEnv={...ixEnv,IX_ENV:'test'};
 const fetchImpl=async(url,options)=>{
  if(url.endsWith('/internalenrollment')){
   const payload=JSON.parse(options.body);registrations.push(payload.sunfireEnrollmentCode);
   return Response.json({callRecordingId:id(922),recordingUploads:payload.callMetadata.recordings.map(({filename})=>({filename,presignedUrl:'https://bucket.s3.amazonaws.com/audio',expiresAt:'2099-01-01T00:00:00Z'}))});
  }
  return ixFetch(200)(url,options);
 };
 await createComplianceWorker(db,{env:testEnv,...createIxIntegration(db,{env:testEnv,fetchImpl}),log:()=>{}})({schedule:false});
 assert.deepEqual(registrations,['SAFE-TEST']);
 const [waiting]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[real]);
 assert.deepEqual(waiting,{...before,status:'waiting_for_production'});
 assert.equal((await query('SELECT status FROM ix_uploads WHERE enrollment_key=$1',[sandbox]))[0].status,'uploaded');
 const [production]=await query(`SELECT * FROM claim_ix_upload('production')`);
 assert.equal(production.enrollment_key,real);assert.equal(production.attempts,1);assert.deepEqual(production.ix_state,before.ix_state);
}));

test('production skips test rows without sending audio or consuming attempts',()=>safeguardFixture(async({create})=>{
 const sandbox=await create(true,'PRODUCTION-SKIP');
 await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[dylanCall]);
 await createComplianceWorker(db,{env:ixEnv,...createIxIntegration(db,{env:ixEnv,fetchImpl:()=>assert.fail('test intake must not reach provider')}),log:()=>{}})({schedule:false});
 const [row]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[sandbox]);
 assert.equal(row.status,'skipped_test_enrollment');assert.equal(row.attempts,0);assert.deepEqual(row.ix_state,{});
 const response=await adminUploads(mikeAdminAuth,{IX_ENV:'production'})(new Request('https://app.test/compliance-uploads'));
 const data=await response.json();assert.equal(data.ix_environment,'PRODUCTION');assert.ok(data.failures.some(r=>r.id===row.id&&r.is_test_enrollment));
 for(const type of ['test','real']){
  const filtered=await (await adminUploads()(new Request(`https://app.test/compliance-uploads?enrollment_type=${type}`))).json();
  assert.ok(filtered.failures.every(r=>Boolean(r.is_test_enrollment)===(type==='test')));
 }
 assert.equal((await adminUploads()(new Request('https://app.test/compliance-uploads?enrollment_type=invalid'))).status,400);
}));

test('test enrollments create no GHL jobs, are excluded from Conversely candidates and reporting; mixed households retain real enrollments',()=>safeguardFixture(async({create})=>{
 const sandbox=await create(true,'NO-EXTERNAL');
 await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[dylanCall]);
 assert.equal((await query('SELECT * FROM ghl_enrollment_deliveries WHERE intake_id=$1',[sandbox])).length,0);
 assert.equal((await query('SELECT * FROM compliance_reconciliation WHERE tenant_id=$1',[tenant])).reduce((n,r)=>n+Number(r.enrollments),0),2,'only the existing real household counts');
 assert.equal((await query(`SELECT * FROM conversely_week_candidates('2026-10-19') WHERE enrollment_key=$1`,[sandbox])).length,0);
 assert.equal((await query('SELECT is_test_enrollment FROM call_records WHERE id=$1',[dylanCall]))[0].is_test_enrollment,true);
 const real=await create(false,'MIXED-REAL');
 assert.equal((await query('SELECT is_test_enrollment FROM call_records WHERE id=$1',[dylanCall]))[0].is_test_enrollment,false);
 assert.equal((await query(`SELECT * FROM conversely_week_candidates('2026-10-19') WHERE enrollment_key=$1`,[real])).length,0,'fixture call has no call_start');
 // Even a pre-existing/manual GHL or Conversely queue row cannot bypass the claim guard.
 await query(`INSERT INTO ghl_enrollment_deliveries(tenant_id,call_id,twilio_recording_sid,enrollment_key,intake_id,payload_encrypted) VALUES($1,$2,'ghl','test-legacy',$3,'{}')`,[tenant,dylanCall,sandbox]);
 await query(`INSERT INTO conversely_submissions(tenant_id,call_id,twilio_recording_sid,enrollment_key) VALUES($1,$2,'REtest',$3)`,[tenant,dylanCall,sandbox]);
 await query(`UPDATE ghl_enrollment_deliveries SET attempts=5 WHERE intake_id<>$1`,[sandbox]);
 assert.equal((await query(`SELECT * FROM claim_compliance_upload('ghl')`)).length,0);
 assert.equal((await query(`SELECT * FROM claim_compliance_upload('conversely') WHERE enrollment_key=$1`,[sandbox])).length,0);
}));

test('only admins can set or change the test flag, and the checkbox defaults unchecked',()=>safeguardFixture(async({api,create})=>{
 const member=handler({authenticate:async()=>dylanAuth});
 const initial=await (await member(intakeRequest())).json();assert.equal(initial.admin,false);assert.equal(initial.prefill.testEnrollment,false);
 assert.equal((await member(intakeRequest('POST',{data:valid({testEnrollment:true,aor:'Dylan Maria'})}))).status,403);
 const sandbox=await create(true,'ADMIN-ONLY');
 assert.equal((await member(intakeRequest('POST',{id:sandbox,data:valid({testEnrollment:false,aor:'Dylan Maria'})}))).status,403);
 assert.equal((await (await api(intakeRequest())).json()).admin,true);
}));

test('admin retry clears unfinalized registration and targets and records actor/time; rejects non-admin, foreign tenant and finalized retries',()=>safeguardFixture(async({create})=>{
 const sandbox=await create(true,'RETRY-SANDBOX');
 await query(`UPDATE call_records SET call_outcome='enrolled' WHERE id=$1`,[dylanCall]);
 const [row]=await query('SELECT * FROM ix_uploads WHERE enrollment_key=$1',[sandbox]);
 for(const status of ['needs_attention','failed']){
  await query(`UPDATE ix_uploads SET status=$2,attempts=5,retryable=false,last_error='upload_url_expired',ix_state='{"callRecordingId":"old","recordingUploads":[{"presignedUrl":"secret"}],"uploadedFilenames":["a.mp3"]}' WHERE id=$1`,[row.id,status]);
  assert.equal((await adminUploads(dylanAuth)(retryRequest(row.id))).status,403);
  assert.equal((await adminUploads()(retryRequest(row.id))).status,200);
  const [reset]=await query('SELECT * FROM ix_uploads WHERE id=$1',[row.id]);
  assert.equal(reset.status,'pending');assert.equal(reset.attempts,0);assert.equal(reset.retryable,true);assert.deepEqual(reset.ix_state,{});assert.equal(reset.last_error,null);assert.equal(reset.lease_token,null);
 }
 const audit=await query('SELECT * FROM ix_upload_retries WHERE upload_id=$1',[row.id]);assert.equal(audit.length,2);assert.ok(audit.every(r=>r.actor==='user-a'&&r.retried_at));
 await query(`UPDATE ix_uploads SET status='failed',finalized_at=now(),finalize_receipt='{"status":"finalized"}' WHERE id=$1`,[row.id]);
 assert.equal((await adminUploads()(retryRequest(row.id))).status,409);
 assert.equal((await query(`SELECT retry_ix_upload($1,$2,'actor') AS ok`,[row.id,id(999)]))[0].ok,false);
 assert.equal((await adminUploads(dylanAuth)(new Request('https://app.test/compliance-uploads'))).status,403);
 for(const operation of [()=>query(`SELECT retry_ix_upload($1,$2,'forged')`,[row.id,tenant]),()=>query('SELECT * FROM ix_upload_retries')]){
  await pg.exec('SAVEPOINT denied_retry; SET ROLE authenticated');
  await assert.rejects(operation,/permission denied/);
  await pg.exec('ROLLBACK TO SAVEPOINT denied_retry; RELEASE SAVEPOINT denied_retry');
 }
}));
