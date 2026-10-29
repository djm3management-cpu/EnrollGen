import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,seed,provider,settings,sid} from './helpers/conferenceHarness.js';
import {createServer} from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
for(const name of ['PUBLIC_BASE_URL','SUPABASE_URL'])process.env[name]='https://example.test';
for(const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])process.env[name]='fixture';
const {createConferenceStore}=await import('../src/conferenceStore.js');
const {createConferenceService,validUsPhone}=await import('../src/conferenceCalling.js');
const {createTranscriptWriter}=await import('../src/transcripts.js');
const {createConferenceMedia,conferenceStreamUrl}=await import('../src/media/conferenceMedia.js');
const {createConferenceRouter}=await import('../src/routes/conferenceCalling.js');
const {conferenceGuard}=await import('../src/conferenceGuard.js');
const {config}=await import('../src/config.js');
let pg,db,legacyWriterDefinition;
before(async()=>{({pg,db,legacyWriterDefinition}=await database());});
after(async()=>pg?.close());
async function harness(t,direction='inbound'){
 await pg.exec('BEGIN');const cleanup=[];t.after(async()=>{for(const close of cleanup)await close();await pg.exec('ROLLBACK');});
 const initial=await seed(pg,direction),twilio=provider(initial),store=createConferenceStore(db);
 let clock=Date.now();
 const service=createConferenceService({store,client:twilio.client,settings,now:()=>new Date(clock).toISOString()});
 const c=await service.upgrade(initial.call,'+16095551234');
 const action=input=>service.action(c.call_id,{actor:initial.original,...input});
 const people=()=>store.participants(c.call_id);
 const third=async()=>(await people()).find(p=>p.role==='third_party'&&p.status!=='left');
 async function answer(p){twilio.calls.get(p.twilio_call_sid).status='in-progress';twilio.members.set(p.twilio_call_sid,{callSid:p.twilio_call_sid});await service.media(await store.get(c.call_id),p);await service.joined(await store.get(c.call_id),p);return store.participant(p.id);}
 return {initial,twilio,store,service,c,action,people,third,answer,cleanup,advance:ms=>{clock+=ms;}};
}
for(const direction of ['inbound','outbound'])test(`${direction}: conversion preserves internal call identity, records/streams before child-first redirect, and adds without holding`,async t=>{
 const h=await harness(t,direction);
 await h.action({action:'dial',mode:'add',phone:'+16095556789'});
 const updates=h.twilio.operations.filter(op=>op[0]==='update'&&op[2].twiml);
 assert.deepEqual(updates.map(op=>op[1]),[h.initial.child,h.initial.parent]);
 for(const update of updates){assert.match(update[2].twiml,new RegExp(`enrollgen-${h.initial.record}`));assert.match(update[2].twiml,/endConferenceOnExit="false"/);}
 const firstRedirect=h.twilio.operations.findIndex(op=>op[0]==='update');
 assert.equal(h.twilio.operations.slice(0,firstRedirect).filter(op=>op[0]==='record').length,2);
 assert.equal(h.twilio.operations.slice(0,firstRedirect).filter(op=>op[0]==='stream').length,2);
 assert.equal(h.twilio.holds.length,0);
 assert.equal((await h.people()).length,3);
 const added=await h.third();assert.equal(added.status,'ringing');
 const dial=h.twilio.operations.find(op=>op[0]==='dial')[2];assert.equal(dial.from,settings.twilioPhoneNumber);
 const connected=await h.answer(added);assert.equal(connected.status,'connected');
 assert.equal((await h.store.get(h.c.call_id)).transfer_deadline,null);
});
test('remove hangs up only the third party and leaves customer/agent connected',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});const p=await h.answer(await h.third());
 await h.action({action:'remove',participantId:p.id});
 assert.equal(h.twilio.calls.get(p.twilio_call_sid).status,'completed');
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
 assert.equal(h.twilio.calls.get(h.initial.child).status,'in-progress');
 assert.equal((await h.store.get(h.c.call_id)).ended_at,null);
});
test('warm complete holds customer privately, reconnects everyone, and allows original agent to leave',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'warm',phone:'+16095556789'});
 assert.equal(h.twilio.holds.at(-1).hold,true);assert.match(h.twilio.holds.at(-1).holdUrl,/conference\/hold/);
 await assert.rejects(()=>h.action({action:'hold',held:false}),/Complete or cancel/);
 const p=await h.answer(await h.third());await h.action({action:'warm_complete'});
 assert.equal(h.twilio.holds.at(-1).hold,false);
 assert.equal((await h.store.get(h.c.call_id)).phase,'warm_completed');
 await h.action({action:'leave'});
 assert.equal(h.twilio.calls.get(h.initial.child).status,'completed');
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
 assert.equal(h.twilio.calls.get(p.twilio_call_sid).status,'in-progress');
 assert.equal((await pg.query('SELECT agent_id FROM call_records WHERE id=$1',[h.initial.record])).rows[0].agent_id,h.initial.owner);
});
test('warm cancel removes target, restores customer and releases receiving agent reservation',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'warm',targetAgentId:'receiver'});
 const p=await h.answer(await h.third());
 assert.equal((await pg.query("SELECT active_call_sid FROM agent_availability WHERE agent_id='receiver'")).rows[0].active_call_sid,h.initial.parent);
 await h.action({action:'warm_cancel'});
 assert.equal(h.twilio.calls.get(p.twilio_call_sid).status,'completed');
 assert.equal((await h.store.get(h.c.call_id)).customer_held,false);
 assert.equal((await pg.query("SELECT active_call_sid FROM agent_availability WHERE agent_id='receiver'")).rows[0].active_call_sid,null);
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
});
test('completed warm transfer to EnrollGen agent moves record, session and disposition ownership atomically',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'warm',targetAgentId:'receiver'});
 await h.answer(await h.third());await h.action({action:'warm_complete'});
 const record=(await pg.query('SELECT agent_id FROM call_records WHERE id=$1',[h.initial.record])).rows[0];
 const session=(await pg.query('SELECT agent_id FROM sessions WHERE id=$1',[h.initial.session])).rows[0];
 const attempt=(await pg.query('SELECT agent_id FROM telephony_call_attempts WHERE id=$1',[h.initial.attempt])).rows[0];
 assert.equal(record.agent_id,h.initial.receiver);assert.equal(session.agent_id,h.initial.receiver);assert.equal(attempt.agent_id,'receiver');
 assert.equal((await h.store.get(h.c.call_id)).owner_agent_id,'receiver');
});
test('blind answered drops original agent immediately while customer remains and third-party audio persists',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'blind',phone:'+16095556789'});
 assert.equal(h.twilio.calls.get(h.initial.child).status,'completed');
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
 const p=await h.answer(await h.third());
 const writer=createTranscriptWriter({db,claims:{participantId:p.id,startedAt:h.c.started_at}});
 await writer({type:'transcript',isFinal:true,speaker:'third_party',text:'Third person speaking after the agent leaves',timestamp:Date.now(),startMs:0,endMs:500});
 const record=(await pg.query('SELECT transcript_raw,transcript_diarized FROM call_records WHERE id=$1',[h.initial.record])).rows[0];
 assert.match(record.transcript_raw,/THIRD_PARTY: Third person/);assert.equal(record.transcript_diarized[0].speaker,'third_party');
 assert.equal(record.transcript_diarized[0].participant_id,p.id);
 assert.equal(h.twilio.recordings.size,3);
});
test('blind no-answer returns to online original agent; missed callback uses same bounded fallback',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'blind',phone:'+16095556789'});
 const p=await h.third();h.twilio.calls.get(p.twilio_call_sid).status='no-answer';
 await h.service.status(p.id,{CallSid:p.twilio_call_sid,CallStatus:'no-answer'});
 assert.equal((await h.store.get(h.c.call_id)).phase,'recovering');
 const dial=h.twilio.operations.filter(op=>op[0]==='dial').at(-1)[2];assert.match(dial.to,/^client:original\?/);
 const returning=(await h.people()).find(item=>item.role==='agent'&&item.status==='ringing');await h.answer(returning);
 assert.equal((await h.store.get(h.c.call_id)).phase,'active');
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
});
test('blind no-answer with offline original agent sends customer to voicemail instead of stranding',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'blind',phone:'+16095556789'});
 await pg.exec("DELETE FROM agent_phone_sessions WHERE agent_id='original'");
 const p=await h.third();h.twilio.calls.get(p.twilio_call_sid).status='no-answer';
 await h.service.status(p.id,{CallSid:p.twilio_call_sid,CallStatus:'no-answer'});
 assert.equal((await h.store.get(h.c.call_id)).phase,'voicemail');
 const last=h.twilio.operations.filter(op=>op[0]==='update'&&op[1]===h.initial.parent).at(-1)[2];
 assert.match(last.twiml,/<Record /);assert.match(last.twiml,/conference\/recording/);
});
test('customer hangs up first: every other leg ends, record finalizes once and reservations release',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});await h.answer(await h.third());
 const customer=(await h.people()).find(p=>p.role==='customer');h.twilio.calls.get(customer.twilio_call_sid).status='completed';
 await h.service.status(customer.id,{CallSid:customer.twilio_call_sid,CallStatus:'completed'});
 await h.service.status(customer.id,{CallSid:customer.twilio_call_sid,CallStatus:'completed'});
 assert.equal((await h.store.get(h.c.call_id)).phase,'ended');assert.ok((await h.people()).every(p=>p.status==='left'));
 assert.ok([...h.twilio.calls.values()].every(call=>call.status==='completed'));
 assert.equal((await pg.query('SELECT count(*)::int n FROM agent_availability WHERE active_call_sid IS NOT NULL')).rows[0].n,0);
 assert.equal((await pg.query("SELECT count(*)::int n FROM telephony_events WHERE event='call_completed'")).rows[0].n,1);
});
test('heartbeat: browser loss after third joins drops only dead agent and keeps recording/transcription alive',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});const p=await h.answer(await h.third());
 await pg.exec("DELETE FROM agent_phone_sessions WHERE agent_id='original'");
 await h.service.tick();h.advance(46000);await h.service.tick();
 assert.equal(h.twilio.calls.get(h.initial.child).status,'completed');assert.equal(h.twilio.calls.get(p.twilio_call_sid).status,'in-progress');
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
 assert.equal((await h.store.get(h.c.call_id)).phase,'active');
 assert.equal(h.twilio.streams.get(p.twilio_call_sid)[0].track,'inbound_track');
 assert.equal([...h.twilio.recordings.values()].find(r=>r.callSid===p.twilio_call_sid).status,'in-progress');
});
test('watchdog handles missed join/no-answer events, restarts lost participant streams and reconciles recordings after closure',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});const p=await h.third();
 h.twilio.calls.get(p.twilio_call_sid).status='in-progress';h.twilio.members.set(p.twilio_call_sid,{callSid:p.twilio_call_sid});
 await h.service.tick();assert.equal((await h.store.participant(p.id)).status,'connected');
 h.twilio.streams.set(p.twilio_call_sid,[]);await h.service.tick();
 assert.equal((await h.store.participant(p.id)).stream_generation,2);
 await h.action({action:'end'});await h.service.tick();
 assert.equal((await pg.query('SELECT count(*)::int n FROM recording_ingestion WHERE call_record_id=$1',[h.initial.record])).rows[0].n,3);
 assert.equal((await pg.query('SELECT count(DISTINCT callback_call_sid)::int n FROM recording_ingestion')).rows[0].n,3);
});
test('warm dial failure unholds customer, cancels target and keeps original call usable',async t=>{
 const h=await harness(t);h.twilio.failDial=true;
 await assert.rejects(()=>h.action({action:'dial',mode:'warm',phone:'+16095556789'}),/provider failure/);
 assert.equal((await h.store.get(h.c.call_id)).customer_held,false);assert.equal((await h.store.get(h.c.call_id)).phase,'active');
 assert.equal(h.twilio.calls.get(h.initial.parent).status,'in-progress');
});
test('SQL lease isolates participant streams, survives original agent release and rejects stale owner/generation',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});const p=await h.answer(await h.third());
 const owner=randomUUID();const args=[p.id,p.twilio_call_sid,p.stream_generation,sid('MZ'),owner];
 assert.equal((await pg.query('SELECT claim_conference_media($1,$2,$3,$4,$5) ok',args)).rows[0].ok,true);
 assert.equal((await pg.query('SELECT claim_conference_media($1,$2,$3,$4,$5) ok',[p.id,p.twilio_call_sid,p.stream_generation,sid('MZ'),randomUUID()])).rows[0].ok,false);
 await h.store.release('original',h.initial.parent);
 assert.equal((await pg.query('SELECT renew_conference_media($1,$2) ok',[p.id,owner])).rows[0].ok,true);
 assert.equal((await pg.query('SELECT release_conference_media($1,$2) ok',[p.id,randomUUID()])).rows[0].ok,false);
 await pg.query('DELETE FROM conference_media_leases WHERE participant_id=$1',[p.id]);
 assert.equal((await pg.query('SELECT claim_conference_media($1,$2,$3,$4,$5) ok',[p.id,p.twilio_call_sid,p.stream_generation-1,sid('MZ'),owner])).rows[0].ok,false);
});
test('SQL privacy/ownership: browser roles cannot read/write participants or invoke service functions; legacy positional writer still works',async t=>{
 const h=await harness(t);
 await pg.query("SELECT persist_telephony_transcript($1,$2,'customer','Before conference',now(),0,10)",[h.initial.attempt,randomUUID()]);
 for(const role of ['anon','authenticated']){
  await pg.exec('SAVEPOINT browser; SET ROLE '+role);
  await assert.rejects(()=>pg.query('SELECT * FROM call_participants'),/permission denied/);
  await pg.exec('ROLLBACK TO SAVEPOINT browser; SET ROLE '+role);
  await assert.rejects(()=>pg.query('SELECT reserve_conference_agent($1,$2)',[h.initial.parent,'receiver']),/permission denied/);
  await pg.exec('ROLLBACK TO SAVEPOINT browser; RESET ROLE');
 }
 const token=randomUUID();assert.equal((await pg.query('SELECT lock_call_conference($1,$2) ok',[h.c.call_id,token])).rows[0].ok,true);
 assert.equal((await pg.query('SELECT lock_call_conference($1,$2) ok',[h.c.call_id,randomUUID()])).rows[0].ok,false);
});

