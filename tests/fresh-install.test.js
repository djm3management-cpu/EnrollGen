import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshDatabase,bootstrapRoot} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {snapshotCatalog,catalogDifferences} from '../scripts/lib/database-catalog.js';
import {assertNoDeploymentIdentity,dumpApplicationData} from '../scripts/lib/bootstrap-identity.js';
import {bootstrapEntries,applyBootstrap} from '../scripts/bootstrap-database.mjs';
import {explicitConnection,checkDrift} from '../scripts/check-database-drift.mjs';
import {statements} from '../scripts/lib/bootstrap-sql.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import {featureHeaders,FEATURE_NAMES} from '../telephony/src/lib/deploymentFeatures.js';
import {createEnrollmentIntakesHandler} from '../netlify/functions/enrollment-intakes.js';
import {deliverEnrollmentWebhooks} from '../integrations/enrollmentWebhook.js';
import {emptyIntake,normalizeIntake} from '../src/lib/enrollmentIntake.js';
import rosterSource from './fixtures/deployment-roster.json' with {type:'json'};
import profileSource from '../docs/pilot-profile.example.json' with {type:'json'};
const expected=JSON.parse(readFileSync(new URL('catalog.expected.json',bootstrapRoot)));
let pg;
const q=(sql,args=[])=>pg.query(sql,args).then(r=>r.rows);
const id=n=>`e0040000-0000-4000-8000-${String(n).padStart(12,'0')}`;
before(async()=>{pg=await freshDatabase();});
after(async()=>{if(pg)await pg.close();});

