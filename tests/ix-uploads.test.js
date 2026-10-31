import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {SunfireIxClient,ixConfiguration,IxError} from '../integrations/ixClient.js';
import {uploadIx,ixMetadata} from '../integrations/ixUploads.js';
const id='00000000-0000-4000-8000-000000000001';
const account='AC'+'a'.repeat(32),parent='CA'+'c'.repeat(32);
const leg=n=>({account_sid:account,recording_sid:'RE'+String(n).repeat(32),callback_call_sid:parent});
const env={IX_USERNAME:'test-user',IX_PASSWORD:'test-password',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'twilio-secret'};
const okAuth=()=>Response.json({username:env.IX_USERNAME,token:'secret-token',expiresIn:100});
const registration=payload=>({callRecordingId:id,recordingUploads:payload.callMetadata.recordings.map(({filename},index)=>({filename,presignedUrl:`https://bucket.s3.amazonaws.com/${index}`,expiresAt:'2099-01-01T00:00:00Z'})).reverse()});
const job={id,call_id:id,confirmation_code:'SF-CODE'};
const twilio=async(url,options)=>url.endsWith('.json')?Response.json({sid:url.split('/').at(-1).slice(0,-5),account_sid:account,call_sid:parent,channels:2,start_time:'2026-10-30T12:00:00Z',duration:'120'}):options?.method==='PUT'?new Response(null,{status:200}):new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});

