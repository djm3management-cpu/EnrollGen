import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with {type:'json'};
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {auditedServiceClient} from '../telephony/src/lib/evidenceAudit.js';
import {featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {createConsumerLifecycleHandler} from '../netlify/functions/consumer-lifecycle.js';
import {EVENT_TYPES,lifecycleCompleteness,projectEvent,requiredDisclosureRules} from '../netlify/lib/lifecycle/model.js';
import {buildLifecyclePacket,evidenceIndex,packetFileIndex} from '../netlify/lib/lifecycle/packet.js';
let pg,db,agents,admin,agent,manager;
const id=n=>`e1630000-0000-4000-8000-${String(n).padStart(12,'0')}`,T=profile.tenantId,C=id(1),CALL=id(2),INTAKE=id(3),REC=id(4),TRANS=id(5);
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),CONSUMER_LIFECYCLE_ENABLED:'true',IX_UPLOAD_ENABLED:'true'},poison=['1EG4TE5MK73','123-45-6789','1955-02-28','PRIVATE MESSAGE BODY'];
const q=(s,a=[])=>pg.query(s,a).then(r=>r.rows);
const auth=n=>({userId:roster[n].clerk_user_id,orgId:profile.organizationId,tokenPayload:{}});
const req=(params={},method='GET')=>new Request('https://app.example.test/api/consumer-lifecycle?'+new URLSearchParams({contact_id:C,...params}),{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'export'})}:{})});
const handler=(who=agent,client=db,settings=env)=>createConsumerLifecycleHandler({authenticate:async()=>who,getDb:()=>client,env:settings});
const rpc=who=>db.rpc('read_consumer_lifecycle',{p_actor:who.userId,p_org:who.orgId,p_contact:C});
async function service(){await pg.exec('SET ROLE service_role');await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);}
before(async()=>{
 pg=await freshDatabase();db={...freshInstallClient(pg),storage:{from:()=>({download:async()=>({data:new Blob(['synthetic audio bytes'])})})}};await service();await provisionDeployment(db,roster,env);
 agents=await q('SELECT id,clerk_user_id FROM enrolled_agents');const aid=n=>agents.find(a=>a.clerk_user_id===roster[n].clerk_user_id).id;
 admin=auth(0);agent=auth(1);manager=auth(2);
 await q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)",[T,admin.userId,manager.userId,[aid(1)]]);
 await q("INSERT INTO contacts(id,tenant_id,assigned_agent_id,first_name,last_name,phone,source,created_at) VALUES($1,$2,$3,'Synthetic','Lifecycle','+12125550123','manual','2026-01-01Z')",[C,T,roster[1].agent_slug]);
 await q("INSERT INTO call_records(id,tenant_id,agent_id,call_direction,call_type,product_type,call_start,call_end,call_duration_seconds,call_outcome,contact_id,soa_on_file,soa_date,ptc_on_file,ptc_date,recording_storage_path,transcript_raw,enrollment_completed,enrollment_confirmation_number,lead_source,metadata) VALUES($1,$2,$3,'outbound','sales','MA','2026-02-01T12:00Z','2026-02-01T12:10Z',600,NULL,$4,true,'2026-01-29',true,'2026-01-28',$5,$6,false,'CONF-163','manual',$7)",[CALL,T,aid(1),C,T+'/synthetic.wav',poison.join(' '),{campaign_name:'Synthetic campaign',vendor_source:poison[0]}]);
 await q("INSERT INTO call_transcripts(id,tenant_id,owner_agent_id,call_record_id,transcript_text,product_line,call_date,created_at) VALUES($1,$2,$3,$4,$5,'MA','2026-02-01T12:00Z','2026-02-01T12:11Z')",[TRANS,T,aid(1),CALL,poison.join(' ')]);
 const sha=createHash('sha256').update('synthetic audio bytes').digest('hex');
 await q("INSERT INTO recording_ingestion(id,account_sid,recording_sid,recording_key,callback_call_sid,parent_call_sid,tenant_id,call_record_id,first_seen_at,storage_path,copy_status,provider_status,sha256,stored_at) VALUES($1,'AC00000000000000000000000000000163','RE00000000000000000000000000000163','RE00000000000000000000000000000163','CA00000000000000000000000000000163','CA00000000000000000000000000000163',$2,$3,'2026-02-01T12:10Z',$4,'stored','completed',$5,'2026-02-01T12:10Z')",[REC,T,CALL,T+'/synthetic.wav',sha]);
 await q("INSERT INTO messages(id,tenant_id,contact_id,direction,channel,body,status,created_at) VALUES($1,$2,$3,'inbound','sms',$4,'received','2026-01-15Z'),($5,$2,$3,'outbound','sms',$4,'sent','2026-01-15Z')",[id(6),T,C,poison.join(' '),id(7)]);
 await q("INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,submitted_at,updated_at) VALUES($1,$2,$3,$4,$5,'{}','synthetic','2026-02-01T12:20Z','2026-02-02Z')",[INTAKE,T,CALL,C,{planName:'Synthetic Plan '+poison[1],newCarrier:'Synthetic Carrier',effectiveDate:'2026-03-01',sunfireCode:'CONF-163'}]);
 await q("INSERT INTO contact_lead_intel(tenant_id,contact_id,vendor_source,payload,received_at) VALUES($1,$2,'Synthetic vendor',$3,'2026-01-02Z')",[T,C,{vendor_source:'Synthetic vendor',body:poison[3]}]);
 await q("INSERT INTO follow_ups(id,tenant_id,contact_id,agent_id,due_at,reason,status,created_at) VALUES($1,$2,$3,$4,'2026-02-05Z',$5,'open','2026-02-02Z')",[id(8),T,C,roster[1].agent_slug,poison.join(' ')]);
 await q("INSERT INTO contact_activities(tenant_id,contact_id,type,summary,occurred_at) VALUES($1,$2,'note',$3,'2026-02-02Z')",[T,C,poison.join(' ')]);
 await q("INSERT INTO compliance_scorecards(id,tenant_id,call_id,pass_fail,category_scores,risk_level,created_at) VALUES($1,$2,$3,'PASS','{}','low','2026-02-01T12:15Z')",[id(9),T,CALL]);
 await q("INSERT INTO scorecard_items(id,scorecard_id,category,result,rule_id,question_text,points_possible,points_earned,display_order) VALUES($1,$2,'disclosure','pass','CALL_OPEN_008_TPMO_DISCLAIMER_2027','Synthetic',1,1,1)",[id(10),id(9)]);
 await q("INSERT INTO compliance_review_decisions(scorecard_item_id,tenant_id,request_id,decision,decided_by) VALUES($1,$2,gen_random_uuid(),'confirm',$3)",[id(10),T,admin.userId]);
 await q("SELECT retention_place_hold($1,$2,'contact',$3,'Synthetic basis')",[admin.userId,admin.orgId,C]);
 await q("SELECT retention_flag_complaint($1,$2,$3,'Synthetic complaint')",[admin.userId,admin.orgId,C]);
 await q("SELECT retention_resolve_complaint($1,$2,$3,'Synthetic resolution')",[admin.userId,admin.orgId,C]);
 await q("INSERT INTO admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,before_summary,after_summary) VALUES(gen_random_uuid(),$1,$2,'contact_assignment','contacts',$3,'succeeded',$4,$5)",[admin.userId,T,C,{assigned_agent_id:aid(3)},{assigned_agent_id:aid(1)}]);
 await q("INSERT INTO retention_recording_purges(recording_id,tenant_id,data_class,contact_id,call_id,status,finished_at) VALUES($1,$2,'enrollmentRecording',$3,$4,'complete','2026-03-01Z')",[id(11),T,C,CALL]);
 await q("INSERT INTO pipelines(id,tenant_id,name,line_of_business) VALUES($1,$2,'Synthetic lifecycle','MA')",[id(40),T]);
 await q("INSERT INTO pipeline_stages(id,tenant_id,pipeline_id,name,position) VALUES($1,$2,$3,'New',1),($4,$2,$3,'Review',2)",[id(41),T,id(40),id(42)]);
 await q("INSERT INTO opportunities(id,tenant_id,pipeline_id,stage_id,contact_id,line_of_business) VALUES($1,$2,$3,$4,$5,'MA')",[id(43),T,id(40),id(41),C]);
 await q("UPDATE opportunities SET stage_id=$1 WHERE id=$2",[id(42),id(43)]);
 await q("INSERT INTO opportunity_stage_history(id,tenant_id,opportunity_id,from_stage_id,to_stage_id,to_stage_name,changed_by) VALUES($1,$2,$3,$4,$5,'Review',$6)",[id(45),T,id(43),id(41),id(42),roster[1].id]);
 await q("INSERT INTO opportunity_events(tenant_id,opportunity_id,history_id,event_type,payload) VALUES($1,$2,$3,'opportunity.stage_changed',$4)",[T,id(43),id(45),{from_stage_id:id(41),to_stage_id:id(42)}]);
 await q("INSERT INTO ix_uploads(id,tenant_id,call_id,twilio_recording_sid,enrollment_key,status,created_at) VALUES($1,$2,$3,'RE00000000000000000000000000000163','synthetic-lifecycle','pending','2026-02-02Z')",[id(44),T,CALL]);

});
after(async()=>{if(pg)await pg.close();});
for(const [name,who,allowed] of [['assigned agent',1,true],['other agent',3,false],['team manager',2,true],['admin',0,true],['unprovisioned',-1,false]])test('database and endpoint scope: '+name,async()=>{
 const person=who<0?{userId:'user_unprovisioned',orgId:profile.organizationId}:auth(who);await service();
 const result=await rpc(person);assert.equal(!result.error,allowed,result.error?.message);
 const response=await handler(person)(req());assert.equal(response.status,allowed?200:403,await response.clone().text());
});
test('manager outside approved team denied directly and through endpoint',async()=>{
 await q('UPDATE deployment_authorities SET team_agent_ids=$1 WHERE clerk_user_id=$2',[[],manager.userId]);
 try{assert.ok((await rpc(manager)).error);assert.equal((await handler(manager)(req())).status,403);}finally{await q('UPDATE deployment_authorities SET team_agent_ids=$1 WHERE clerk_user_id=$2',[[agents.find(a=>a.clerk_user_id===agent.userId).id],manager.userId]);}
});
test('inactive and foreign identities denied directly and through endpoint',async()=>{
 await q('UPDATE enrolled_agents SET is_active=false WHERE clerk_user_id=$1',[agent.userId]);
 try{assert.ok((await rpc(agent)).error);assert.equal((await handler(agent)(req())).status,403);}finally{await q('UPDATE enrolled_agents SET is_active=true WHERE clerk_user_id=$1',[agent.userId]);}
 const foreign={...admin,orgId:'org_Foreign'};assert.ok((await rpc(foreign)).error);assert.equal((await handler(foreign)(req())).status,403);
});
test('browser and anonymous roles cannot impersonate a service actor or read the private projection',async()=>{
 for(const role of ['authenticated','anon']){await pg.exec('SET ROLE '+role);assert.ok((await rpc(admin)).error);await assert.rejects(q('SELECT * FROM consumer_lifecycle_rows($1,$2)',[C,T]));}await service();
});
test('chronological safe timeline, required fields, attribution and no protected values in summaries or payload',async()=>{
 const response=await handler()(req({limit:200}));assert.equal(response.status,200,await response.clone().text());const body=await response.json();
 assert.ok(body.events.length>20);assert.deepEqual(body.events.map(e=>e.time),body.events.map(e=>e.time).sort());
 for(const event of body.events){for(const key of ['time','type','staff','summary','status','evidence'])assert.ok(key in event);assert.ok(event.evidence.length);}
 for(const secret of poison)assert.ok(!JSON.stringify(body).includes(secret),secret);
 for(const type of ['arrival','attribution','consent','soa','call','message','recording','transcript','review','disclosure','enrollment','revision','task','callback','activity','reassignment','hold','complaint','complaint_resolution','retention','opportunity','delivery'])assert.ok(body.events.some(e=>e.type===type),type);
 writeFileSync('/tmp/consumer-lifecycle-ui.json',JSON.stringify({...body,admin:true}));assert.equal(body.admin,false);assert.deepEqual(body.accesses,[]);
});
test('each open writes exactly one trail row, including nested protected RPC reads',async()=>{
 const count=async()=>Number((await q("SELECT count(*) n FROM evidence_access_log WHERE resource_type='consumer_lifecycle' AND resource_id=$1",[C]))[0].n);
 const before=await count();assert.equal((await handler(agent,auditedServiceClient(db,{tenant:T}))(req())).status,200);assert.equal(await count(),before+1);
});
test('a trail write failure refuses all lifecycle data',async()=>{
 const fail={...db,from:table=>table==='evidence_access_log'?{insert:async()=>({error:{code:'synthetic'}})}:db.from(table)};
 const response=await handler(agent,fail)(req());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('events'));
});
test('admin sees consumer access history only',async()=>{
 const body=await (await handler(admin)(req())).json();assert.ok(body.accesses.some(a=>a.actor_id===agent.userId));assert.ok(body.accesses.every(a=>a.occurred_at&&a.action));
});
test('stable keyset pages do not overlap, even for equal timestamps, and bind filter/contact',async()=>{
 const all=[];let cursor;do{const r=await handler()(req({limit:3,...(cursor?{cursor}:{})}));assert.equal(r.status,200);const page=await r.json();all.push(...page.events);cursor=page.next;}while(cursor);
 assert.equal(new Set(all.map(e=>e.key)).size,all.length);
 const whole=await(await handler()(req({limit:200}))).json();assert.deepEqual(all.map(e=>e.key),whole.events.map(e=>e.key));
 const first=await(await handler()(req({limit:1,type:'message'}))).json();assert.ok(first.next);assert.equal((await handler()(req({cursor:first.next,type:'call'}))).status,400);
});
test('switch off hides read/export before auth or database construction, and the SQL fence also denies',async()=>{
 const off=createConsumerLifecycleHandler({env:{...env,CONSUMER_LIFECYCLE_ENABLED:'false'},authenticate:()=>{throw Error('auth touched');},getDb:()=>{throw Error('db touched');}});
 for(const method of ['GET','POST'])assert.equal((await off(req({},method))).status,404);
 await q("SELECT set_config('request.headers','{}',false)");assert.ok((await rpc(admin)).error);await service();
 const ui=readFileSync('src/components/contacts/ContactsTab.jsx','utf8');assert.match(ui,/features\.CONSUMER_LIFECYCLE_ENABLED\?\['LIFECYCLE'\]/);assert.match(readFileSync('src/components/contacts/ConsumerLifecycle.jsx','utf8'),/if\(!features.CONSUMER_LIFECYCLE_ENABLED\)return null/);
});
function event(type,time,details={},table='call_records',n=20){return {key:type+n,type,time,staff:null,status:'recorded',summary:'Synthetic',details,evidence:[{table,id:id(n),time}]};}
test('completeness distinguishes present, missing and not applicable; no SOA and unrecorded sales stay missing',()=>{
 const call=event('call','2026-02-01T12:00:00Z',{callId:CALL,direction:'outbound',sales:true,product:'MA',recording:false,transcript:true});
 const intake=event('enrollment','2026-02-01T13:00:00Z',{confirmation:'CONF'},'enrollment_intakes',21);
 const missing=lifecycleCompleteness([call,intake])[0].checks;assert.equal(missing.find(c=>c.name==='Scope before plan discussion').status,'missing');assert.equal(missing.find(c=>c.name==='Recording').status,'missing');assert.equal(missing.find(c=>c.name==='Confirmation').status,'present');
 const complete=lifecycleCompleteness([{...call,details:{...call.details,recording:true}},intake,event('consent','2026-01-29T00:00:00Z'),event('soa','2026-01-30T00:00:00Z'),...requiredDisclosureRules('MA').map((rule,i)=>({...event('disclosure','2026-02-01T12:30:00Z',{callId:CALL,rule},'scorecard_items',100+i),status:'pass'}))])[0].checks;assert.ok(complete.every(c=>c.status==='present'));
 const na=lifecycleCompleteness([intake])[0].checks;assert.equal(na[0].status,'not applicable');assert.equal(na[1].status,'not applicable');assert.equal(na[2].status,'not applicable');
 const sameDay=lifecycleCompleteness([call,intake,event('soa','2026-02-01T00:00:00Z')])[0].checks;assert.equal(sameDay[1].status,'missing');
});
test('retention marker remains after an actual recording deletion without protected content',async()=>{
 await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders({...env,RETENTION_PURGE_ENABLED:'true'}))]);
 await q('DELETE FROM recording_ingestion WHERE id=$1',[REC]);
 const rows=await q("SELECT * FROM retention_purge_items WHERE resource_id=$1",[REC]);assert.equal(rows.length,1);assert.equal(rows[0].contact_id,C);assert.ok(!JSON.stringify(rows).includes('synthetic.wav'));
 const body=await(await handler()(req({type:'retention'}))).json();assert.ok(body.events.some(e=>e.details.resourceId===REC));await service();
});
test('non-admin packet export denied with no admin log, rate limiting refuses before PDF',async()=>{
 assert.equal((await handler()(req({},'POST'))).status,403);
 const limited={...db,rpc:(name,args)=>name==='consume_admission'?Promise.resolve({data:{allowed:false,retry_after:60}}):db.rpc(name,args)};
 assert.equal((await handler(admin,limited)(req({},'POST'))).status,429);
});
test('packet uses installed PDF library, expected sections, checksum, no audio objects or protected identifiers',()=>{
 const sha=createHash('sha256').update('synthetic audio bytes').digest('hex');
 const events=[projectEvent(event('recording','2026-02-01T12:00:00Z',{stored:true,sha256:sha,plan:poison[1]},'recording_ingestion',30))];
 const bytes=buildLifecyclePacket({agency:profile.agencyName,consumerId:C,asOf:'2026-03-01',events,checks:[]});const text=Buffer.from(bytes).toString('latin1');
 for(const section of [profile.agencyName,'Consumer audit packet','Timeline','Completeness checks','Evidence index',sha])assert.ok(text.includes(section),section);
 assert.equal(evidenceIndex(events)[0].sha256,sha);assert.doesNotMatch(text,/EmbeddedFile|RichMedia|\/Sound|PRIVATE MESSAGE BODY|123-45-6789/);
 writeFileSync('/tmp/consumer-lifecycle-synthetic.pdf',bytes);
});
test('admin export succeeds and appends exactly one evidence event and one administrator action',async()=>{
 const before=Number((await q("SELECT count(*) n FROM admin_action_log WHERE action='consumer_lifecycle'"))[0].n);
 const trail=Number((await q("SELECT count(*) n FROM evidence_access_log WHERE resource_type='consumer_lifecycle' AND action='export'"))[0].n);
 const response=await handler(admin)(req({},'POST'));assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('content-type'),'application/pdf');const bytes=await response.arrayBuffer();assert.ok(bytes.byteLength>1000);writeFileSync('/tmp/consumer-lifecycle-full.pdf',new Uint8Array(bytes));
 assert.equal(Number((await q("SELECT count(*) n FROM admin_action_log WHERE action='consumer_lifecycle'"))[0].n),before+1);
 assert.equal(Number((await q("SELECT count(*) n FROM evidence_access_log WHERE resource_type='consumer_lifecycle' AND action='export'"))[0].n),trail+1);
});
test('administrator log failure refuses packet bytes',async()=>{
 const fail={...db,from:table=>table==='admin_action_log'?{insert:async()=>({error:{code:'synthetic'}})}:db.from(table)};
 const response=await handler(admin,fail)(req({},'POST'));assert.equal(response.status,503);assert.ok(!response.headers.get('content-type').includes('pdf'));
});
test('source extension is typed and has no carrier implementation or transport',()=>{
 const types=readFileSync('netlify/lib/lifecycle/source.d.ts','utf8');assert.match(types,/interface ConsumerLifecycleSource/);assert.match(types,/tenantId: string; consumerId: string; actorId: string/);assert.equal(EVENT_TYPES.length,new Set(EVENT_TYPES).size);
});

