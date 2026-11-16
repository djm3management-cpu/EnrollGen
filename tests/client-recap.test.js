import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with {type:'json'};
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {createClientRecapHandler,recapHash} from '../netlify/functions/client-recap.js';
import {createTenantSettingsHandler} from '../netlify/functions/tenant-settings.js';
import {RECAP_DEFAULTS,RECAP_SAMPLE,RECAP_FIELDS,RECAP_DISCLAIMER,RECAP_NEXT,renderRecap,recapTemplates} from '../src/lib/clientRecap.js';
import {buildRecapPdf} from '../netlify/lib/recap/pdf.js';
import {evidenceIndex} from '../netlify/lib/lifecycle/packet.js';
import {createConsumerLifecycleHandler} from '../netlify/functions/consumer-lifecycle.js';
import {runRetention} from '../scripts/retention/job.js';
import {auditedServiceClient} from '../telephony/src/lib/evidenceAudit.js';
import {admissionRules} from '../telephony/src/lib/admission.js';
let pg,db,agents,seq=100,sent=[];
const T=profile.tenantId,id=n=>`e1650000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),CLIENT_RECAP_ENABLED:'true',CONSUMER_LIFECYCLE_ENABLED:'true'};
const auth=n=>({userId:roster[n].clerk_user_id,orgId:profile.organizationId,tokenPayload:{}}),aid=n=>agents.find(a=>a.clerk_user_id===roster[n].clerk_user_id).id;
const q=(s,args=[])=>pg.query(s,args).then(r=>r.rows);
async function service(flags=env){await pg.exec('SET ROLE service_role');await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(flags))]);}
const transport={messages:{create:async payload=>{sent.push(payload);return {sid:'SM'+String(sent.length).padStart(32,'0'),status:'queued'};}}};
const handler=(n=1,client=db,flags=env)=>createClientRecapHandler({env:flags,getDb:()=>client,authenticate:async()=>typeof n==='number'?auth(n):n,transport});
const req=(enrollment,body)=>new Request('https://example.invalid/api/client-recap?enrollment_id='+enrollment,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollment_id:enrollment,...body})}:{});
async function preview(e,n=1,client=db){const r=await handler(n,client)(req(e));assert.equal(r.status,200,await r.clone().text());return r.json();}
async function send(e,{n=1,channel='sms',resend=false,client=db,approval=true,previewed}={}){const p=previewed||await preview(e,n,client);return handler(n,client)(req(e,{action:channel==='pdf'?'download':'send',channel,approved:approval,sha256:p.channels[channel].sha256,revision:p.revision,resend}));}
const source=(e,n=1,status=false)=>db.rpc('client_recap_source',{p_actor:auth(n).userId,p_org:profile.organizationId,p_id:e,p_status_only:status});
async function seed({data={},owner=1,completed=true,consent=true,optout=false,textOptIn=true}={}){
 const contact=id(seq++),call=id(seq++),e=id(seq++),a=roster[owner];
 await q('INSERT INTO contacts(id,tenant_id,assigned_agent_id,phone,first_name,do_not_call) VALUES($1,$2,$3,$4,$5,$6)',[contact,T,a.agent_slug,'+1212555'+String(seq).padStart(4,'0'),'Alex',optout]);
 await q("INSERT INTO call_records(id,tenant_id,agent_id,contact_id,call_type,call_direction,product_type,call_start,call_end,ptc_on_file,ptc_date,ptc_expiry) VALUES($1,$2,$3,$4,'enrollment','inbound','MA',clock_timestamp()-interval '5 minutes',clock_timestamp(),$5,current_date-1,current_date+30)",[call,T,aid(owner),contact,consent]);
 const d={firstName:'Alex',planName:'Example Plan',newCarrier:'Example Carrier',planType:'MA/MAPD/PDP',effectiveDate:'2027-01-01',sunfireCode:'CONFIRM165',...data};
 await q('INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[e,T,call,contact,JSON.stringify(d),'{}','Other',completed?new Date().toISOString():null]);
 if(textOptIn)await q("INSERT INTO messages(tenant_id,contact_id,direction,channel,body,status) VALUES($1,$2,'inbound','sms','START','received')",[T,contact]);
 return {e,call,contact};
}
before(async()=>{pg=await freshDatabase();db=freshInstallClient(pg);await service();await provisionDeployment(db,roster,env);agents=await q('SELECT id,clerk_user_id FROM enrolled_agents');await q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)",[T,auth(0).userId,auth(2).userId,[aid(1)]]);});
after(async()=>{await pg?.close();});
beforeEach(async()=>{await service();await q('DELETE FROM admission_counters');});

test('default text and PDF contain all channel-allowed synthetic fields and fixed wording',()=>{
 for(const ch of ['sms','pdf']){
  const content=renderRecap(RECAP_DEFAULTS[ch],RECAP_SAMPLE,ch);
  for(const field of RECAP_FIELDS.filter(f=>ch!=='sms'||f!=='confirmationNumber'))assert.ok(content.includes(RECAP_SAMPLE[field]),field);
  assert.ok(content.includes(RECAP_NEXT));assert.ok(content.includes(RECAP_DISCLAIMER));
  if(ch==='sms'){assert.ok(content.length<=480);assert.ok(!content.includes(RECAP_SAMPLE.confirmationNumber));}
  else {const bytes=Buffer.from(buildRecapPdf(content)).toString('latin1');assert.match(bytes,/%PDF/);assert.match(bytes,/\/Count 1\b/);assert.ok(bytes.includes('EXAMPLE123'));}
 }
 assert.throws(()=>renderRecap(RECAP_DEFAULTS.pdf,{...RECAP_SAMPLE,notes:'forbidden'},'pdf'));
});
test('stored intake projects no protected, financial, clinical or note fields in either channel',async()=>{
 const forbidden=['1EG4TE5MK73','123-45-6789','1942-03-17','99 Private Avenue','DrugSensitive','DoctorSensitive','98.76','NoteSensitive','ConditionSensitive','PaymentSensitive'];
 const {e}=await seed({data:{mbiValue:forbidden[0],ssn:forbidden[1],dateOfBirth:forbidden[2],address:forbidden[3],medications:forbidden[4],providers:forbidden[5],premium:forbidden[6],notes:forbidden[7],healthConditions:forbidden[8],payment:forbidden[9]}});
 const p=await preview(e);const s=await source(e);assert.deepEqual(Object.keys(s.data.fields).sort(),[...RECAP_FIELDS].sort());
 for(const f of forbidden){assert.ok(!JSON.stringify(p).includes(f));assert.ok(!Buffer.from(buildRecapPdf(p.channels.pdf.text)).toString('latin1').includes(f));}
});
test('SQL and application render exactly the same default content and hash',async()=>{
 const {e}=await seed(),p=await preview(e),r=await send(e,{channel:'pdf',previewed:p});assert.equal(r.status,200,await r.clone().text());
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-type'),/pdf/);
 const [stored]=await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e]);assert.equal(stored.content_sha256,recapHash(p.channels.pdf.text));assert.equal(stored.template_version,1);assert.equal(stored.approved_by,auth(1).userId);assert.ok(stored.approved_at);assert.ok(!Object.hasOwn(stored,'body'));assert.ok(!Object.hasOwn(stored,'content'));
 const [columns]=await q("SELECT string_agg(column_name,',') names FROM information_schema.columns WHERE table_name='client_recaps'");assert.doesNotMatch(columns.names,/rendered|body|message_text/);
});
for(const kind of ['unknown','missing disclaimer','changed next','confirmation in text','malformed braces'])test('server and SQL refuse invalid template: '+kind,async()=>{
 const templates=structuredClone(RECAP_DEFAULTS);
 if(kind==='unknown')templates.pdf.body+=' {{medicareNumber}}';if(kind==='missing disclaimer')templates.pdf.disclaimer='';if(kind==='changed next')templates.sms.next='Guaranteed';if(kind==='confirmation in text')templates.sms.body+=' {{confirmationNumber}}';if(kind==='malformed braces')templates.pdf.body+=' {{notes }';
 assert.throws(()=>recapTemplates(templates));
 const settings=createTenantSettingsHandler({env,authenticate:async()=>auth(0),getDb:()=>db});const response=await settings(new Request('https://example.invalid/api/tenant-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_recap_templates:templates})}));assert.equal(response.status,400);
 const r=await db.rpc('execute_admin_action',{p_actor:auth(0).userId,p_org:profile.organizationId,p_action:'tenant_settings',p_request:id(seq++),p_command:{kind:'table',name:'tenants',operation:'update',values:{client_recap_templates:templates},filters:[{column:'id',value:T}]},p_verified_admin:false});assert.ok(r.error);
});
test('audited admin template edit increments only edited channel and cannot bypass version or audit',async()=>{
 const settings=n=>createTenantSettingsHandler({env,authenticate:async()=>auth(n),getDb:()=>db});
 const templates=structuredClone(RECAP_DEFAULTS);templates.pdf.body='Recap: '+templates.pdf.body;
 const request=()=>new Request('https://example.invalid/api/tenant-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_recap_templates:templates})});
 assert.equal((await settings(1)(request())).status,403);assert.equal((await settings(0)(request())).status,200);
 const [{client_recap_templates:stored}]=await q('SELECT client_recap_templates FROM tenants WHERE id=$1',[T]);assert.equal(stored.pdf.version,2);assert.equal(stored.sms.version,1);
 assert.ok((await q("SELECT * FROM admin_action_log WHERE action='tenant_settings' AND target_id=$1",[T])).length);
 await assert.rejects(q('UPDATE tenants SET client_recap_templates=$1 WHERE id=$2',[JSON.stringify(RECAP_DEFAULTS),T]));
 const current={...stored,pdf:{...stored.pdf,body:RECAP_DEFAULTS.pdf.body}};
 assert.equal((await settings(0)(new Request('https://example.invalid/api/tenant-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_recap_templates:current})}))).status,200);
});
test('allowed text sends once through the existing stubbed SMS path and mirrors delivery callbacks',async()=>{
 const {e}=await seed(),p=await preview(e),count=sent.length,r=await send(e,{previewed:p});assert.equal(r.status,200,await r.clone().text());assert.equal(sent.length,count+1);assert.equal(sent.at(-1).body,p.channels.sms.text);assert.ok(!sent.at(-1).body.includes('CONFIRM165'));
 const [stored]=await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e]);assert.equal(stored.content_sha256,recapHash(sent.at(-1).body));
 const [message]=await q('SELECT * FROM messages WHERE id=$1',[stored.message_id]);assert.equal(message.body,p.channels.sms.text);
 await q("UPDATE messages SET status='delivered' WHERE id=$1",[message.id]);assert.equal((await preview(e)).history[0].status,'delivered');
});
for(const kind of ['missing','expired','undated','optout','STOP','no text opt-in'])test('consent refusal with PDF still available: '+kind,async()=>{
 const {e,call,contact}=await seed({consent:kind!=='missing',optout:kind==='optout',textOptIn:kind!=='no text opt-in'});
 if(kind==='expired')await q('UPDATE call_records SET ptc_expiry=current_date-1 WHERE id=$1',[call]);if(kind==='undated')await q('UPDATE call_records SET ptc_date=NULL WHERE id=$1',[call]);
 if(kind==='STOP')await q("INSERT INTO messages(tenant_id,contact_id,direction,channel,body,status) VALUES($1,$2,'inbound','sms','STOP','received')",[T,contact]);
 const p=await preview(e),count=sent.length;assert.ok(p.channels.sms.reason);assert.equal((await send(e,{previewed:p})).status,422);assert.equal(sent.length,count);assert.equal((await send(e,{channel:'pdf',previewed:p})).status,200);
});
test('approval is explicit, stored by server time, and binds exact preview and revision',async()=>{
 const {e}=await seed(),p=await preview(e),count=sent.length;
 assert.equal((await send(e,{approval:false,previewed:p})).status,400);assert.equal(sent.length,count);assert.equal((await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e])).length,0);
 const bad=structuredClone(p);bad.channels.sms.sha256='0'.repeat(64);assert.equal((await send(e,{previewed:bad})).status,409);
 await q("UPDATE enrollment_intakes SET updated_at=clock_timestamp(),data=jsonb_set(data,'{planName}','\"Revised Plan\"') WHERE id=$1",[e]);assert.equal((await send(e,{previewed:p})).status,409);
});
for(const field of ['planName','newCarrier','effectiveDate'])test('eligibility identifies missing '+field,async()=>{
 const {e}=await seed({data:{[field]:''}});const r=await handler()(req(e));assert.equal(r.status,422);assert.match((await r.json()).error,new RegExp({planName:'plan name',newCarrier:'carrier',effectiveDate:'effective date'}[field]));
});
test('unsubmitted draft enrollment cannot render',async()=>{const {e}=await seed({completed:false});const r=await handler()(req(e));assert.equal(r.status,422);assert.match((await r.json()).error,/submitted/);});
let scoped;
test('prepare scoped enrollment',async()=>{scoped=await seed();});
for(const [name,n,allowed,canSend] of [['owner',1,true,true],['peer',3,false,false],['manager',2,true,false],['admin',0,true,true],['unprovisioned',-1,false,false]])test('direct database and endpoint membership: '+name,async()=>{
 const who=n<0?{userId:'user_missing',orgId:profile.organizationId}:auth(n);
 const r=await db.rpc('client_recap_source',{p_actor:who.userId,p_org:who.orgId,p_id:scoped.e,p_status_only:true});assert.equal(!r.error,allowed,r.error?.message);
 const response=await handler(who)(req(scoped.e));assert.equal(response.status,allowed?200:403);
 if(allowed){const p=await response.json();assert.equal(p.can_send,canSend);if(!canSend){assert.ok(!p.channels);assert.ok((await source(scoped.e,n)).error);assert.ok((await db.rpc('client_recap_source',{p_actor:who.userId,p_org:who.orgId,p_id:scoped.e,p_status_only:null})).error);const result=await db.rpc('approve_client_recap',{p_actor:who.userId,p_org:who.orgId,p_id:scoped.e,p_channel:'pdf',p_approved:true,p_checksum:'0'.repeat(64),p_revision:new Date().toISOString()});assert.ok(result.error);assert.equal((await handler(n)(req(scoped.e,{action:'download',approved:true}))).status,403);}}
});
test('inactive, foreign organization and out-of-team manager denied by DB and HTTP',async()=>{
 await q('UPDATE enrolled_agents SET is_active=false WHERE id=$1',[aid(1)]);
 try{assert.ok((await source(scoped.e)).error);assert.equal((await handler()(req(scoped.e))).status,403);}finally{await q('UPDATE enrolled_agents SET is_active=true WHERE id=$1',[aid(1)]);}
 const foreign={...auth(0),orgId:'org_Foreign'};assert.ok((await db.rpc('client_recap_source',{p_actor:foreign.userId,p_org:foreign.orgId,p_id:scoped.e})).error);assert.equal((await handler(foreign)(req(scoped.e))).status,403);
 await q('UPDATE deployment_authorities SET team_agent_ids=$1 WHERE clerk_user_id=$2',[[],auth(2).userId]);try{assert.ok((await source(scoped.e,2,true)).error);assert.equal((await handler(2)(req(scoped.e))).status,403);}finally{await q('UPDATE deployment_authorities SET team_agent_ids=$1 WHERE clerk_user_id=$2',[[aid(1)],auth(2).userId]);}
});
test('browser and anonymous cannot read raw recap, mutate, impersonate service or approve',async()=>{
 for(const role of ['anon','authenticated']){
  await pg.exec('SET ROLE '+role);for(const sql of ['SELECT * FROM client_recaps',"UPDATE client_recaps SET approved_by='forged'",'DELETE FROM client_recaps'])await assert.rejects(q(sql),e=>e.code==='42501');assert.ok((await source(scoped.e,0)).error);
 }
 await service();await assert.rejects(q("INSERT INTO client_recaps DEFAULT VALUES"),e=>e.code==='42501');
});
test('duplicate sends refuse agents; admin resend is audited and SQL rate limited',async()=>{
 const {e}=await seed();assert.equal((await send(e)).status,200);const count=sent.length;assert.equal((await send(e)).status,409);assert.equal(sent.length,count);
 for(let i=0;i<3;i++){const r=await send(e,{n:0,resend:true});assert.equal(r.status,200,await r.clone().text());}
 const r=await send(e,{n:0,resend:true});assert.equal(r.status,429,await r.clone().text());
 assert.equal((await q("SELECT * FROM admin_action_log WHERE action='client_recap' AND actor_id=$1",[auth(0).userId])).filter(r=>r.target_type==='approve_client_recap').length>=3,true);
});
test('profile admission limits enforce subject and deployment daily caps',async()=>{
 const {e}=await seed(),limited={...profile,admissionLimits:{clientRecap:{minute:5,subjectDay:1,deploymentDay:1}}};
 await q("DELETE FROM admission_counters");
 const flags={...env,DEPLOYMENT_PROFILE_JSON:JSON.stringify(limited)},p=await preview(e);
 const response=()=>handler(1,db,flags)(req(e,{action:'download',approved:true,sha256:p.channels.pdf.sha256,revision:p.revision}));
 assert.equal((await response()).status,200);assert.equal((await response()).status,429);assert.equal(admissionRules('clientRecap',auth(1).userId,limited).length,3);
 await q("DELETE FROM admission_counters");
});
test('each preview, send and PDF download writes exactly one trail; trail failure refuses before dispatch',async()=>{
 const {e}=await seed();const count=async()=>Number((await q("SELECT count(*) n FROM evidence_access_log WHERE resource_type='client_recap' AND resource_id=$1",[e]))[0].n);
 let n=await count();const p=await preview(e,1,auditedServiceClient(db,{tenant:T}));assert.equal(await count(),++n);
 assert.equal((await send(e,{previewed:p})).status,200);assert.equal(await count(),++n);
 assert.equal((await send(e,{channel:'pdf',previewed:p})).status,200);assert.equal(await count(),++n);
 const {e:other}=await seed(),otherPreview=await preview(other),calls=sent.length;
 const fail={...db,from:table=>table==='evidence_access_log'?{insert:async()=>({error:Error('synthetic')})}:db.from(table)};
 assert.equal((await handler(1,fail)(req(other))).status,503);
 for(const channel of ['sms','pdf'])assert.equal((await send(other,{client:fail,channel,previewed:otherPreview})).status,503);
 assert.equal(sent.length,calls);assert.equal((await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[other])).length,0);
});
test('revision marks previous recap out of date and never sends again automatically',async()=>{
 const {e}=await seed();await send(e);const calls=sent.length;await q("UPDATE enrollment_intakes SET updated_at=clock_timestamp(),data=jsonb_set(data,'{notes}','\"changed note\"') WHERE id=$1",[e]);const p=await preview(e);assert.equal(p.history[0].out_of_date,true);assert.equal(sent.length,calls);
});
test('lifecycle event and audit evidence checksum appear without body; six checks unchanged',async()=>{
 const {e,contact}=await seed();await send(e);const [recap]=await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e]);
 const lifecycle=createConsumerLifecycleHandler({env,getDb:()=>db,authenticate:async()=>auth(0)});const response=await lifecycle(new Request('https://example.invalid/api/consumer-lifecycle?contact_id='+contact));assert.equal(response.status,200,await response.clone().text());const data=await response.json(),event=data.events.find(r=>r.type==='recap');assert.ok(event);assert.equal(event.summary,'Enrollment recap approved');assert.equal(event.staff,auth(1).userId);assert.equal(event.details.channel,'sms');assert.equal(evidenceIndex([event])[0].sha256,recap.content_sha256);assert.equal(data.checks[0].checks.length,6);assert.doesNotMatch(JSON.stringify(event),/Example Plan|CONFIRM165|body/);
});
test('feature off denies all HTTP and database paths before client or authentication work',async()=>{
 const disabled=createClientRecapHandler({env:{},authenticate:()=>assert.fail('auth touched'),getDb:()=>assert.fail('DB touched')});assert.equal((await disabled(req(scoped.e))).status,404);assert.equal((await disabled(req(scoped.e,{action:'download'}))).status,404);
 await service({});try{assert.ok((await source(scoped.e)).error);}finally{await service();}
 const settings=createTenantSettingsHandler({env:{},authenticate:()=>assert.fail('auth touched')});assert.equal((await settings(new Request('https://example.invalid/tenant-settings?section=client_recap'))).status,404);
});
test('recap modules contain no model client or provider imports',()=>{
 for(const file of ['src/lib/clientRecap.js','netlify/functions/client-recap.js',...readdirSync('netlify/lib/recap').map(f=>'netlify/lib/recap/'+f)])assert.doesNotMatch(readFileSync(file,'utf8'),/\b(?:openai|llm|complete\(|modelClient|anthropic)\b/i,file);
});
test('retention purges recap and enrollment in the same existing pass with UUID-only provenance',async()=>{
 const {e,call,contact}=await seed({textOptIn:false});assert.equal((await send(e,{channel:'pdf'})).status,200);
 await pg.exec('RESET ROLE');await pg.exec('ALTER TABLE enrollment_intakes DISABLE TRIGGER retention_anchor_immutable; ALTER TABLE call_records DISABLE TRIGGER retention_anchor_immutable; ALTER TABLE client_recaps DISABLE TRIGGER retention_anchor_immutable');
 await q("UPDATE enrollment_intakes SET retention_started_at='2000-01-01',completed_at='2000-01-01' WHERE id=$1",[e]);await q("UPDATE call_records SET retention_started_at='2000-01-01' WHERE id=$1",[call]);await q("UPDATE client_recaps SET retention_started_at='2000-01-01' WHERE enrollment_id=$1",[e]);
 await pg.exec('ALTER TABLE enrollment_intakes ENABLE TRIGGER retention_anchor_immutable; ALTER TABLE call_records ENABLE TRIGGER retention_anchor_immutable; ALTER TABLE client_recaps ENABLE TRIGGER retention_anchor_immutable');
 await service({...env,RETENTION_PURGE_ENABLED:'true'});
 await pg.exec('RESET ROLE; ALTER TABLE evidence_access_log DISABLE TRIGGER USER');await q("UPDATE evidence_access_log SET occurred_at='2000-01-01' WHERE resource_id=$1",[e]);await pg.exec('ALTER TABLE evidence_access_log ENABLE TRIGGER USER');await service({...env,RETENTION_PURGE_ENABLED:'true'});
 const retention=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>new Date('2045-01-01'),batchSize:500,maxBatches:10});
 assert.equal((await q('SELECT * FROM enrollment_intakes WHERE id=$1',[e])).length,0,JSON.stringify(retention));assert.equal((await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e])).length,0);
 const markers=await q("SELECT * FROM retention_purge_items WHERE contact_id=$1 AND source_table='client_recaps'",[contact]);assert.equal(markers.length,1);assert.doesNotMatch(JSON.stringify(markers),/Example Plan|CONFIRM165/);await service();
});

test('overlong text is unavailable while the one-page PDF remains available',async()=>{
 const {e}=await seed({data:{planName:'P'.repeat(190),newCarrier:'C'.repeat(190)}}),p=await preview(e);assert.ok(p.channels.sms.reason);assert.equal(p.channels.pdf.reason,null);assert.equal((await send(e,{previewed:p})).status,422);assert.equal((await send(e,{channel:'pdf',previewed:p})).status,200);
});
test('no confirmation value can leak through another allowed field in text',async()=>{
 const {e}=await seed({data:{planName:'Plan CONFIRM165'}}),p=await preview(e);assert.ok(p.channels.sms.reason);assert.ok(p.channels.pdf.text.includes('CONFIRM165'));
});
test('direct approval denies peers, manager, unprovisioned, inactive and missing approval',async()=>{
 const {e}=await seed(),p=await preview(e),base={p_org:profile.organizationId,p_id:e,p_channel:'sms',p_approved:true,p_checksum:p.channels.sms.sha256,p_revision:p.revision};
 for(const actor of [auth(3).userId,auth(2).userId,'user_missing'])assert.ok((await db.rpc('approve_client_recap',{...base,p_actor:actor})).error);
 assert.ok((await db.rpc('approve_client_recap',{...base,p_actor:auth(1).userId,p_approved:false})).error);
 await q('UPDATE enrolled_agents SET is_active=false WHERE id=$1',[aid(1)]);try{assert.ok((await db.rpc('approve_client_recap',{...base,p_actor:auth(1).userId})).error);}finally{await q('UPDATE enrolled_agents SET is_active=true WHERE id=$1',[aid(1)]);}
 assert.equal((await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e])).length,0);
});
test('admin trail failure rolls back template editing and resend reservation before transport',async()=>{
 const {e}=await seed();assert.equal((await send(e)).status,200);const p=await preview(e,0),calls=sent.length;
 await pg.exec('RESET ROLE');await pg.exec("CREATE FUNCTION refuse_recap_admin_log() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic'; END$$; CREATE TRIGGER refuse_recap_admin_log BEFORE INSERT ON admin_action_log FOR EACH STATEMENT EXECUTE FUNCTION refuse_recap_admin_log()");await service();
 try{
  const r=await send(e,{n:0,resend:true,previewed:p});assert.equal(r.status,503);assert.equal(sent.length,calls);assert.equal((await q('SELECT * FROM client_recaps WHERE enrollment_id=$1',[e])).length,1);
  const [{client_recap_templates:old}]=await q('SELECT client_recap_templates FROM tenants WHERE id=$1',[T]),changed=structuredClone(old);changed.pdf.body='Updated '+changed.pdf.body;
  const settings=createTenantSettingsHandler({env,authenticate:async()=>auth(0),getDb:()=>db});const response=await settings(new Request('https://example.invalid/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_recap_templates:changed})}));assert.equal(response.status,503);assert.deepEqual((await q('SELECT client_recap_templates FROM tenants WHERE id=$1',[T]))[0].client_recap_templates,old);
 }finally{await pg.exec('RESET ROLE; DROP TRIGGER refuse_recap_admin_log ON admin_action_log; DROP FUNCTION refuse_recap_admin_log()');await service();}
});
test('off lifecycle has no recap event or filter entry and no template entry can be read or saved',async()=>{
 const {e,contact}=await seed();await send(e,{channel:'pdf'});const off={...env,CLIENT_RECAP_ENABLED:'false'};await service(off);
 try{
  const lifecycle=createConsumerLifecycleHandler({env:off,getDb:()=>db,authenticate:async()=>auth(0)}),r=await lifecycle(new Request('https://example.invalid/api/consumer-lifecycle?contact_id='+contact));assert.equal(r.status,200);const body=await r.json();assert.ok(!body.types.includes('recap'));assert.ok(!body.events.some(e=>e.type==='recap'));
  const settings=createTenantSettingsHandler({env:off,getDb:()=>db,authenticate:async()=>auth(0)});assert.equal((await settings(new Request('https://example.invalid/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_recap_templates:RECAP_DEFAULTS})}))).status,404);
 }finally{await service();}
});
test('revision removing a required field still shows out-of-date history without permitting a new recap',async()=>{
 const {e}=await seed();assert.equal((await send(e,{channel:'pdf'})).status,200);const calls=sent.length;await q("UPDATE enrollment_intakes SET updated_at=clock_timestamp(),data=jsonb_set(data,'{effectiveDate}','\"\"') WHERE id=$1",[e]);const response=await handler()(req(e));assert.equal(response.status,422);const body=await response.json();assert.match(body.error,/effective date/);assert.equal(body.can_send,false);assert.equal(body.history[0].out_of_date,true);assert.ok(!body.channels);assert.equal(sent.length,calls);
});