test('configuration defaults to test with fixed endpoints; production uses only its configured credentials',async()=>{
 assert.equal(ixConfiguration({}).environment,'test');assert.equal(new SunfireIxClient({}).available,false);
 assert.equal(ixConfiguration({IX_ENV:'production'}).authUrl,'https://api.sunfirematrix.com/v2/authenticate');
 assert.equal(ixConfiguration({}).baseUrl,'https://test-api.sunfirematrix.com/api');
 assert.throws(()=>ixConfiguration({IX_ENV:'sandbox'}),/invalid_ix_environment/);
 const urls=[];
 for(const environment of ['test','production']){
  const client=new SunfireIxClient({...env,IX_ENV:environment},{fetchImpl:async(url,options)=>{
   urls.push(url);if(url.endsWith('/authenticate')){assert.deepEqual(JSON.parse(options.body),{username:'test-user',password:'test-password'});return okAuth();}
   assert.equal(options.headers.Authorization,'Bearer secret-token');assert.ok(url.endsWith('/ix/callrecordings/internalenrollment'));return Response.json({callRecordingId:id});
  }});await client.register({sunfireEnrollmentCode:'SF'});
 }
 assert.equal(urls.length,4);assert.match(urls[0],/test-api/);assert.match(urls[2],/\/\/api.sunfire/);
});
test('authentication is cached, concurrent requests share auth, and tokens refresh before expiry',async()=>{
 let time=1000,auth=0;
 const client=new SunfireIxClient(env,{now:()=>time,fetchImpl:async url=>url.endsWith('/authenticate')?(auth++,okAuth()):Response.json({callRecordingId:id})});
 await Promise.all([client.register({}),client.register({})]);assert.equal(auth,1);
 time+=89_000;await client.register({});assert.equal(auth,1);
 time+=1001;await client.register({});assert.equal(auth,2);
});
test('a 401 re-authenticates once and a second 401 is terminal',async()=>{
 for(const secondFails of [false,true]){
  let auth=0,requests=0;
  const client=new SunfireIxClient(env,{fetchImpl:async url=>url.endsWith('/authenticate')?(auth++,okAuth()):++requests===1||secondFails?Response.json({message:'expired'},{status:401}):Response.json({callRecordingId:id})});
  if(secondFails)await assert.rejects(()=>client.register({}),error=>error.message==='ix_http_401'&&error.outcome==='failed');else await client.register({});
  assert.equal(auth,2);assert.equal(requests,2);
 }
});
for(const [status,code,outcome] of [[404,'invalid_sunfire_code','needs_attention'],[409,'duplicate_on_sunfire','duplicate_on_sunfire'],[400,'ix_http_400','failed'],[403,'ix_http_403','failed'],[500,'ix_http_500','retry'],[503,'ix_http_503','retry']]){
 test(`register ${status} has explicit retry/terminal classification and redacts secrets`,async()=>{
  const client=new SunfireIxClient(env,{fetchImpl:async url=>url.endsWith('/authenticate')?okAuth():Response.json({message:`bad ${env.IX_PASSWORD} secret-token https://bucket.s3.amazonaws.com/?secret=1`},{status})});
  await assert.rejects(()=>client.register({}),error=>{assert.equal(error.message,code);assert.equal(error.outcome,outcome);assert.ok(!error.providerMessage.includes(env.IX_PASSWORD));assert.ok(!error.providerMessage.includes('secret-token'));assert.ok(!error.providerMessage.includes('?secret'));return true;});
 });
}
test('network errors retry without exposing request, token or credentials',async()=>{
 const client=new SunfireIxClient(env,{fetchImpl:async()=>{throw Error('secret-password token');}});
 await assert.rejects(()=>client.register({}),error=>error.message==='ix_network_error'&&error.outcome==='retry');
});
for(const status of ['finalized','already_finalized'])test(`finalize accepts ${status} and sends no request body`,async()=>{
 const client=new SunfireIxClient(env,{fetchImpl:async(url,options)=>{
  if(url.endsWith('/authenticate'))return okAuth();assert.equal(url,`https://test-api.sunfirematrix.com/api/ix/callrecordings/${id}/finalize`);assert.equal(options.body,undefined);return Response.json({status});
 }});assert.deepEqual(await client.finalize(id),{status});
});
test('Type A payload matches OpenAPI and omits external-enrollment and applicant fields',()=>{
 const metadata=ixMetadata({lead_source:'Paragon',lead_cost:0,metadata:{lead_channel:'phone',lead_medium:'inbound',campaign_name:'Fall',dateSold:'bad',contract_id:'bad'}},[{filename:'a.mp3',startTime:'2026-10-30T12:00:00.000Z',endTime:'2026-10-30T12:02:00.000Z',account_sid:'private'}]);
 const spec=JSON.parse(readFileSync(new URL('../docs/sunfire-ix-openapi.json',import.meta.url)));
 const allowed=Object.keys(spec.components.schemas.InternalEnrollmentCallMetadata.properties);
 assert.deepEqual(Object.keys(metadata).sort(),allowed.sort());assert.equal(metadata.leadCost,0);assert.equal(metadata.leadSource,'Paragon');
 assert.deepEqual(Object.keys(metadata.recordings[0]),['filename','startTime','endTime']);
 for(const field of ['dateSold','callType','disposition','CarrierName','ApplicantFirstName'])assert.equal(metadata[field],undefined);
});
test('multi-leg MP3 streaming matches out-of-order targets by filename and checkpoints before PUT',async()=>{
 let saved,puts=0,registered=0;
 const client={environment:'test',register:async payload=>{registered++;assert.equal(payload.sunfireEnrollmentCode,'SF-CODE');assert.equal(payload.callMetadata.recordings.length,2);return registration(payload);},finalize:async()=>({status:'finalized'})};
 const receipt=await uploadIx(job,[leg(2),leg(1)],client,{env,checkpoint:async state=>{saved=structuredClone(state);},fetchImpl:async(url,options)=>{
  if(options?.method==='PUT'){
   assert.equal(saved.callRecordingId,id);assert.equal(options.headers['Content-Type'],'audio/mpeg');assert.ok(options.body instanceof ReadableStream);assert.equal(options.headers.Authorization,undefined);
   assert.equal(url,`https://bucket.s3.amazonaws.com/${puts++}`);
  }else if(!url.endsWith('.json'))assert.match(url,/\.mp3\?RequestedChannels=2/);
  return twilio(url,options);
 }});
 assert.equal(registered,1);assert.equal(puts,2);assert.equal(saved.uploadedFilenames.length,2);assert.equal(receipt.callRecordingId,id);
 assert.equal(saved.recordings[0].endTime,'2026-10-30T12:02:00.000Z');
});
test('partial upload and failed finalize resume saved registration without re-registering or re-uploading finished legs',async()=>{
 let saved,registrations=0,puts=0,finalizes=0;
 const client={environment:'test',register:async payload=>{registrations++;return registration(payload);},finalize:async()=>{if(++finalizes===1)throw new IxError('ix_http_500');return {status:'already_finalized'};}};
 let failUpload=true;
 const options={env,checkpoint:async state=>{saved=structuredClone(state);},fetchImpl:async(url,opts)=>{
  if(opts?.method==='PUT'){puts++;if(url.endsWith('/1')&&failUpload){failUpload=false;throw Error('network');}}return twilio(url,opts);
 }};
 await assert.rejects(()=>uploadIx(job,[leg(1),leg(2)],client,options),/network/);assert.equal(saved.uploadedFilenames.length,1);
 await assert.rejects(()=>uploadIx({...job,ix_state:saved},[],client,options),/ix_http_500/);assert.equal(saved.uploadedFilenames.length,2);
 const receipt=await uploadIx({...job,ix_state:saved},[],client,options);
 assert.equal(registrations,1);assert.equal(puts,3);assert.equal(finalizes,2);assert.equal(receipt.status,'already_finalized');
});
test('expired unfinished URLs need attention; finished uploads can finalize after URLs expire',async()=>{
 let saved;
 const payload={callMetadata:{recordings:[{filename:'a.mp3'}]}};
 const state={environment:'test',...registration(payload),recordings:[{filename:'a.mp3',...leg(1)}],uploadedFilenames:[]};
 state.recordingUploads[0].expiresAt='2000-01-01T00:00:00Z';
 const client={environment:'test',register:()=>assert.fail('must not register'),finalize:async()=>({status:'finalized'})};
 const options={env,checkpoint:async value=>{saved=value;},fetchImpl:()=>assert.fail('expired target must not fetch')};
 await assert.rejects(()=>uploadIx({...job,ix_state:state},[],client,options),error=>error.message==='upload_url_expired'&&error.outcome==='needs_attention');
 await uploadIx({...job,ix_state:{...state,uploadedFilenames:['a.mp3']}},[],client,options);assert.equal(saved,undefined);
});
test('saved registration cannot cross environments and malformed targets never cause re-registration',async()=>{
 let saved;
 const client={environment:'production',register:async()=>({callRecordingId:id,recordingUploads:[]})};
 await assert.rejects(()=>uploadIx({...job,ix_state:{environment:'test',callRecordingId:id}},[],client,{checkpoint:async()=>{}}),/ix_environment_mismatch/);
 client.environment='test';
 await assert.rejects(()=>uploadIx(job,[leg(1)],client,{env,fetchImpl:twilio,checkpoint:async value=>{saved=value;}}),/ix_invalid_upload_targets/);
 assert.equal(saved.callRecordingId,id);client.register=()=>assert.fail('must not register');
 await assert.rejects(()=>uploadIx({...job,ix_state:saved},[],client,{env,checkpoint:async()=>{}}),/ix_invalid_upload_targets/);
});
test('dual-channel identity and reliable recording timestamps are required',async()=>{
 for(const changed of [{channels:1},{call_sid:'wrong'},{start_time:null}]){
  await assert.rejects(()=>uploadIx(job,[leg(1)],{environment:'test',register:()=>assert.fail('unverified recording')},{env,checkpoint:async()=>{},fetchImpl:async()=>Response.json({sid:leg(1).recording_sid,account_sid:account,call_sid:parent,channels:2,start_time:'2026-10-30T12:00:00Z',duration:120,...changed})}),/dual_channel|identity_mismatch|times_missing/);
 }
});
