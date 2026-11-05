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

const { processRecording } = await import('../src/recordings.js');
const { recordingWav } = await import('../../tests/helpers/recordingWav.js');
for (const failure of ['oversize', '413', '503']) test(`recording ${failure}: size failures stop retries while transient failures retry`, async () => {
 const updates=[];let uploads=0;
 const job={id:'job',lease_token:'lease',attempts:10,account_sid:'AC'+'a'.repeat(32),recording_sid:'RE'+'b'.repeat(32),recording_channels:2,tenant_id:'tenant',parent_call_sid:'call'};
 const db={from:()=>({update(fields){updates.push(fields);return this;},eq(){return this;},select:async()=>({data:[{id:'job'}]})}),storage:{from:()=>({upload:async(_path,_stream,options)=>{
  uploads++;assert.ok(Number(options.headers['Content-Length'])>0);
  return {error:{status:400,statusCode:failure}};
 }})}};
 const wav=recordingWav();
 const result=await processRecording({db,job,config:{twilioAccountSid:job.account_sid,recordingStorageMaxBytes:1024},
  fetchImpl:async()=>new Response(wav,{headers:{'content-length':failure==='oversize'?'2048':String(wav.length)}}),log:()=>{}});
 assert.equal(result,failure==='503'?'retry':'failed');
 assert.equal(uploads,failure==='oversize'?0:1);
 assert.equal(updates.at(-1).last_error_code,failure==='oversize'?'recording_too_large':failure==='413'?'storage_object_too_large':'storage_upload_failed');
});