for(const phone of [null,'anonymous','restricted','+442079460000','+14165551234'])test(`prepare preserves customer phone ${phone} without applying third-party validation`,async t=>{
 await pg.exec('BEGIN');t.after(()=>pg.exec('ROLLBACK'));const initial=await seed(pg);
 await pg.query('SELECT prepare_call_conference($1,$2)',[initial.attempt,phone]);
 assert.equal((await pg.query("SELECT phone FROM call_participants WHERE call_id=$1 AND role='customer'",[initial.record])).rows[0].phone,phone);
 await pg.exec('SAVEPOINT invalid_destination');
 await assert.rejects(()=>pg.query("INSERT INTO call_participants(call_id,role,speaker,phone,added_by_agent_id) VALUES($1,'third_party','third_party','anonymous','original')",[initial.record]),/check constraint/);
 await pg.exec('ROLLBACK TO SAVEPOINT invalid_destination');
});
test('unlock only releases the matching call/token, including expired lease replacement',async t=>{
 const h=await harness(t),first=randomUUID(),second=randomUUID();
 const rpc=async(name,token,callId=h.c.call_id)=>(await pg.query(`SELECT ${name}($1,$2) ok`,[callId,token])).rows[0].ok;
 assert.equal(await rpc('lock_call_conference',first),true);
 assert.equal(await rpc('unlock_call_conference',second),false);
 assert.equal(await rpc('unlock_call_conference',first,randomUUID()),false);
 assert.equal(await rpc('unlock_call_conference',null),false);
 await pg.query("UPDATE call_conferences SET operation_until=now()-interval '1 second' WHERE call_id=$1",[h.c.call_id]);
 assert.equal(await rpc('lock_call_conference',second),true);
 assert.equal(await rpc('unlock_call_conference',first),false);
 assert.equal(await rpc('unlock_call_conference',second),true);
 const c=await h.store.get(h.c.call_id);assert.equal(c.operation_token,null);assert.equal(c.operation_until,null);
});
test('every store lock releases through finally on success, thrown action, failed read and lost acquisition response',async t=>{
 const h=await harness(t);
 assert.equal(await h.store.locked(h.c.call_id,async()=>42),42);
 await assert.rejects(()=>h.store.locked(h.c.call_id,async()=>{throw Error('action failed');}),/action failed/);
 const broken=createConferenceStore(db);broken.get=async()=>{throw Error('read failed');};
 await assert.rejects(()=>broken.locked(h.c.call_id,async()=>{}),/read failed/);
 const uncertain=createConferenceStore({...db,async rpc(name,args){const result=await db.rpc(name,args);if(name==='lock_call_conference')throw Error('response lost');return result;}});
 await assert.rejects(()=>uncertain.locked(h.c.call_id,async()=>{}),/response lost/);
 const c=await h.store.get(h.c.call_id);assert.equal(c.operation_token,null);assert.equal(c.operation_until,null);
});
test('legacy writer is unchanged and inbound pre-conference segments remain exactly once after conference finals',async t=>{
 await pg.exec('BEGIN');t.after(()=>pg.exec('ROLLBACK'));const initial=await seed(pg);
 const definition=(await pg.query("SELECT pg_get_functiondef('persist_telephony_transcript(uuid,uuid,text,text,timestamptz,integer,integer)'::regprocedure) definition")).rows[0].definition;
 assert.equal(definition,legacyWriterDefinition);
 await pg.query("SELECT persist_telephony_transcript($1,$2,'customer','Before upgrade',now()-interval '1 minute',0,10)",[initial.attempt,randomUUID()]);
 assert.equal((await pg.query('SELECT participant_id FROM telephony_transcript_segments')).rows[0].participant_id,null);
 await pg.query('SELECT prepare_call_conference($1,$2)',[initial.attempt,'anonymous']);
 const p=(await pg.query("SELECT id FROM call_participants WHERE call_id=$1 AND role='agent'",[initial.record])).rows[0];
 const segment=randomUUID();
 for(let i=0;i<2;i++)await pg.query("SELECT persist_conference_transcript($1,$2,'agent','After upgrade',now(),1000,2000)",[p.id,segment]);
 const record=(await pg.query('SELECT transcript_raw,transcript_diarized,metadata FROM call_records WHERE id=$1',[initial.record])).rows[0];
 assert.equal(record.metadata.conference_prior_transcript,'');
 assert.equal(record.transcript_raw,'CUSTOMER: Before upgrade\nAGENT: After upgrade');
 assert.equal(record.transcript_diarized.length,2);
});
for(const direction of ['inbound','outbound'])for(const callbackFirst of [false,true])test(`${direction}: normal completed callback ${callbackFirst?'before':'after'} finish cannot duplicate completion, effective release or disposition candidate`,async t=>{
 const h=await harness(t,direction);await h.action({action:'dial',mode:'add',phone:'+16095556789'});await h.answer(await h.third());
 const previous=config.conferenceCallingEnabled;config.conferenceCallingEnabled=true;t.after(()=>{config.conferenceCallingEnabled=previous;});
 const guard=conferenceGuard('parent',()=>h.service,async()=>{});
 const response={code:200,status(n){this.code=n;return this;},end(){}};let legacy=0;
 const callback=()=>guard({body:{CallSid:h.initial.parent,CallStatus:'completed',AccountSid:config.twilioAccountSid}},response,()=>{legacy++;});
 if(callbackFirst)await callback();
 await h.service.finish(await h.store.get(h.c.call_id));
 const ended=(await h.store.get(h.c.call_id)).ended_at;
 const successor=sid('CA');await pg.query("UPDATE agent_availability SET active_call_sid=$1,status='busy' WHERE agent_id='original'",[successor]);
 await callback();await callback();await h.service.finish(h.c);
 assert.equal(legacy,0);assert.equal(response.code,204);
 assert.equal(new Date((await h.store.get(h.c.call_id)).ended_at).getTime(),new Date(ended).getTime());
 assert.equal((await pg.query("SELECT count(*)::int n FROM telephony_events WHERE event='call_completed'")).rows[0].n,1);
 assert.equal((await pg.query("SELECT count(*)::int n FROM telephony_events WHERE event='conference_ended'")).rows[0].n,1);
 assert.equal((await pg.query('SELECT coalesce(sum(changed),0)::int n FROM release_observations')).rows[0].n,1);
 if(!callbackFirst)assert.equal((await pg.query('SELECT count(*)::int n FROM release_observations')).rows[0].n,1);
 assert.equal((await pg.query("SELECT count(*)::int n FROM telephony_call_attempts WHERE status='completed' AND answered_at IS NOT NULL AND ended_at IS NOT NULL")).rows[0].n,1);
 assert.equal((await pg.query("SELECT active_call_sid FROM agent_availability WHERE agent_id='original'")).rows[0].active_call_sid,successor);
});

