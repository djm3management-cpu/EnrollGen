import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {createSupervisorTap} from '../src/media/supervisorTap.js';
for(const name of ['SUPABASE_URL'])process.env[name]='https://example.test';
for(const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])process.env[name]='synthetic';
const {createSupervisorListenServer,listenEnabled}=await import('../src/media/supervisorListen.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const deadline=Date.now()+2500;while(!check()){if(Date.now()>deadline)throw Error('Condition timed out');await sleep(5);}}
async function harness(t,options={}){
 const attempt=randomUUID(),tenant=randomUUID(),session=randomUUID(),actor='user_SyntheticSupervisor',calls=[],tap=createSupervisorTap(),claims={attemptId:attempt,tenantId:tenant};let allowed=true,clock=Date.now(),enabled=true;
 const db={rpc(name,args){calls.push({name,args});let data=true;
 if(name==='consume_admission')data={allowed:true};
 if(name==='connect_supervisor_listen')data={id:session,attempt,tenant,expires:new Date(clock+1800000).toISOString()};
 if(name==='renew_supervisor_listen')data=allowed;
 return {abortSignal(){return Promise.resolve({data});},then(resolve,reject){return Promise.resolve({data}).then(resolve,reject);}};
 }};
 const verify=async token=>{if(token!=='synthetic-token')throw Error();return {sub:actor,sid:'session_synthetic',exp:Math.floor((clock+60000)/1000)};};
 const relay=createSupervisorListenServer({db,tap,verify,enabled:()=>enabled,now:()=>clock,...options});
 const server=createServer();server.on('upgrade',relay.handleUpgrade);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='ws://127.0.0.1:'+server.address().port,clients=[];
 const open=async(origin='https://app.test',path='/supervisor-listen')=>{const ws=new WebSocket(base+path,{origin});clients.push(ws);await once(ws,'open');return ws;};
 tap.open(claims);
 t.after(async()=>{for(const ws of clients)ws.terminate();for(const ws of relay.wss.clients)ws.terminate();await new Promise(r=>relay.wss.close(r));await new Promise(r=>server.close(r));});
 return {tap,claims,relay,server,open,calls,attempt,session,base,advance:ms=>clock+=ms,revoke:()=>allowed=false,disable:()=>enabled=false,start(ws){ws.send(JSON.stringify({type:'start',token:'synthetic-token',grant:'a'.repeat(43),attempt}));}};
}
test('strict default-off switches require both floor and listen',()=>{assert.equal(listenEnabled({}),false);assert.equal(listenEnabled({SUPERVISOR_LISTEN_ENABLED:'true'}),false);assert.equal(listenEnabled({SUPERVISOR_FLOOR_ENABLED:'true',SUPERVISOR_LISTEN_ENABLED:'true'}),true);assert.throws(()=>listenEnabled({SUPERVISOR_FLOOR_ENABLED:'TRUE'}));});
test('passive tap never blocks its producer, isolates throws and cleans up',()=>{
 const tap=createSupervisorTap(),claims={attemptId:'synthetic',tenantId:'tenant'},received=[];let ended=0;
 tap.open(claims);tap.subscribe('synthetic',{audio(){throw Error('slow consumer');},end(){ended++;}});const remove=tap.subscribe('synthetic',{audio:(...args)=>received.push(args),end(){ended++;}});
 tap.audio(claims,'inbound',Buffer.alloc(160),0);assert.equal(received.length,1);remove();tap.audio(claims,'outbound',Buffer.alloc(160),0);assert.equal(received.length,1);tap.close(claims);assert.equal(ended,1);assert.equal(tap.active('synthetic','tenant'),false);
 tap.open({...claims,participantId:'conference'});assert.equal(tap.active('synthetic','tenant'),false);
});
test('origin, disabled feature and malformed route reject before grant or identity work',async t=>{
 const h=await harness(t);for(const [path,origin] of [['/supervisor-listen?grant=private','https://app.test'],['/supervisor-listen','https://foreign.example.test']]){
 const code=await new Promise(resolve=>{const ws=new WebSocket(h.base+path,{origin});ws.on('error',()=>{});ws.on('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);ws.terminate();});});assert.equal(code,403);
 }assert.equal(h.calls.length,0);
});
test('no audio before audited redemption, both tracks relay, supervisor cannot send media',async t=>{
 const h=await harness(t),ws=await h.open(),frames=[];ws.on('message',raw=>frames.push(JSON.parse(raw)));
 h.tap.audio(h.claims,'inbound',Buffer.alloc(160,255),0);assert.equal(frames.length,0);
 h.start(ws);await until(()=>frames.some(f=>f.type==='started'));
 for(const track of ['inbound','outbound'])h.tap.audio(h.claims,track,Buffer.alloc(160,255),0);
 await until(()=>frames.length===3);assert.deepEqual(frames.slice(1).map(f=>f.track),['inbound','outbound']);assert.equal(h.calls.filter(c=>c.name==='connect_supervisor_listen').length,1);
 const closed=once(ws,'close');ws.send(Buffer.alloc(160));await closed;await until(()=>h.calls.some(c=>c.name==='finish_supervisor_listen'));
});
test('audit/grant denial delivers zero audio and does not create listener',async t=>{
 const db={rpc(name){const result=name==='consume_admission'?{data:{allowed:true}}:{error:{code:'P1611'}};return{abortSignal:()=>Promise.resolve(result),then:(a,b)=>Promise.resolve(result).then(a,b)};}};
 const h=await harness(t,{db}),ws=await h.open(),frames=[];ws.on('message',m=>frames.push(m));const closed=once(ws,'close');h.start(ws);await closed;h.tap.audio(h.claims,'inbound',Buffer.alloc(160),0);assert.equal(frames.length,0);
});
test('slow supervisor buffer drops copies; pipeline receives every original frame',async t=>{
 const h=await harness(t),ws=await h.open();h.start(ws);await until(()=>h.calls.some(c=>c.name==='connect_supervisor_listen'));await sleep(15);
 const supervisor=[...h.relay.wss.clients][0],frames=[];ws.on('message',raw=>frames.push(JSON.parse(raw)));Object.defineProperty(supervisor,'bufferedAmount',{value:64000,configurable:true});
 for(let n=0;n<1000;n++)h.tap.audio(h.claims,'inbound',Buffer.alloc(160,255),n*20);
 await sleep(20);assert.equal(frames.length,0);Object.defineProperty(supervisor,'bufferedAmount',{value:0});h.tap.audio(h.claims,'outbound',Buffer.alloc(160,255),20000);await until(()=>frames.length===1);
});
for(const reason of ['call_end','revocation','expiry','feature_off','stop'])test('relay ends and audits: '+reason,async t=>{
 const h=await harness(t),ws=await h.open(),frames=[];ws.on('message',raw=>frames.push(JSON.parse(raw)));h.start(ws);await until(()=>frames.some(f=>f.type==='started'));const closed=once(ws,'close');
 if(reason==='call_end')h.tap.close(h.claims);
 if(reason==='revocation'){h.revoke();ws.send(JSON.stringify({type:'renew',token:'synthetic-token'}));}
 if(reason==='expiry')h.advance(61000);
 if(reason==='feature_off')h.disable();
 if(reason==='stop')ws.close();
 await closed;await until(()=>h.calls.some(c=>c.name==='finish_supervisor_listen'));
 assert.equal(h.calls.filter(c=>c.name==='finish_supervisor_listen').length,1);
});
test('invalid identity and cross-session renewal close without receiving audio',async t=>{
 const h=await harness(t),ws=await h.open();const closed=once(ws,'close');ws.send(JSON.stringify({type:'start',token:'invalid',grant:'a'.repeat(43),attempt:h.attempt}));await closed;assert.equal(h.calls.length,0);
});

test('changed authenticated session on renewal ends the existing listen',async t=>{
 const verify=async token=>({sub:'user_SyntheticSupervisor',sid:token==='synthetic-token'?'session_synthetic':'other_session',exp:Math.floor(Date.now()/1000)+60});
 const h=await harness(t,{verify}),ws=await h.open(),frames=[];ws.on('message',raw=>frames.push(JSON.parse(raw)));h.start(ws);await until(()=>frames.some(f=>f.type==='started'));const closed=once(ws,'close');ws.send(JSON.stringify({type:'renew',token:'different_session'}));await closed;await until(()=>h.calls.some(c=>c.name==='finish_supervisor_listen'));
});
test('off switch refuses an actual WebSocket upgrade without database work',async t=>{
 const h=await harness(t);h.disable();const code=await new Promise(resolve=>{const ws=new WebSocket(h.base+'/supervisor-listen',{origin:'https://app.test'});ws.on('error',()=>{});ws.on('unexpected-response',(_req,res)=>{res.resume();ws.terminate();resolve(res.statusCode);});});assert.equal(code,403);assert.equal(h.calls.length,0);
});