test('stored attachments use SHA-256 over actual bytes and fail closed on missing storage',async()=>{
 const bytes='synthetic attachment',expected=createHash('sha256').update(bytes).digest('hex');
 const file={source_table:'message_media',id:id(70),occurred_at:'2026-01-15Z',bucket:'message-media',storage_path:'synthetic.gif'};
 const result=await packetFileIndex({storage:{from:()=>({download:async()=>({data:new Blob([bytes])})})}},[file]);
 assert.equal(result[0].sha256,expected);assert.ok(!JSON.stringify(result).includes('synthetic.gif'));
 await assert.rejects(packetFileIndex({storage:{from:()=>({download:async()=>({error:true})})}},[file]));
});
test('direct source evidence link remains scoped and packet files require admin directly in SQL',async()=>{
 const response=await handler()(req({evidence:'enrollment_intakes:'+INTAKE}));assert.equal(response.status,200);const body=await response.json();assert.ok(body.events.length);assert.ok(body.events.every(e=>e.evidence.some(i=>i.id===INTAKE)));
 assert.equal((await handler(auth(3))(req({evidence:'enrollment_intakes:'+INTAKE}))).status,403);
 for(const who of [agent,manager])assert.ok((await db.rpc('consumer_lifecycle_files',{p_actor:who.userId,p_org:who.orgId,p_contact:C})).error);
});
test('new migration is verbatim in bootstrap and lifecycle CSS remains untouched',()=>{
 assert.equal(readFileSync('supabase/migrations/163_consumer_lifecycle.sql','utf8'),readFileSync('supabase/bootstrap/sql/m163.sql','utf8'));
 const ui=readFileSync('src/components/contacts/ConsumerLifecycle.jsx','utf8');assert.doesNotMatch(ui,/fontWeight:\s*(?:[6-9]00|bold)|border:/);
});
test('administrator access history pages retain every older entry without overlap',async()=>{
 await q("INSERT INTO evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id) SELECT $1,$2,'consumer_lifecycle',$3,'read','allowed',gen_random_uuid() FROM generate_series(1,110)",[admin.userId,T,C]);
 const first=await(await handler(admin)(req())).json();assert.equal(first.accesses.length,100);assert.ok(first.nextAccess);
 const second=await(await handler(admin)(req({access_cursor:first.nextAccess}))).json();assert.ok(second.accesses.length>0);
 assert.equal(new Set([...first.accesses,...second.accesses].map(a=>a.id)).size,first.accesses.length+second.accesses.length);
});
test('years of synthetic messages return a bounded page and stable continuation',async()=>{
 await q("INSERT INTO messages(tenant_id,contact_id,direction,channel,status,body,created_at) SELECT $1,$2,'inbound','sms','received',$3,'2026-04-01Z'::timestamptz+make_interval(secs=>n) FROM generate_series(1,2000) n",[T,C,poison[3]]);
 const first=await(await handler()(req({type:'message',limit:50}))).json();assert.equal(first.events.length,50);assert.ok(first.next);assert.equal(first.checks.length,1);
 const second=await(await handler()(req({type:'message',limit:50,cursor:first.next}))).json();assert.equal(second.events.length,50);assert.equal(new Set([...first.events,...second.events].map(e=>e.key)).size,100);
 assert.ok(!JSON.stringify(second).includes(poison[3]));
});
test('timestamp offsets do not turn later permission into prior consent',()=>{
 const call=event('call','2026-02-01T00:00:00+00:00',{callId:CALL,direction:'outbound',sales:true,product:'MA'});
 const laterConsent=event('consent','2026-01-31T23:30:00-05:00');
 const intake=event('enrollment','2026-02-01T13:00:00Z',{confirmation:'CONF'},'enrollment_intakes',21);
 assert.equal(lifecycleCompleteness([call,laterConsent,intake])[0].checks[0].status,'missing');
});
test('a later failed disclosure revision supersedes an older passing result',()=>{
 const call=event('call','2026-02-01T00:00:00Z',{callId:CALL,sales:true,product:'MA'}),intake=event('enrollment','2026-02-01T13:00:00Z',{confirmation:'CONF'},'enrollment_intakes',21);
 const rules=requiredDisclosureRules('MA'),passed=rules.map((rule,i)=>({...event('disclosure','2026-02-01T12:00:00Z',{callId:CALL,rule},'scorecard_items',200+i),status:'pass'}));
 assert.equal(lifecycleCompleteness([call,intake,...passed])[0].checks[4].status,'present');
 const failed={...event('disclosure','2026-02-01T12:30:00Z',{callId:CALL,rule:rules[0]},'scorecard_items',300),status:'fail'};
 assert.equal(lifecycleCompleteness([call,intake,...passed,failed])[0].checks[4].status,'missing');
});
test('stored-file manifest includes legacy inbound audio and message attachments without exposing paths in the timeline',async()=>{
 await q("INSERT INTO inbound_calls(id,tenant_id,contact_id,twilio_call_sid,from_number,to_number,recording_storage_path,status) VALUES($1,$2,$3,'CA00000000000000000000000000000164','+12125550101','+12125550102',$4,'completed')",[id(80),T,C,T+'/legacy-inbound.wav']);
 await q("INSERT INTO message_media(id,tenant_id,message_id,media_url,storage_path) VALUES($1,$2,$3,'http://127.0.0.1/synthetic.gif',$4)",[id(81),T,id(6),T+'/synthetic.gif']);
 const manifest=await db.rpc('consumer_lifecycle_files',{p_actor:admin.userId,p_org:admin.orgId,p_contact:C});assert.equal(manifest.error,null,manifest.error?.message);
 assert.ok(manifest.data.some(f=>f.source_table==='inbound_calls'&&f.id===id(80)));assert.ok(manifest.data.some(f=>f.source_table==='message_media'&&f.id===id(81)));
 const page=await(await handler()(req({evidence:'messages:'+id(6)}))).json();assert.ok(page.events[0].evidence.some(e=>e.table==='message_media'&&e.id===id(81)));assert.ok(!JSON.stringify(page).includes('synthetic.gif'));
 const hashes=await packetFileIndex(db,manifest.data);assert.ok(hashes.every(f=>f.sha256===createHash('sha256').update('synthetic audio bytes').digest('hex')));
});

test('undated permission and scope flags remain visible but do not establish a prior chain',async()=>{
 await q('UPDATE call_records SET ptc_date=NULL,soa_date=NULL WHERE id=$1',[CALL]);
 try{
  for(const type of ['consent','soa']){const page=await(await handler()(req({type}))).json();assert.equal(page.events.length,1);assert.equal(page.events[0].status,'unknown');assert.equal(page.events[0].details.dated,false);}
  const call=event('call','2026-02-01T12:00:00Z',{callId:CALL,direction:'outbound',sales:true,product:'MA'}),intake=event('enrollment','2026-02-01T13:00:00Z',{confirmation:'CONF'},'enrollment_intakes',21);
  const checks=lifecycleCompleteness([call,intake,event('consent','2026-01-01T00:00:00Z',{dated:false}),event('soa','2026-01-01T00:00:00Z',{dated:false})])[0].checks;assert.equal(checks[0].status,'missing');assert.equal(checks[1].status,'missing');
 }finally{await q("UPDATE call_records SET ptc_date='2026-01-28',soa_date='2026-01-29' WHERE id=$1",[CALL]);}
});
