import {assertWhisperRecordingSafe,whisperCustomerRecordings,hasWhisperRecording} from '../../telephony/src/lib/whisperRecording.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {admitCall} from './_admission.js';
import {evidenceCheckpoint} from '../../telephony/src/lib/evidenceAudit.js';
import { featureEnabled, disabledResponse } from '../../telephony/src/lib/deploymentFeatures.js';
import {mediaUrl,twilioHeaders,providerJson,fetchRecordingMedia} from '../../telephony/src/recordings.js';
import {getEvidenceServiceClient,checked,evidenceJson,evidenceFailure} from './_evidenceAccess.js';
import {fillApprovedGaps} from '../lib/manualTranscriptGaps.js';
export const MAX_GAP_RECORDING_BYTES=128*1024*1024;
export async function readBoundedRecording(response) {
 if(Number(response.headers.get('content-length'))>MAX_GAP_RECORDING_BYTES){await response.body?.cancel();throw Error('Recording exceeds recovery download cap');}
 const reader=response.body?.getReader();if(!reader)throw Error('Recording body unavailable');
 const chunks=[];let bytes=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_GAP_RECORDING_BYTES)throw Error('Recording exceeds recovery download cap');chunks.push(value);}}
 catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
 const out=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}return out;
}
export function createGapFillHandler({getDb=getEvidenceServiceClient,transport=fetch,env=process.env}={}){
 return async request=>{
  if(!featureEnabled('TRANSCRIPT_GAP_FILL_ENABLED',env) && !featureEnabled('TRANSCRIPT_AUTO_RECOVERY_ENABLED',env))return disabledResponse('TRANSCRIPT_GAP_FILL_ENABLED');
  if(request.method!=='POST'||!env.SCORE_CALL_JOB_SECRET||request.headers.get('x-enrollgen-job-secret')!==env.SCORE_CALL_JOB_SECRET)return evidenceJson(401,{error:'Unauthorized'});
  let db,job;
  try{
   if(!featureEnabled('TRANSCRIPT_GAP_FILL_ENABLED',env)&&!featureEnabled('TRANSCRIPT_AUTO_RECOVERY_ENABLED',env))throw Error('Gap fill disabled');
   const input=await request.json();db=getDb();
   // A durable admin approval or bounded automatic reservation authorizes usage.
   const pending=checked(await db.from('manual_transcript_gap_fills').select('mode').eq('id',input.job_id).eq('status','queued').maybeSingle());
   const modeFlag=pending?.mode==='automatic'?'TRANSCRIPT_AUTO_RECOVERY_ENABLED':'TRANSCRIPT_GAP_FILL_ENABLED';
   if(!featureEnabled(modeFlag,env))return disabledResponse(modeFlag);
   const claimed=checked(await db.from('manual_transcript_gap_fills').update({status:'processing'}).eq('id',input.job_id).eq('status','queued').select('*'));
   if(claimed.length!==1)throw Error('Gap job already consumed');job=claimed[0];
   if(!featureEnabled(job.mode==='automatic'?'TRANSCRIPT_AUTO_RECOVERY_ENABLED':'TRANSCRIPT_GAP_FILL_ENABLED',env))throw Error('Gap job mode disabled');
   const recording=checked(await db.from('recording_ingestion').select('*').eq('id',job.recording_id).eq('tenant_id',job.tenant_id).single());
   if(recording.call_record_id!==job.call_id)throw Error('Recording call mismatch');
   const admissionCall=checked(await db.from('call_records').select('*').eq('id',job.call_id).eq('tenant_id',job.tenant_id).single());
   admissionCall.id=job.call_id;
   const customers=await whisperCustomerRecordings(db,admissionCall);
   assertWhisperRecordingSafe(admissionCall,recording,customers);
   if(hasWhisperRecording(admissionCall) && JSON.stringify(job.channel_speakers)!==JSON.stringify(['customer','agent']))throw Error('Recording channel mapping mismatch');
   if(hasWhisperRecording(admissionCall) && job.timeline_offset_ms!==Math.max(0,Math.round(Date.parse(recording.provider_created_at)-Date.parse(admissionCall.call_start))))throw Error('Recording timeline mapping mismatch');
   await admitCall(db,"transcription",admissionCall);
   if(recording.stored_bytes>MAX_GAP_RECORDING_BYTES)throw Error('Recording exceeds recovery download cap');
   await evidenceCheckpoint(db,{actor:'service:transcript_recovery',tenant:job.tenant_id,resource:'recording',resourceId:recording.id,action:'read',grantId:job.id});
   let audio;
   if(recording.storage_path){
    if(!recording.storage_path.startsWith(`${job.tenant_id}/`)||recording.storage_path.split('/').includes('..'))throw Error('Invalid recording path');
    const blob=checked(await db.storage.from('call-recordings').download(recording.storage_path));if(blob.size>MAX_GAP_RECORDING_BYTES)throw Error('Recording exceeds recovery download cap');audio=await blob.arrayBuffer();
   }else{
    if(recording.account_sid!==env.TWILIO_ACCOUNT_SID||!/^RE[0-9a-f]{32}$/i.test(recording.recording_sid))throw Error('Recording account mismatch');
    const config={twilioAccountSid:env.TWILIO_ACCOUNT_SID,twilioAuthToken:env.TWILIO_AUTH_TOKEN};
    const metadata=await transport(`https://api.twilio.com/2010-04-01/Accounts/${recording.account_sid}/Recordings/${recording.recording_sid}.json`,{headers:twilioHeaders(config),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!metadata.ok)throw Error('Recording metadata unavailable');const verified=await providerJson(metadata);
    if(verified.call_sid!==(recording.callback_call_sid||recording.expected_call_sid)||verified.account_sid!==env.TWILIO_ACCOUNT_SID)throw Error('Recording call mismatch');
    const media=await fetchRecordingMedia(mediaUrl(recording.account_sid,recording.recording_sid,job.channel_speakers.length),config,{signal:AbortSignal.timeout(120000)},transport);
    if(!media.ok)throw Error('Recording unavailable');audio=await readBoundedRecording(media);
   }
   await fillApprovedGaps({db,job,audio,env,transcribe:async(bytes,channels)=>{
    const query=new URLSearchParams({model:'nova-2',utterances:'true',punctuate:'true',smart_format:'true',multichannel:String(channels===2),diarize:'true'});
    const response=await transport(`https://api.deepgram.com/v1/listen?${query}`,{method:'POST',headers:{Authorization:`Token ${env.DEEPGRAM_API_KEY}`,'Content-Type':'audio/wav'},body:bytes,signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error(`Gap transcription HTTP ${response.status}`);return response.json();
   }});
   checked(await db.from('manual_transcript_gap_fills').update({status:'complete'}).eq('id',job.id));
   return evidenceJson(200,{job_id:job.id});
  }catch(error){if(db&&job)await db.from('manual_transcript_gap_fills').update({status:'failed',error:'gap_processing_failed'}).eq('id',job.id);return evidenceFailure(error);}
 };
}
export default serverRequest('transcript-gaps-background',createGapFillHandler());
