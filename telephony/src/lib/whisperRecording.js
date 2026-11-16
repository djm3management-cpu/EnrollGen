// The permanent call marker is independent of the admission switches. Only the
// service-owned customer participant's per-call recording can leave the agency.
const checked = ({data,error}) => { if(error)throw Error('Recording safety unavailable');return data; };
export const hasWhisperRecording = call => call?.metadata?.supervisor_whisper === true;
export class WhisperRecordingHold extends Error {
 constructor(){super('whisper_customer_recording_required');this.status=409;}
}
export function assertWhisperRecordingSafe(call, recording, customers = []) {
 if(hasWhisperRecording(call) && !customers.some(r => r.id === recording?.id && r.recording_sid === recording?.recording_sid))
  throw Object.assign(new Error('Whisper recording cannot be transcribed.'),{status:409});
}
export async function whisperCustomerRecordings(db, call) {
 if(!hasWhisperRecording(call))return [];
 return checked(await db.rpc('whisper_customer_recordings',{p_call:call.id,p_tenant:call.tenant_id})) || [];
}
export async function holdWhisperUpload(db,call) {
 checked(await db.rpc('hold_whisper_upload',{p_call:call.id,p_tenant:call.tenant_id}));
 throw new WhisperRecordingHold();
}
export async function outsideRecordings(db,call,recordings) {
 if(!hasWhisperRecording(call))return recordings;
 call=checked(await db.from('call_records').select('*').eq('id',call.id).eq('tenant_id',call.tenant_id).single());
 const safe=await whisperCustomerRecordings(db,call);
 if(!safe.length)return holdWhisperUpload(db,call);
 if(call.metadata?.whisper_upload_hold?.held===true)throw new WhisperRecordingHold();
 const chosen=call.metadata?.whisper_upload_hold?.recording_id;
 const selected=chosen?safe.filter(r=>r.id===chosen):safe;
 if(!selected.length)return holdWhisperUpload(db,call);
 return selected;
}
// Resolve again at capability mint/redemption; an older ticket or cached job must
// not bypass a marker applied after it was created. Never trust browser metadata.
export async function whisperCallForRecording(db,row) {
 if(!row.tenant_id)return null;
 let callId=row.call_record_id;
 if(!callId){
  const id=row.recording_id || row.id;
  if(/^legacy:[a-f0-9-]{36}$/i.test(id||''))callId=id.slice(7);
  else {
   const key=/^[a-f0-9-]{36}$/i.test(id||'')?'id':row.recording_sid?'recording_sid':row.storage_path?'storage_path':null;
   if(key){
    const rows=checked(await db.from('recording_ingestion').select('*').eq('tenant_id',row.tenant_id).eq(key,key==='id'?id:row[key]).limit(1))||[];
    callId=rows[0]?.call_record_id;
   }
  }
 }
 if(!callId)return null;
 let call=checked(await db.from('call_records').select('*').eq('id',callId).eq('tenant_id',row.tenant_id).maybeSingle());
 if(!call && /^legacy:/.test(row.recording_id||row.id||'')){
  const inbound=checked(await db.from('inbound_calls').select('call_record_id').eq('id',callId).eq('tenant_id',row.tenant_id).maybeSingle());
  if(inbound?.call_record_id)call=checked(await db.from('call_records').select('*').eq('id',inbound.call_record_id).eq('tenant_id',row.tenant_id).maybeSingle());
 }
 return call;
}
export async function outsideRecording(db,row) {
 const call=await whisperCallForRecording(db,row);
 if(!hasWhisperRecording(call))return row;
 return (await outsideRecordings(db,call,[row]))[0];
}
// For customer per-call recordings channel 0 is inbound customer audio; channel
// 1 is what Twilio sends to that customer, irrespective of call direction.
export function whisperChannelUtterances(call,utterances) {
 if(!hasWhisperRecording(call))return utterances;
 return utterances.map(u=>{
  if(![0,1].includes(u.channel))throw Error('Recording channel mapping unavailable');
  return {...u,speaker:u.channel===0?1:0};
 });
}

export function whisperRecordingOffset(call,recording){
 if(!hasWhisperRecording(call))return 0;
 const offset=Date.parse(recording.provider_created_at)-Date.parse(call.call_start);
 if(!Number.isFinite(offset)||offset<0)throw Error('Recording timeline mapping unavailable');
 return offset;
}
