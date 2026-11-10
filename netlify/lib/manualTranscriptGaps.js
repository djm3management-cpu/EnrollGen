import {randomUUID} from 'node:crypto';
import {wavInfo,sliceWav} from '../../src/lib/wavGaps.js';
import {redactSensitiveText} from '../functions/_redaction.js';
import {checked} from '../functions/_evidenceAccess.js';
export async function fillApprovedGaps({db,job,audio,transcribe}){
 const info=wavInfo(audio);
 if(info.channels!==job.channel_speakers.length)throw Error('Recording channel mapping mismatch');
 let transcript=job.source_transcript;
 for(const [index,range]of job.ranges.entries()){
  const end=range.end_ms-job.timeline_offset_ms;
  if(end>info.durationMs+1000)throw Error('Recording does not cover the approved gap');
  const crop=sliceWav(audio,range.start_ms-job.timeline_offset_ms,Math.min(end,info.durationMs));
  const minutes=(crop.endMs-crop.startMs)/60000*crop.channels;
  const requestId=randomUUID();
  // A unique durable request is claimed BEFORE the provider. Never retry it,
  // even when the response is lost or the function process disappears.
  checked(await db.from('manual_transcript_gap_requests').insert({job_id:job.id,range_index:index,request_id:requestId,submitted_minutes:minutes}));
  const result=await transcribe(crop.bytes,crop.channels);
  if((result.results?.utterances||[]).some(u=>!Number.isFinite(u.start)||!Number.isFinite(u.end)||u.start<0||u.end<=u.start||u.end>(crop.endMs-crop.startMs)/1000+.5||!Number.isInteger(u.channel??0)||(u.channel??0)>=crop.channels))throw Error('Provider returned invalid gap timestamps or channels');
  const lines=(result.results?.utterances||[]).map(u=>{const id=randomUUID();return {id,speaker:job.channel_speakers[u.channel??0]||'unknown',text:redactSensitiveText(u.transcript||''),start_ms:Math.round(crop.startMs+job.timeline_offset_ms+u.start*1000),end_ms:Math.round(crop.startMs+job.timeline_offset_ms+u.end*1000)};});
  if(!lines.length)throw Error('No speech returned for approved gap; provider request retained');
  transcript=checked(await db.rpc('persist_manual_gap_result',{p_job_id:job.id,p_expected_transcript:transcript,p_lines:lines,p_range_index:index,p_provider_id:result.metadata?.request_id||null}));
  checked(await db.from('usage_records').insert({record_type:'stt_seconds',tenant_id:job.tenant_id,quantity:minutes*60,metadata:{call_record_id:job.call_id,source:'manual_gap_fill',job_id:job.id,request_id:requestId,channels:crop.channels,model:'nova-2'}}));
 }
 return transcript;
}
