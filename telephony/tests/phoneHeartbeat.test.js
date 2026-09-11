import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
for (const name of ['PUBLIC_BASE_URL','SUPABASE_URL']) process.env[name]='https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET']) process.env[name]='test';
const {attachPhonePresence}=await import('../src/phonePresence.js');
function harness(rpc) {
  const ws=new EventEmitter(); ws.OPEN=1; ws.readyState=1;
  ws.send=()=>{}; ws.ping=()=>{};
  ws.terminate=()=>{ws.readyState=3;ws.emit('close');};
  let tick; let cleared=false; const writes=[];
  const presence=attachPhonePresence(ws,'a',{
    rpc:rpc || (async(_name,args)=>{writes.push(args.p_ready);return {};}),
    interval:fn=>{tick=fn;return {};},clear:()=>{cleared=true;},
  });
  return {ws,writes,presence,tick:()=>tick(),cleared:()=>cleared};
}
test('socket without registered phone never renews an available lease',async()=>{
  const h=harness(); h.ws.emit('pong'); await h.presence.settled();
  assert.deepEqual(h.writes,[]);
  h.ws.emit('message',JSON.stringify({type:'phone-ready',ready:true}));
  await h.presence.settled(); h.ws.emit('pong'); await h.presence.settled();
  assert.deepEqual(h.writes,[true,true]);
});
test('missing pong terminates socket and closes presence session',async()=>{
  const h=harness();h.ws.emit('message',JSON.stringify({type:'phone-ready',ready:true}));
  await h.presence.settled(); h.tick(); h.tick(); await h.presence.settled();
  assert.equal(h.ws.readyState,3); assert.equal(h.cleared(),true);
  assert.deepEqual(h.writes,[true,false]);
});
test('close is serialized after in-flight heartbeat and cannot be undone by late pong',async()=>{
  const writes=[];let finish;
  const h=harness(async(_name,args)=>{
    if(args.p_ready) await new Promise(resolve=>{finish=resolve;});
    writes.push(args.p_ready);return {};
  });
  h.ws.emit('message',JSON.stringify({type:'phone-ready',ready:true}));
  await Promise.resolve();h.ws.terminate();h.ws.emit('pong');finish();
  await h.presence.settled(); assert.deepEqual(writes,[true,false]);
});