test('US validation rejects international, Canadian, Caribbean, local-format and malformed destinations',()=>{
 assert.equal(validUsPhone('+16095556789'),true);
 for(const phone of ['6095556789','+14165551234','+12425551234','+442079460000','+11111111111','+16095556789;123',null])assert.equal(validUsPhone(phone),false,String(phone));
});
test('outbound conversion adopts the canonical session record even before the browser has linked its attempt',async t=>{
 await pg.exec('BEGIN');t.after(()=>pg.exec('ROLLBACK'));
 const initial=await seed(pg,'outbound');await pg.query('UPDATE telephony_call_attempts SET call_record_id=NULL WHERE id=$1',[initial.attempt]);
 const twilio=provider(initial),store=createConferenceStore(db),service=createConferenceService({store,client:twilio.client,settings});
 const call={...initial.call,call_record_id:null};
 const c=await service.upgrade(call,'+16095551234');
 assert.equal(c.call_id,initial.record);
 await service.upgrade({...call,call_record_id:initial.record},'+16095551234');
 assert.equal((await store.participants(c.call_id)).length,2);
 assert.equal((await pg.query('SELECT count(*)::int n FROM call_records')).rows[0].n,1);
});

async function route(router,path,body={}, {subject='user',signed=true,query={}}={}){
 const entry=router.stack.find(layer=>layer.route?.path===path);
 assert.ok(entry,path);
 const req={body,query,subject,signed,header:()=>'',originalUrl:path};
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;},type(){return this;},end(){return this;}};
 const handlers=entry.route.stack.map(layer=>layer.handle);
 const next=async index=>{if(handlers[index])return handlers[index](req,res,()=>next(index+1));};
 await next(0);return res;
}
const routerFor=(h,options={})=>createConferenceRouter({service:h.service,settings,
 authenticate:async(req,res)=>{if(!req.subject){res.status(401).end();return null;}return {sub:req.subject,org_id:'org'};},
 signature:(req,res,next)=>req.signed?next():res.status(403).end(),...options});

