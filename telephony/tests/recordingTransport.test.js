import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
for(const name of ['PUBLIC_BASE_URL','SUPABASE_URL'])process.env[name]='https://example.test';
for(const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])process.env[name]='fixture';
const {config}=await import('../src/config.js');
const {createRecordingServiceClient}=await import('../src/supabase.js');
test('actual Supabase Storage SDK upload uses the bounded HTTP transport',async t=>{
  const originalFetch=globalThis.fetch;const originalTimeout=config.recordingTimeoutMs;
  t.after(()=>{globalThis.fetch=originalFetch;config.recordingTimeoutMs=originalTimeout;});config.recordingTimeoutMs=10;
  let signal;
  globalThis.fetch=async(_url,options)=>{
    signal=options.signal;assert.ok(signal);await new Promise((resolve,reject)=>{
      const keepAlive=setTimeout(resolve,100);signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason);},{once:true});
    });return Response.json({id:'fixture'});
  };
  const result=await createRecordingServiceClient().storage.from('call-recordings').upload('fixture.wav',Buffer.from('fixture'));
  assert.ok(result.error);assert.equal(signal.aborted,true);
});
