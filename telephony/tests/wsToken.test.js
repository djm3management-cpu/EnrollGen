import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import {createServer} from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import { createHmac } from 'node:crypto';
for(const name of ['PUBLIC_BASE_URL','SUPABASE_URL'])process.env[name]='https://example.test';
for(const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])process.env[name]='fixture';
const {mintAgentWsToken,verifyAgentWsToken,inspectAgentWsToken}=await import('../src/wsToken.js');
const {mintMediaStreamToken}=await import('../src/media/streamToken.js');
const {handleAgentUpgrade,agentWss,sendToAgent}=await import('../src/media/agentSocket.js');
test('existing agent token format and signing remain compatible, with no media purpose change',()=>{
  const token=mintAgentWsToken('mike_shiomos','user_fixture','sess_fixture');
  const [payload,signature]=token.split('.');
  assert.equal(signature,createHmac('sha256','fixture').update(payload).digest('base64url'));
  assert.equal(verifyAgentWsToken(token).agentId,'mike_shiomos');
  assert.equal(inspectAgentWsToken(token,Date.now()+901000).reason,'expired_token');
  assert.equal(inspectAgentWsToken(token+'bad').reason,'signature_mismatch');
  assert.equal(inspectAgentWsToken(null).reason,'missing_token');
  assert.equal(inspectAgentWsToken('invalid').reason,'malformed_token');
  assert.equal(verifyAgentWsToken(mintMediaStreamToken({callSid:'CAfixture',agentId:'mike_shiomos',attemptId:'fixture',tenantId:'fixture',inboundCallId:'fixture'})),null);
});
test('agent rejection logging reports only a safe reason, never the URL or credential',()=>{
  const lines=[],writes=[];const warn=console.warn;console.warn=line=>lines.push(line);
  try{
    for(const token of [null,'secret-token','payload.signature']){
      const url=token?'/agent?token='+token:'/agent';
      handleAgentUpgrade({url},{write:line=>writes.push(line),destroy(){}},Buffer.alloc(0));
    }
  }finally{console.warn=warn;}
  assert.deepEqual(lines,['[agent] rejected: missing_token','[agent] rejected: malformed_token','[agent] rejected: signature_mismatch']);
  assert.ok(writes.every(line=>line.includes('401')));
});

test('rotating the shared server signing secret invalidates old browser credentials but freshly minted tokens work',async()=>{
  const {config}=await import('../src/config.js');const original=config.agentWsSigningSecret;
  const stale=mintAgentWsToken('mike_shiomos','user_fixture','sess_fixture');
  try{
    config.agentWsSigningSecret='new-server-only-fixture-secret';
    assert.equal(inspectAgentWsToken(stale).reason,'signature_mismatch');
    assert.equal(verifyAgentWsToken(mintAgentWsToken('mike_shiomos','user_fixture','sess_fixture')).agentId,'mike_shiomos');
  }finally{config.agentWsSigningSecret=original;}
});

test('valid agent websocket authenticates the owning subject and delivers live transcript messages',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const payload=String(url).includes('/tenant_agents')?[{id:'fixture',agent_slug:'mike_shiomos',clerk_user_id:'user_fixture',is_active:true}]:true;
    assert.ok(String(url).startsWith('https://example.test/rest/v1/'));
    return new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json'}});
  };
  const server=createServer();server.on('upgrade',handleAgentUpgrade);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/agent?token=${mintAgentWsToken('mike_shiomos','user_fixture','sess_fixture')}`);
  try{
    const [connected]=await once(ws,'message');assert.equal(JSON.parse(String(connected)).type,'connected');
    const delivered=once(ws,'message');
    sendToAgent('mike_shiomos',{type:'transcript',speaker:'customer',text:'Fixture speech',isFinal:true});
    assert.equal(JSON.parse(String((await delivered)[0])).text,'Fixture speech');
  }finally{
    const closed=once(ws,'close');ws.close();await closed;
    for(const socket of agentWss.clients)socket.terminate();
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>setTimeout(resolve,5));globalThis.fetch=originalFetch;
  }
});