test('API: verified membership/tenant owns controls; disabled switch rejects new dials without calling Twilio',async t=>{
 const h=await harness(t),router=routerFor(h);
 assert.equal((await route(router,'/api/voice/conference-action',{callId:h.c.call_id,action:'dial',mode:'add',phone:'+16095556789'},{subject:null})).code,401);
 assert.equal((await route(router,'/api/voice/conference-action',{callId:h.c.call_id,action:'dial',mode:'add',phone:'+16095556789'},{subject:'unknown'})).code,403);
 assert.equal((await route(router,'/api/voice/conference-action',{callId:h.c.call_id,action:'dial',mode:'add',phone:'+16095556789'},{subject:'receiver-user'})).code,403);
 const disabled=routerFor(h,{settings:{...settings,conferenceCallingEnabled:false}});
 assert.equal((await route(disabled,'/api/voice/conference-capabilities')).data.enabled,false);
 assert.equal((await route(disabled,'/api/voice/conference-action',{callId:h.c.call_id,action:'dial',mode:'add',phone:'+16095556789'})).code,409);
 assert.equal(h.twilio.operations.length,0);
});
test('API: signed callbacks reject wrong account/participant; completed callbacks reconcile once',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});const p=await h.third(),router=routerFor(h);
 const body={AccountSid:settings.twilioAccountSid,CallSid:p.twilio_call_sid,CallStatus:'ringing'};
 assert.equal((await route(router,'/twilio/conference/status',body,{signed:false,query:{participantId:p.id}})).code,403);
 assert.equal((await route(router,'/twilio/conference/status',{...body,AccountSid:sid('AC')},{query:{participantId:p.id}})).code,403);
 assert.equal((await route(router,'/twilio/conference/status',{...body,CallSid:sid('CA')},{query:{participantId:p.id}})).code,403);
 assert.equal((await route(router,'/twilio/conference/status',body,{query:{participantId:p.id}})).code,204);
});
test('watchdog sends unanswered blind target and unanswered return invite to bounded fallback without callbacks',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'blind',phone:'+16095556789'});
 h.advance(36000);await h.service.tick();assert.equal((await h.store.get(h.c.call_id)).phase,'recovering');
 h.advance(36000);await h.service.tick();assert.equal((await h.store.get(h.c.call_id)).phase,'voicemail');
 assert.equal((await h.people()).filter(p=>p.role!=='customer'&&p.status!=='left').length,0);
});
test('original agent departure during a ringing warm consult cancels target and sends the customer to voicemail',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'warm',phone:'+16095556789'});
 const target=await h.third();h.twilio.calls.get(h.initial.child).status='completed';
 const agent=(await h.people()).find(p=>p.role==='agent');await h.service.status(agent.id,{CallSid:agent.twilio_call_sid,CallStatus:'completed'});
 assert.equal((await h.store.get(h.c.call_id)).phase,'voicemail');
 assert.equal(h.twilio.calls.get(target.twilio_call_sid).status,'canceled');
});
test('receiving agent can add another person after completed internal handoff and original agent departure',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'warm',targetAgentId:'receiver'});const receiver=await h.answer(await h.third());
 await h.action({action:'warm_complete'});await h.action({action:'leave'});
 assert.equal((await h.store.participant(receiver.id)).role,'agent');
 assert.equal((await h.store.participant(receiver.id)).speaker,'third_party');
 await h.action({action:'dial',mode:'add',phone:'+16095556789',actor:'receiver'});
 assert.equal((await h.people()).filter(p=>p.status!=='left').length,3);
});
test('flag-off still exposes cleanup for a draining conference while rejecting new participants',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});
 const disabled=routerFor(h,{settings:{...settings,conferenceCallingEnabled:false}});
 const status=await route(disabled,'/api/voice/conference-status',{callId:h.c.call_id});
 assert.equal(status.data.enabled,false);assert.equal(status.data.conference.callId,h.c.call_id);
 assert.equal((await route(disabled,'/api/voice/conference-action',{callId:h.c.call_id,action:'end'})).code,200);
});
test('legacy Dial guard joins the persisted conference without finalizing; unconverted calls retain the original handler',async t=>{
 const h=await harness(t),previous=config.conferenceCallingEnabled;config.conferenceCallingEnabled=true;t.after(()=>{config.conferenceCallingEnabled=previous;});
 let forwarded=0;const response={code:200,type(){return this;},status(code){this.code=code;return this;},end(){},send(body){this.body=body;}};
 const guard=conferenceGuard('dial',()=>h.service);
 await guard({body:{CallSid:sid('CA')}},response,()=>{forwarded++;});assert.equal(forwarded,1);
 await guard({body:{CallSid:h.initial.parent,AccountSid:config.twilioAccountSid}},response,()=>{forwarded++;});
 assert.match(response.body,/<Conference/);assert.equal(forwarded,1);assert.equal((await h.store.get(h.c.call_id)).ended_at,null);
});
test('Media WebSocket: isolated inbound tracks retain three speaker identities and continue after original agent leaves',async t=>{
 const h=await harness(t);await h.action({action:'dial',mode:'add',phone:'+16095556789'});await h.answer(await h.third());
 const tracks=[],events=[],clients=[];
 const mediaDb={...db,rpc(name,args){const pending=db.rpc(name,args);pending.abortSignal=()=>pending;return pending;}};
 const media=createConferenceMedia({db:mediaDb,settings,notify:(_agent,message)=>events.push(message),
  openTrack:({speaker,notify})=>{const track={speaker,notify,chunks:[],send(chunk){this.chunks.push(chunk);},close(){this.closed=true;}};tracks.push(track);return track;}});
 const server=createServer();server.on('upgrade',media.handleUpgrade);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 h.cleanup.push(async()=>{for(const ws of clients)ws.terminate();for(const ws of media.wss.clients)ws.terminate();await new Promise(resolve=>media.wss.close(resolve));await new Promise(resolve=>server.close(resolve));});
 const until=async check=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected media result');};
 const c=await h.store.get(h.c.call_id);
 for(const p of await h.people()){
  const path=new URL(conferenceStreamUrl({...p,...c,id:p.id},settings)).pathname;
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}${path}`);clients.push(ws);await once(ws,'open');
  const stream=sid('MZ');ws.stream=stream;
  ws.send(JSON.stringify({event:'start',streamSid:stream,start:{streamSid:stream,callSid:p.twilio_call_sid,accountSid:settings.twilioAccountSid,
   customParameters:{agentId:c.owner_agent_id,attemptId:c.attempt_id},tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
 }
 await until(()=>tracks.length===3);assert.deepEqual(new Set(tracks.map(track=>track.speaker)),new Set(['agent','customer','third_party']));
 await h.action({action:'leave'});
 const track=tracks.find(item=>item.speaker==='third_party');
 const thirdIndex=(await h.people()).findIndex(item=>item.role==='third_party');
 const ws=clients[thirdIndex];ws.send(JSON.stringify({event:'media',streamSid:ws.stream,media:{track:'inbound',payload:'////',timestamp:'200'}}));
 await until(()=>track.chunks.length===1);
 track.notify({type:'transcript',speaker:'third_party',isFinal:true,text:'Distinct third speaker',timestamp:Date.now(),startMs:200,endMs:300});
 await until(async()=>Boolean((await pg.query('SELECT transcript_raw FROM call_records WHERE id=$1',[h.c.call_id])).rows[0].transcript_raw?.includes('THIRD_PARTY: Distinct third speaker')));
 assert.equal(track.closed,undefined);assert.equal(events.some(message=>message.speaker==='third_party'),true);
});