test('manifest is checksummed, skips 143, preserves complete 150–156 and orders required checkpoints',()=>{
 const entries=bootstrapEntries(),files=entries.map(e=>e.file);
 assert.ok(!files.includes('sql/m143.sql'));
 assert.ok(files.indexOf('sql/base-transcripts.sql')<files.indexOf('sql/m002.sql'));
 assert.ok(files.indexOf('sql/seed002.sql')<files.indexOf('sql/m075.sql'));
 assert.ok(files.indexOf('sql/patch074.sql')>files.indexOf('sql/m074.sql'));
 assert.ok(files.indexOf('sql/m156.sql')>files.indexOf('sql/m151.sql'));
 for(let n=150;n<=156;n++){
  const actual=entries.find(e=>e.file===`sql/m${n}.sql`);
  const source=readFileSync(new URL('../supabase/migrations/'+['150_deployment_feature_switches.sql','151_deployment_profile_roster.sql','152_protected_deployment_identity.sql','153_scoped_table_and_storage_access.sql','154_scoped_browser_routines.sql','155_owned_workspace_writes.sql','156_scoped_service_call_views.sql'][n-150],import.meta.url),'utf8');
  assert.deepEqual(statements(actual.sql),statements(source));
 }
});
test('two independent EMPTY builds match the committed catalog, including all view bodies, grants and defaults',async()=>{
 assert.deepEqual(catalogDifferences(expected,await snapshotCatalog(pg)),[]);
 const second=await freshDatabase();try{assert.deepEqual(catalogDifferences(expected,await snapshotCatalog(second)),[]);}finally{await second.close();}
 const [original]=await q("SELECT count(*)::int n,sum(points_possible)::int points FROM scoring_template_items WHERE template_id='00000000-0000-0000-0000-000000000115'");
 assert.deepEqual(original,{n:138,points:255});
 const [active]=await q('SELECT count(*)::int n,sum(i.points_possible)::int points FROM scoring_template_items i JOIN scoring_templates t ON t.id=i.template_id WHERE t.is_active AND t.product_type=\'MA\'');
 assert.deepEqual(active,{n:135,points:251});
 assert.equal((await q('SELECT enabled FROM compliance_runtime_control'))[0].enabled,false);
 for(const table of ['tenants','tenant_agents','enrolled_agents','lead_sources','availability_consumers','vendor_controls'])assert.equal((await q('SELECT count(*)::int n FROM '+table))[0].n,0,table);
});
test('bootstrap SQL, committed catalog and fresh logical application dump have no forbidden identity or hook',async()=>{
 for(const entry of bootstrapEntries())assertNoDeploymentIdentity(entry.sql,entry.file);
 assertNoDeploymentIdentity(readFileSync(new URL('manifest.json',bootstrapRoot),'utf8'),'manifest');
 assertNoDeploymentIdentity(JSON.stringify(expected),'catalog');
 assertNoDeploymentIdentity(await dumpApplicationData(pg),'fresh application dump');
});
test('bootstrap stops at the first failed statement and refuses a nonempty application schema',async()=>{
 let calls=0;
 await assert.rejects(applyBootstrap({query:async()=>{calls++;throw Error('synthetic failure');}}),/Bootstrap stopped: sql\/platform.sql, statement 1/);
 assert.equal(calls,1);
 await assert.rejects(applyBootstrap(pg,{platformStandins:true}),/Bootstrap stopped: sql\/platform.sql, statement 1/);
});
test('drift needs an explicit connection, uses read-only transactions and reports safe differences without writes',async()=>{
 for(const args of [[],['--connection'],['--connection',''],['--connection','not-a-url'],['--connection','postgresql://localhost/postgres?options=override']])assert.throws(()=>explicitConnection(args));
 assert.equal(explicitConnection(['--connection','postgresql://localhost:54322/postgres']),'postgresql://localhost:54322/postgres');
 assert.deepEqual(await checkDrift(pg),[]);
 await pg.exec('CREATE TABLE public.synthetic_catalog_drift(id integer)');
 try{const changes=await checkDrift(pg);assert.ok(changes.some(d=>d.name==='synthetic_catalog_drift'));assert.equal((await q('SELECT count(*)::int n FROM synthetic_catalog_drift'))[0].n,0);}finally{await pg.exec('DROP TABLE public.synthetic_catalog_drift');}
 const queries=[];
 await snapshotCatalog({query:async sql=>{queries.push(sql);return {rows:[]};}});
 assert.equal(queries[0],'BEGIN READ ONLY');assert.equal(queries.at(-1),'ROLLBACK');
 for(const sql of queries.slice(2,-1))assert.match(sql.trim(),/^SELECT /);
});
test('all application owners have closed global and schema defaults, including inherited platform grants',async()=>{
 await pg.exec('CREATE TABLE public.synthetic_future_object(id integer); CREATE FUNCTION public.synthetic_future_routine() RETURNS integer LANGUAGE sql AS $$SELECT 1$$');
 try{for(const role of ['anon','authenticated']){
  for(const op of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await q('SELECT has_table_privilege($1,$2,$3) allowed',[role,'synthetic_future_object',op]))[0].allowed,false);
  assert.equal((await q('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,'synthetic_future_routine()']))[0].allowed,false);
 }}finally{await pg.exec('DROP TABLE public.synthetic_future_object; DROP FUNCTION public.synthetic_future_routine()');}
});
test('platform stand-ins preserve BYPASSRLS, private storage, real vector, real encryption and fresh Vault key isolation',async()=>{
 assert.equal((await q("SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'"))[0].rolbypassrls,true);
 for(const table of ['objects','buckets'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await q('SELECT has_table_privilege($1,$2,$3) ok',['service_role','storage.'+table,privilege]))[0].ok,true);
 assert.equal((await q("SELECT count(*)::int n FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='authenticator'"))[0].n,3);
 assert.deepEqual((await q('SELECT id,public FROM storage.buckets ORDER BY id')),[{id:'call-recordings',public:false},{id:'message-media',public:false}]);
 assert.equal((await q("SELECT (encrypt_pii_value('synthetic') ?& ARRAY['c','k']) ok"))[0].ok,true);
 assert.equal((await q("SELECT '[1,0,0]'::extensions.vector OPERATOR(extensions.<=>) '[1,0,0]'::extensions.vector distance"))[0].distance,0);
 assert.equal((await q('SELECT count(*)::int n FROM pii_vault.encryption_keys WHERE is_active'))[0].n,1);
 await pg.exec('SET ROLE authenticated');
 try{await assert.rejects(q('SELECT * FROM vault.decrypted_secrets'),e=>e.code==='42501');await assert.rejects(q('SELECT * FROM pii_vault.encryption_keys'),e=>e.code==='42501');}
 finally{await pg.exec('RESET ROLE');}
});
test('actual operator provisioning + protected authority + service pipeline + HTTP intake + durable worker deliver only to an in-process test sink',async()=>{
 const savedEnv={...process.env},savedFetch=globalThis.fetch;
 const profile={...profileSource,tenantId:id(1),allowedHosts:['app.example.test','phone.example.test','sink.example.test'],appOrigin:'https://app.example.test',telephonyOrigin:'https://phone.example.test',ghl:{postCallUrl:'https://sink.example.test/post-call',enrollmentUrl:'https://sink.example.test/enrollment',locationId:'synthetic-location'}};
 const roster=rosterSource.map(a=>({...a,tenant_id:profile.tenantId}));
 const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),...Object.fromEntries(FEATURE_NAMES.map(n=>[n,'false']))};
 const sink=[];
 try{
  Object.assign(process.env,env);globalThis.fetch=async()=>{throw Error('Network transport forbidden in fresh-install acceptance');};
  await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);
  await pg.exec('SET ROLE service_role');
  const db=freshInstallClient(pg);
  assert.equal(await provisionDeployment(db,roster,env),12);
  for(const table of ['tenant_agents','enrolled_agents','availability_agent_subjects','recording_agent_subjects'])assert.equal((await q(`SELECT count(*)::int n FROM ${table} WHERE tenant_id=$1`,[profile.tenantId]))[0].n,12,table);
  assert.equal((await q("SELECT count(*)::int n FROM agent_availability WHERE available OR status<>'offline'"))[0].n,0);
  const members=await q('SELECT id,clerk_user_id,role FROM enrolled_agents ORDER BY clerk_user_id');
  assert.ok(members.every(m=>m.role==='agent'));
  // Protected service authority is separate from the roster role payload.
  await pg.exec('BEGIN');
  await q("INSERT INTO deployment_authorities(tenant_id,clerk_user_id,authority,team_agent_ids) VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)",[profile.tenantId,roster[0].clerk_user_id,roster[2].clerk_user_id,[members[1].id]]);
  await pg.exec('COMMIT');
  assert.equal((await q('SELECT authority FROM resolve_deployment_subject($1,$2)',[roster[0].clerk_user_id,profile.organizationId]))[0].authority,'admin');
  assert.equal((await q('SELECT authority FROM resolve_deployment_subject($1,$2)',[roster[2].clerk_user_id,profile.organizationId]))[0].authority,'manager');
  const [pipeline]=await q("SELECT save_opportunity_pipeline($1,$2,NULL,'Pilot default',NULL,$3) id",[profile.tenantId,roster[0].id,JSON.stringify([{id:id(20),name:'New',color:'#a78bfa'},{id:id(21),name:'Won',color:'#22c55e',is_won:true}])]);
  await q('UPDATE pipelines SET is_default=true WHERE id=$1',[pipeline.id]);
  assert.equal((await q('SELECT ensure_opportunities_pipeline($1,$2) id',[profile.tenantId,roster[0].id]))[0].id,pipeline.id);
  await q("INSERT INTO contacts(id,tenant_id,assigned_agent_id,first_name,last_name,phone) VALUES($1,$2,$3,'Synthetic','Applicant','+12125550101')",[id(30),profile.tenantId,roster[0].agent_slug]);
  await q("INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start,contact_id) VALUES($1,$2,$3,$4,'inbound','sales','MA',now(),$5)",[id(31),profile.tenantId,members[0].id,roster[0].name,id(30)]);
  const deliver=database=>deliverEnrollmentWebhooks(database,{env,limit:1,send:async(url,body,headers)=>{assert.equal(url,profile.ghl.enrollmentUrl);sink.push({payload:JSON.parse(body),key:headers['Idempotency-Key']});return {status:204};}});
  const handler=createEnrollmentIntakesHandler({authenticate:async()=>({userId:roster[0].clerk_user_id,orgId:profile.organizationId}),getDb:()=>db,deliver,now:()=> '2026-11-14T12:00:00Z'});
  const data=normalizeIntake({...emptyIntake(roster[0].name,roster),writingAgentId:roster[0].id,firstName:'Synthetic',lastName:'Applicant',dob:'1955-02-28',phone:'2125550101',state:'NY',zip:'10001',mbi:'1ab2cd3ef45',prevCarrier:'Original Medicare',newCarrier:'Aetna',planName:'Synthetic Plan',enrollCode:'AEP',premium:'0',contractId:'H1234',planId:'001',sunfireCode:'SYNTHETIC-001',effectiveDate:'2027-01-01',sixtyDayDate:'2027-03-02'});
  const request=extra=>new Request(`https://app.example.test/api/enrollment-intakes?call_id=${id(31)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,...extra})});
  const first=await handler(request());assert.equal(first.status,200,JSON.stringify(await first.clone().json()));const intake=(await first.json()).id;
  assert.equal((await q('SELECT count(*)::int n FROM ghl_enrollment_deliveries'))[0].n,0);assert.equal(sink.length,0);
  env.GHL_ENABLED='true';process.env.GHL_ENABLED='true';
  await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);
  const response=await handler(request({id:intake}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(sink.length,1);assert.equal(sink[0].payload.firstName,'Synthetic');
  assert.equal((await q("SELECT count(*)::int n FROM ghl_enrollment_deliveries WHERE status='uploaded' AND attempts=1"))[0].n,1);
  await deliver(db);assert.equal(sink.length,1);
  const test=await handler(request({data:{...data,testEnrollment:true}}));assert.equal(test.status,200,JSON.stringify(await test.clone().json()));
  assert.equal((await q('SELECT count(*)::int n FROM ghl_enrollment_deliveries'))[0].n,1);assert.equal(sink.length,1);
  assert.equal((await q('SELECT count(*)::int n FROM ix_uploads'))[0].n,0);
  assert.equal((await q('SELECT count(*)::int n FROM conversely_submissions'))[0].n,0);
  const [stored]=await q('SELECT data,pii_encrypted,follow_up_id FROM enrollment_intakes WHERE id=$1',[intake]);
  assert.ok(stored.pii_encrypted.dob.c);assert.equal(stored.data.dob,undefined);assert.ok(stored.follow_up_id);
  await pg.exec('RESET ROLE');assertNoDeploymentIdentity(await dumpApplicationData(pg),'provisioned synthetic dump');
 }finally{
  globalThis.fetch=savedFetch;for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);await pg.exec('RESET ROLE');
 }
});
