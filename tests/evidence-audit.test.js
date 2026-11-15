import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {auditedEvidenceAccess,auditedServiceClient,PROTECTED_TABLES,PROTECTED_RPCS,EvidenceAuditError} from '../telephony/src/lib/evidenceAudit.js';
import {auditedEvidenceRequest,EvidenceError} from '../netlify/functions/_evidenceAccess.js';
import {recordingMediaGrant} from '../netlify/functions/_recordingAccess.js';
import {recordingComplianceGrant} from '../integrations/recordingComplianceGrant.js';
import {processRecording} from '../telephony/src/recordings.js';
import {AUDITED_TABLES,evidenceTransport} from '../src/lib/evidenceTransport.js';
import {buildAccessDatabase,fixtureRoster,T,uuid} from './helpers/databaseAccessSchema.js';
const actor=fixtureRoster[0].clerk_user_id;
const details={actor,tenant:T,resource:'recording',resourceId:uuid(500),action:'read'};
function sink({fail=false}={}){
 const records=[],effects=[];
 const db={records,effects,from(table){assert.equal(table,'evidence_access_log');return {insert:async row=>{if(fail)return {error:Error('PRIVATE NAME 123-45-6789')};records.push(row);return {error:null};}};}};
 return db;
}
test('allowed, denied and nested evidence access each append exactly once without content or request actor',async()=>{
 const db=sink(),sensitive={name:'Synthetic Private',phone:'2025550199',mbi:'1EG4TE5MK73'};
 assert.deepEqual(await auditedEvidenceAccess(db,details,()=>auditedEvidenceAccess(db,details,async()=>sensitive)),sensitive);
 assert.equal(db.records.length,1);assert.equal(db.records[0].actor_id,actor);assert.equal(db.records[0].result,'allowed');
 await assert.rejects(auditedEvidenceAccess(db,details,()=>{throw new EvidenceError(403,'Unavailable');}),/Unavailable/);
 assert.equal(db.records.length,2);assert.equal(db.records[1].result,'denied');
 assert.deepEqual(Object.keys(db.records[0]).sort(),['actor_id','tenant_id','resource_type','resource_id','action','result','grant_id'].sort());
 assert.doesNotMatch(JSON.stringify(db.records),/Synthetic Private|2025550199|1EG4TE5MK73/);
 const req=new Request('https://app.test/api?call_id='+uuid(2),{method:'POST',body:JSON.stringify({actor:'attacker',userId:'forged',tenant_id:uuid(999)})});
 await auditedEvidenceRequest(db,{userId:actor},req,'enrollment_intake',async()=>({}),async()=>Response.json({ok:true}));
 assert.equal(db.records[2].actor_id,actor);assert.equal(db.records[2].tenant_id,JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON).tenantId);
});
test('audit failure refuses returned fields and blocks preflight external effects without echoing diagnostics',async()=>{
 const db=sink({fail:true});let sends=0;
 await assert.rejects(auditedEvidenceAccess(db,details,async()=>({decrypted:'secret'})),EvidenceAuditError);
 await assert.rejects(auditedEvidenceAccess(db,details,async()=>{sends++;},{before:true}),EvidenceAuditError);
 assert.equal(sends,0);
});
for(const source of ['storage','provider','compliance'])test(`${source} grant has one session-bound audit and matching opaque link ID; failure issues no grant`,async()=>{
 const identity={tenant:{id:T},auth:{userId:actor},admin:true};
 const row={id:uuid(501),tenant_id:T,storage_path:T+'/call.wav',account_sid:'AC'+'a'.repeat(32),recording_sid:'RE'+'b'.repeat(32),expected_call_sid:'CA'+'c'.repeat(32)};
 const db=sink();const audit=db.from.bind(db);const tickets=[];let signs=0;
 db.from=table=>table==='evidence_access_log'?audit(table):{insert:async ticket=>{tickets.push(ticket);return {error:null};}};
 db.storage={from:()=>({createSignedUrl:async()=>{signs++;return {data:{signedUrl:'https://storage.test/SECRET-CAPABILITY'}};}})};
 const grant=()=>source==='compliance'?recordingComplianceGrant(db,identity,row):recordingMediaGrant(db,identity,row,{forceProvider:source==='provider'});
 const value=await grant();assert.ok(value.url);assert.equal(db.records.length,1);assert.equal(db.records[0].actor_id,actor);
 if(source!=='storage')assert.equal(tickets[0].grant_id,db.records[0].grant_id);
 assert.doesNotMatch(JSON.stringify(db.records),/SECRET-CAPABILITY|token_hash|storage_path/);
 const bad=sink({fail:true});db.from=table=>table==='evidence_access_log'?bad.from(table):{insert:()=>assert.fail('ticket issued without audit')};
 signs=0;await assert.rejects(grant(),EvidenceAuditError);assert.equal(signs,0);
});
for(const table of PROTECTED_TABLES)test(`service evidence query ${table} cannot release data on audit failure`,async()=>{
 const db=sink({fail:true}),original=db.from.bind(db);
 db.from=name=>name==='evidence_access_log'?original(name):{select(){return this;},eq(){return this;},then(resolve){return Promise.resolve({data:[{secret:'protected'}],error:null}).then(resolve);}};
 const audited=auditedServiceClient(db,{tenant:T});
 await assert.rejects(async()=>await audited.from(table).select('*').eq('id',uuid(5)),EvidenceAuditError);
});
for(const name of PROTECTED_RPCS)test(`service evidence RPC ${name} refuses audit failure before returning or decrypting fields`,async()=>{
 const db=sink({fail:true});let reads=0;db.rpc=async()=>{reads++;return {data:{protected:'private'},error:null};};
 await assert.rejects(auditedServiceClient(db,{tenant:T}).rpc(name,{p_call_id:uuid(7)}),EvidenceAuditError);assert.equal(reads,0);
});
test('recording copy fails closed before provider fetch if its audit cannot be committed',async()=>{
 let sends=0;await assert.rejects(processRecording({db:sink({fail:true}),job:{tenant_id:T,id:uuid(9)},fetchImpl:()=>{sends++;}}),EvidenceAuditError);assert.equal(sends,0);
});
test('browser transport preserves projections/filters while POSTing audited reads and bounded edits',async()=>{
 const requests=[],send=evidenceTransport(async(url,options)=>{requests.push({url,options});return Response.json([]);});
 await send('https://db.test/rest/v1/call_records?id=eq.'+uuid(1)+'&select=id,transcript_raw',{headers:{Authorization:'Bearer verified'},method:'GET'});
 assert.equal(requests[0].options.method,'POST');assert.match(requests[0].url,/rpc\/read_evidence_call_records/);assert.ok(requests[0].url.includes('select=id%2Ctranscript_raw'));
 assert.equal(JSON.parse(requests[0].options.body).p_resource,uuid(1));assert.equal(requests[0].options.headers.get('Authorization'),'Bearer verified');
 await send('https://db.test/rest/v1/call_records?id=eq.'+uuid(1)+'&tenant_id=eq.'+T,{method:'PATCH',body:'{"call_outcome":"not_interested"}'});
 assert.equal(JSON.parse(requests[1].options.body).p_expected.tenant_id,T);
});
let pg;
before(async()=>{({pg}=await buildAccessDatabase());});
after(async()=>{await pg?.close();});
const q=(sql,args=[])=>pg.query(sql,args).then(r=>r.rows);
async function as(role='authenticated',subject=actor){await pg.exec('RESET ROLE');await q("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:subject,role})]);await pg.exec('SET ROLE '+role);}
test('append-only SQL guard rejects update/delete/truncate for browser, service and owner; only server inserts',async()=>{
 await pg.exec('RESET ROLE');await q("INSERT INTO evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id) VALUES($1,$2,'recording','collection','list','allowed',$3)",[actor,T,uuid(80)]);
 for(const role of ['anon','authenticated','service_role','none']){
  await as(role==='none'?'service_role':role);if(role==='none')await pg.exec('RESET ROLE');
  for(const sql of ['UPDATE evidence_access_log SET result=result','DELETE FROM evidence_access_log','TRUNCATE evidence_access_log'])await assert.rejects(q(sql),e=>e.code==='42501');
 }
 await as();await assert.rejects(q("INSERT INTO evidence_access_log DEFAULT VALUES"),e=>e.code==='42501');
});
test('trail is tenant-admin-only under the real P0-2 authority resolver',async()=>{
 await as();assert.equal((await q('SELECT * FROM evidence_access_log')).length,0);
 await pg.exec('RESET ROLE');await q("INSERT INTO deployment_authorities(tenant_id,clerk_user_id,authority) VALUES($1,$2,'admin')",[T,fixtureRoster[3].clerk_user_id]);
 await as('authenticated',fixtureRoster[3].clerk_user_id);assert.ok((await q('SELECT * FROM evidence_access_log')).length>0);
});
test('every protected browser composite closes direct table reads, preserves scope, and durably records denied IDs',async()=>{
 await as();
 for(const table of AUDITED_TABLES){
  if(table.startsWith('v_'))continue;
  await assert.rejects(q('SELECT * FROM public.'+table),e=>e.code==='42501');
  assert.deepEqual(await q('SELECT * FROM read_evidence_'+table+'($1) ',[uuid(99999)]),[],table);
 }
 await pg.exec('RESET ROLE');const rows=await q("SELECT * FROM evidence_access_log WHERE resource_id=$1",[uuid(99999)]);
 assert.equal(rows.length,[...AUDITED_TABLES].filter(n=>!n.startsWith('v_')).length);assert.ok(rows.every(r=>r.actor_id===actor && r.result==='denied' && r.occurred_at instanceof Date));
});
test('browser routine audit failure rolls back and returns no protected composite',async()=>{
 await pg.exec('RESET ROLE');await pg.exec("CREATE FUNCTION synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic failure'; END$$; CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON evidence_access_log FOR EACH STATEMENT EXECUTE FUNCTION synthetic_audit_failure()");
 try{await as();for(const table of AUDITED_TABLES)await assert.rejects(q('SELECT * FROM read_evidence_'+table+'()'));}
 finally{await pg.exec('RESET ROLE;DROP TRIGGER synthetic_audit_failure ON evidence_access_log;DROP FUNCTION synthetic_audit_failure()');}
});
test('evidence handler inventory rejects unwrapped user routes and raw server SDK factories',()=>{
 const inventory=JSON.parse(readFileSync(new URL('./fixtures/evidence-boundaries.json',import.meta.url),'utf8'));
 const userRoutes=inventory.sessionHandlers;
 for(const route of userRoutes)assert.match(readFileSync(new URL('../netlify/functions/'+route+'.js',import.meta.url),'utf8'),/auditedEvidenceRequest/);
 for(const file of readdirSync(new URL('../netlify/functions/',import.meta.url)).filter(n=>n.endsWith('.js')&&!n.startsWith('_'))){
  const source=readFileSync(new URL('../netlify/functions/'+file,import.meta.url),'utf8');
  const hasProtectedRead=[...source.matchAll(/\.from\(["']([a-z_]+)["']\)/g)].some(match=>PROTECTED_TABLES.has(match[1]));
  if(!hasProtectedRead)continue;
  assert.match(source,/getEvidenceServiceClient|createSupabaseClient|getSupabase/,'Unregistered evidence service factory: '+file);
  if(source.includes('authenticate') && !file.endsWith('-background.js') && file!=='embeddings.js')assert.match(source,/auditedEvidenceRequest/,'User evidence handler bypasses session audit: '+file);
 }
 for(const dir of ['netlify/functions','integrations','telephony/src']){
  for(const file of readdirSync(new URL('../'+dir+'/',import.meta.url),{recursive:true}).filter(n=>n.endsWith('.js'))){
   const text=readFileSync(new URL('../'+dir+'/'+file,import.meta.url),'utf8');
   if(text.includes("from '@supabase/supabase-js'") || text.includes('from "@supabase/supabase-js"'))assert.ok(['integrations/supabase.js','telephony/src/lib/supabaseKeys.js'].includes(dir+'/'+file),dir+'/'+file);
  }
 }
});
test('optional office export RPC executes under the service role, remains tenant-scoped and appends its list event',async()=>{
 await as('service_role');const rows=await q('SELECT * FROM export_evidence_calls()');assert.ok(rows.every(row=>row.tenant_id===T));
 await pg.exec('RESET ROLE');const events=await q("SELECT * FROM evidence_access_log WHERE actor_id='service:nextcloud'");assert.equal(events.length,1);assert.equal(events[0].action,'list');
});
test('contact-wide read markers retain inbound/unread filtering, assignment scope and durable denials',async()=>{
 await pg.exec('RESET ROLE');const own=uuid(321),peer=uuid(322);
 const peerActor=fixtureRoster[1];
 await q("INSERT INTO contacts(id,tenant_id,assigned_agent_id) VALUES($1,$2,$3),($4,$2,$5)",[own,T,fixtureRoster[0].agent_slug,peer,peerActor.agent_slug]);
 await q("INSERT INTO messages(id,tenant_id,contact_id,direction,body) VALUES($1,$2,$3,'inbound','Synthetic'),($4,$2,$3,'outbound','Synthetic'),($5,$2,$6,'inbound','Synthetic')",[uuid(323),T,own,uuid(324),uuid(325),peer]);
 await as();const read=await q('SELECT id FROM mark_evidence_messages_read($1,now())',[own]);assert.deepEqual(read.map(r=>r.id),[uuid(323)]);
 assert.deepEqual(await q('SELECT id FROM mark_evidence_messages_read($1,now())',[peer]),[]);
 await pg.exec('RESET ROLE');const rows=await q('SELECT id,read_at FROM messages ORDER BY id');assert.ok(rows.find(r=>r.id===uuid(323)).read_at);assert.equal(rows.find(r=>r.id===uuid(324)).read_at,null);assert.equal(rows.find(r=>r.id===uuid(325)).read_at,null);
 const events=await q("SELECT result FROM evidence_access_log WHERE resource_type='messages' AND resource_id=ANY($1)",[[own,peer]]);assert.deepEqual(events.map(e=>e.result),['allowed','denied']);
});
test('schema-scoped server clients retain auditing and raw REST cannot bypass the boundary',async()=>{
 const raw=sink({fail:true});raw.from=table=>table==='evidence_access_log'?{insert:async()=>({error:Error('failure')})}:{select(){return this;},then(resolve){return Promise.resolve({data:[{private:true}]}).then(resolve);}};
 raw.schema=()=>raw;const db=auditedServiceClient(raw,{tenant:T});
 await assert.rejects(async()=>await db.schema('public').from('call_records').select('*'),EvidenceAuditError);
 assert.throws(()=>db.schema('pii_vault'),EvidenceAuditError);assert.throws(()=>db.rest,EvidenceAuditError);
});
