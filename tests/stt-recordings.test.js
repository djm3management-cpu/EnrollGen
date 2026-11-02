import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { recordingWav } from './helpers/recordingWav.js';
import { processRecording, deleteVerifiedTwilioRecording } from '../telephony/src/recordings.js';
const wav=recordingWav(), account='AC'+'1'.repeat(32), recording='RE'+'2'.repeat(32);
const config={twilioAccountSid:account,twilioAuthToken:'fixture',deleteTwilioRecordingsAfterCopy:true};
function fixture({badCopy=false,missing=false,lostLease=false,deleteStatus=204}={}){
  const events=[], logs=[], objects=new Map();
  const job={id:randomUUID(),lease_token:randomUUID(),attempts:1,account_sid:account,recording_sid:recording,
    tenant_id:randomUUID(),parent_call_sid:'CA'+'3'.repeat(32),direction:'inbound',recording_channels:2};
  const row={...job};
  const db={storage:{from(bucket){assert.equal(bucket,'call-recordings');return {
    async upload(path,stream,options){assert.equal(options.upsert,false);events.push('upload');
      if(objects.has(path))return {error:{statusCode:'409'}};
      const chunks=[];for await(const chunk of stream)chunks.push(chunk);objects.set(path,Buffer.concat(chunks));return {};},
    async download(path){events.push('verify');const bytes=objects.get(path);return missing||!bytes ? {error:{message:'missing'}} : {data:new Blob([badCopy?Buffer.alloc(bytes.length):bytes])};},
  };}},from(table){assert.equal(table,'recording_ingestion');return {update(values){
    const query={eq(){return query;},select(){return query;},then(resolve,reject){
      events.push(values.copy_status==='stored'?'stored':values.twilio_deleted_at?'deleted':values.twilio_delete_attempted_at?'verified':'update');
      if(!lostLease)Object.assign(row,values);
      return Promise.resolve({data:lostLease?[]:[{id:job.id}]}).then(resolve,reject);
    }};return query;
  }};}};
  const fetchImpl=async(_url,options)=>{
    if(options.method==='DELETE'){events.push('DELETE');return new Response(null,{status:deleteStatus});}
    events.push('download');return new Response(wav,{headers:{'content-length':String(wav.length)}});
  };
  return {db,job,row,events,logs,objects,fetchImpl,log:line=>logs.push(JSON.parse(line))};
}
test('recording deletion follows immutable upload, byte/checksum verification and durable copy metadata',async()=>{
  const f=fixture();assert.equal(await processRecording({...f,config}),'stored');
  assert.deepEqual(f.events,['download','upload','verify','stored','verify','verified','DELETE','deleted']);
  assert.ok(f.row.copy_verified_at);assert.ok(f.row.twilio_deleted_at);assert.ok(f.row.twilio_delete_attempted_at);
  assert.ok(Date.parse(f.row.retention_until)>Date.now()+9.99*365*86400000);
  assert.equal(f.objects.size,1);assert.deepEqual([...f.objects.values()][0],wav);
});
test('deletion flag defaults off and stored audio remains untouched',async()=>{
  const f=fixture();await processRecording({...f,config:{twilioAccountSid:account,twilioAuthToken:'fixture'}});
  assert.equal(f.row.copy_status,'stored');assert.ok(f.row.copy_verified_at);
  assert.ok(!f.events.includes('DELETE'));assert.equal(f.row.twilio_deleted_at,undefined);
});
test('missing or corrupted Storage copies preserve Twilio and log recording SID',async()=>{
  for(const options of [{missing:true},{badCopy:true}]){
    const f=fixture(options);assert.equal(await processRecording({...f,config}),'retry');
    assert.ok(!f.events.includes('DELETE'));assert.equal(f.logs[0].recording_sid,recording);
    assert.match(f.row.last_error_code,/storage_(verification_failed|checksum_mismatch)/);
  }
});
test('size mismatch, lost lease, and an immutable pre-existing object cannot authorize deletion',async()=>{
  const f=fixture();const path=`${f.job.tenant_id}/${f.job.parent_call_sid}/${recording}.wav`;
  f.objects.set(path,Buffer.from('short'));
  assert.equal(await processRecording({...f,config}),'retry');assert.ok(!f.events.includes('DELETE'));
  assert.equal(f.objects.get(path).toString(),'short');
  const lost=fixture({lostLease:true});assert.equal(await processRecording({...lost,config}),'lease_lost');
  assert.ok(!lost.events.includes('DELETE'));
});
test('failed provider DELETE retries independently without overwriting or reuploading Supabase audio',async()=>{
  const f=fixture({deleteStatus:503});assert.equal(await processRecording({...f,config}),'stored');
  assert.equal(f.row.copy_status,'stored');assert.equal(f.row.twilio_delete_error,'twilio_delete_http_503');
  const uploads=f.events.filter(e=>e==='upload').length;
  const success=await deleteVerifiedTwilioRecording({...f,job:f.row,config,fetchImpl:async(_url,options)=>{
    assert.equal(options.method,'DELETE');return new Response(null,{status:204});
  }});
  assert.equal(success,true);assert.ok(f.row.twilio_deleted_at);assert.equal(f.events.filter(e=>e==='upload').length,uploads);
  assert.equal(await deleteVerifiedTwilioRecording({...f,job:f.row,config}),false);
});
test('retry after provider DELETE and lost acknowledgment treats 404 as absent only after re-verification',async()=>{
  const f=fixture();const path=`${f.job.tenant_id}/${f.job.parent_call_sid}/${recording}.wav`;
  f.objects.set(path,wav);Object.assign(f.row,{copy_status:'stored',storage_path:path,stored_bytes:wav.length,sha256:createHash('sha256').update(wav).digest('hex')});
  assert.equal(await deleteVerifiedTwilioRecording({...f,job:f.row,config,fetchImpl:async()=>new Response(null,{status:404})}),true);
  assert.ok(f.row.twilio_deleted_at);
});
