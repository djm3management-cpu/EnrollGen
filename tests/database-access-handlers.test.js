import {createCallLogHandler} from '../netlify/functions/call-log.js';
import {createScriptSettingsHandler} from '../netlify/functions/script-settings.js';
import {createContactAssignmentHandler} from '../netlify/functions/contact-assignment.js';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessDatabase,fixtureRoster,T,U,uuid} from './helpers/databaseAccessSchema.js';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createVendorPauseHandler} from '../netlify/functions/vendor-pause.js';
import {createVendorRoutingHandler} from '../netlify/functions/vendor-routing.js';
import {createRtsIngestHandler} from '../netlify/functions/rts-ingest.js';
import {createTenantSettingsHandler} from '../netlify/functions/tenant-settings.js';
import {createPipelineSettingsHandler} from '../netlify/functions/pipeline-settings.js';
import {createTriggerKnowledgeUpdateHandler} from '../netlify/functions/trigger-knowledge-update.js';
import {resolveCallAccessIdentity} from '../netlify/functions/_evidenceAccess.js';
import {deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
const A=fixtureRoster[0],B=fixtureRoster[1];
let pg,db;
const query=(s,args=[])=>pg.query(s,args).then(r=>r.rows);
const auth=(subject=A.clerk_user_id,admin=false,orgId=deploymentProfile().organizationId)=>({userId:subject,orgId,tokenPayload:{org_role:admin?'org:admin':'org:member'}});
const request=body=>new Request('https://offline.example/api',{method:'POST',headers:{'Content-Type':'application/json','x-role':'admin','x-tenant-id':U},body:JSON.stringify(body)});
const factories=[createScriptSettingsHandler,createContactAssignmentHandler,createVendorPauseHandler,createVendorRoutingHandler,createRtsIngestHandler,createTenantSettingsHandler,createPipelineSettingsHandler];
const endpoint=(factory,identity)=>factory({authenticate:async()=>identity,getDb:()=>db});
before(async()=>{
 process.env.PARAGON_ENABLED='true';
 ({pg}=await buildAccessDatabase());db=evidenceDb(pg);
 await pg.exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agency_npn text,ADD COLUMN IF NOT EXISTS licensed_states jsonb,ADD COLUMN IF NOT EXISTS compliance_config jsonb;
 INSERT INTO vendor_controls(tenant_id) VALUES('${T}');`);
 await query("INSERT INTO tenants(id,name,clerk_org_id) VALUES($1,'Foreign','org_foreign')",[U]);
 await pg.exec('SET ROLE service_role');
});
after(async()=>{if(pg)await pg.close();delete process.env.PARAGON_ENABLED;});

test('privileged handlers reject unprovisioned, foreign-org and inactive signed-in subjects even with signed admin claims',async()=>{
 for(const identity of [auth('user_unprovisioned',true),auth(A.clerk_user_id,true,'org_foreign')])for(const factory of factories){
  const response=await endpoint(factory,identity)(request({action:'commit',tenant_id:T,actor:A.id,role:'admin',paused:true}));
  assert.equal(response.status,403,factory.name);
 }
 await pg.exec('RESET ROLE');await query('UPDATE enrolled_agents SET is_active=false WHERE clerk_user_id=$1',[A.clerk_user_id]);await pg.exec('SET ROLE service_role');
 for(const factory of factories)assert.equal((await endpoint(factory,auth(A.clerk_user_id,true))(request({role:'admin'}))).status,403,factory.name);
 await pg.exec('RESET ROLE');await query('UPDATE enrolled_agents SET is_active=true WHERE clerk_user_id=$1',[A.clerk_user_id]);await pg.exec('SET ROLE service_role');
});
test('ordinary agents cannot self-promote through tenant, actor or role payloads on any administrative handler',async()=>{
 for(const factory of [createScriptSettingsHandler,createContactAssignmentHandler,createVendorPauseHandler,createVendorRoutingHandler,createRtsIngestHandler,createTenantSettingsHandler,createPipelineSettingsHandler]) {
  const response=await endpoint(factory,auth())(request({action:'commit',tenant_id:U,actor:B.id,role:'admin',paused:true,agency_npn:'123'}));
  assert.equal(response.status,403,factory.name);
 }
});
test('vendor pause ignores submitted tenant/actor/role and records the verified active administrator',async()=>{
 const response=await endpoint(createVendorPauseHandler,auth(A.clerk_user_id,true))(request({paused:true,tenant_id:U,p_tenant_id:U,actor:B.clerk_user_id,role:'principal'}));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const rows=await query('SELECT tenant_id,changed_by FROM vendor_control_audit');
 assert.deepEqual(rows,[{tenant_id:T,changed_by:A.clerk_user_id}]);
});
test('settings whitelist ignores identity and organization fields; only the verified tenant changes',async()=>{
 const response=await endpoint(createTenantSettingsHandler,auth(A.clerk_user_id,true))(request({tenant_id:U,id:U,clerk_org_id:'org_evil',actor:B.id,role:'principal',agency_npn:'123456'}));
 assert.equal(response.status,200);
 assert.equal((await query('SELECT agency_npn FROM tenants WHERE id=$1',[T]))[0].agency_npn,'123456');
 assert.equal((await query('SELECT agency_npn FROM tenants WHERE id=$1',[U]))[0].agency_npn,null);
 assert.equal((await query('SELECT clerk_org_id FROM tenants WHERE id=$1',[T]))[0].clerk_org_id,deploymentProfile().organizationId);
});
test('pipeline service RPCs derive tenant and actor, and reject foreign pipeline/stage references',async()=>{
 const body={action:'save',name:'Reviewed Pipeline',stages:[{id:uuid(701),name:'New',color:'#a78bfa'}],tenant_id:U,actor:B.id,role:'principal'};
 const response=await endpoint(createPipelineSettingsHandler,auth(A.clerk_user_id,true))(request(body));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const {id}=await response.json();
 assert.equal((await query('SELECT tenant_id FROM pipelines WHERE id=$1',[id]))[0].tenant_id,T);
 assert.equal((await query('SELECT tenant_id FROM pipeline_stages WHERE id=$1',[uuid(701)]))[0].tenant_id,T);
 await query("INSERT INTO pipelines(id,tenant_id,name) VALUES($1,$2,'Foreign')",[uuid(702),U]);
 assert.equal((await endpoint(createPipelineSettingsHandler,auth(A.clerk_user_id,true))(request({...body,pipeline_id:uuid(702)}))).status,403);
});
test('knowledge trigger resolves protected membership and passes only that tenant to the privileged updater',async()=>{
 process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED='true';const invocations=[];
 try{
  const handler=identity=>createTriggerKnowledgeUpdateHandler({authenticate:async()=>identity,resolveIdentity:identity=>resolveCallAccessIdentity(db,identity),run:async input=>{invocations.push(input);return {checked:0};}});
  assert.equal((await handler(auth('user_unknown',true))(request({category:'test'}))).status,403);
  assert.equal((await handler(auth())(request({category:'test',role:'admin'}))).status,403);
  assert.equal((await handler(auth(A.clerk_user_id,true))(request({category:'test',tenantId:U,tenant_id:U,actor:B.id,role:'admin'}))).status,200);
  assert.equal(invocations.length,1);assert.equal(invocations[0].tenantId,T);
 }finally{delete process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED;}
});

test('contact reassignment is service-only and can target only another active provisioned agent in this deployment',async()=>{
 await query('INSERT INTO contacts(id,tenant_id,assigned_agent_id) VALUES($1,$2,$3)',[uuid(801),T,A.agent_slug]);
 const response=await endpoint(createContactAssignmentHandler,auth(A.clerk_user_id,true))(request({contact_id:uuid(801),assigned_agent_id:B.agent_slug,tenant_id:U,actor:B.clerk_user_id,role:'principal'}));
 assert.equal(response.status,200);
 assert.equal((await query('SELECT assigned_agent_id FROM contacts WHERE id=$1',[uuid(801)]))[0].assigned_agent_id,B.agent_slug);
 assert.equal((await endpoint(createContactAssignmentHandler,auth(A.clerk_user_id,true))(request({contact_id:uuid(801),assigned_agent_id:'foreign'}))).status,403);
});

test('script settings preserve the approved MA template and bind custom script writes to the verified tenant',async()=>{
 const handler=endpoint(createScriptSettingsHandler,auth(A.clerk_user_id,true));
 assert.equal((await handler(request({flow:'ma',sections:[]}))).status,400);
 const response=await handler(request({flow:'aca',sections:[{label:'Approved custom section'}],tenant_id:U,actor:B.id,role:'principal'}));
 assert.equal(response.status,200);
 assert.equal((await response.json()).template.tenant_id,T);
});

test('call-log filters by protected owner UUID before pagination, including when peer display names match',async()=>{
 const members=await query('SELECT id,clerk_user_id FROM enrolled_agents WHERE tenant_id=$1',[T]);
 for(const [n,roster] of [[910,A],[911,B]]){
  await query('INSERT INTO contacts(id,tenant_id,assigned_agent_id) VALUES($1,$2,$3)',[uuid(n+10),T,roster.agent_slug]);
  await query("INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start,contact_id) VALUES($1,$2,$3,'Same display label','inbound','sales','MA',now(),$4)",[uuid(n),T,members.find(m=>m.clerk_user_id===roster.clerk_user_id).id,uuid(n+10)]);
 }
 const get=identity=>endpoint(createCallLogHandler,identity)(new Request('https://offline.example/api/call-log?limit=1&agent=Same%20display%20label'));
 const member=await get(auth());assert.equal(member.status,200,JSON.stringify(await member.clone().json()));
 const body=await member.json();assert.equal(body.count,1);assert.deepEqual(body.rows.map(r=>r.call_record_id),[uuid(910)]);
 const admin=await get(auth(A.clerk_user_id,true));assert.equal(admin.status,200);assert.equal((await admin.json()).count,2);
});

test('RTS commit uses the verified active admin actor and tenant rather than submitted provisioning or role fields',async()=>{
 const payload={action:'commit',source_filename:'synthetic-rts.csv',file_hash:'b'.repeat(64),
  tenant_id:U,p_tenant_id:U,actor:B.id,uploaded_by:B.id,role:'agent',
  source_format:{source_type:'Ritter',row_count:1},agents_matched:[],
  carrier_mappings:[{raw_carrier_name:'Aetna',match_status:'NEW',suggested_name:'Aetna',approved:true}],
  rts_records:[{agent_raw_name:A.name,agent_npn:A.npn,carrier_raw_name:'Aetna',product_line:'MA',contract_status:'ACTIVE',states:[],certifications:[]}]};
 const response=await endpoint(createRtsIngestHandler,auth(A.clerk_user_id,true))(request(payload));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const row=(await query('SELECT tenant_id,uploaded_by FROM rts_ingestion_log WHERE file_hash=$1',[payload.file_hash]))[0];
 assert.deepEqual(row,{tenant_id:T,uploaded_by:A.id});
 assert.equal((await query('SELECT tenant_id FROM carrier_rts WHERE source_file_hash=$1',[payload.file_hash]))[0].tenant_id,T);
});

test('invalid RTS upload returns a clear error before roster, carrier, hash, model or ingestion work', async () => {
 const beforeCount=(await query('SELECT count(*)::int n FROM rts_ingestion_log'))[0].n;
 const operations=[];
 const guarded={...db,from(table){operations.push(table);if(['carrier_rts','rts_ingestion_log'].includes(table))assert.fail('rejected upload performed further work');return db.from(table);}};
 const handler=createRtsIngestHandler({authenticate:async()=>auth(A.clerk_user_id,true),getDb:()=>guarded});
 const form=new FormData();form.set('file',new File(['%PDF-1.7 synthetic'], 'renamed.xlsx'));
 const response=await handler(new Request('https://offline.example/api/rts-ingest',{method:'POST',body:form}));
 assert.equal(response.status,400);
 assert.match((await response.json()).error,/signature.*\.xlsx/);
 // The only roster query is the pre-existing verified actor resolution.
 assert.equal(operations.filter(table=>table==='tenant_agents').length,1);
 assert.equal((await query('SELECT count(*)::int n FROM rts_ingestion_log'))[0].n,beforeCount);
});
