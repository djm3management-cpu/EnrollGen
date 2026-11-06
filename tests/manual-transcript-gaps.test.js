import test from 'node:test';import assert from 'node:assert/strict';import {fillApprovedGaps} from '../netlify/lib/manualTranscriptGaps.js';import {wavInfo} from '../src/lib/wavGaps.js';
function pcm(){const bytes=new Uint8Array(44+48000),v=new DataView(bytes.buffer);for(const [at,text]of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);v.setUint32(4,bytes.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,48000,true);return bytes;}
test('manual fill submits only the approved seconds and cannot replay a consumed request',async()=>{
 let consumed=false,providerCalls=0;const writes=[];
 const db={from(table){return {insert(row){writes.push([table,row]);if(table==='manual_transcript_gap_requests'){if(consumed)return {error:new Error('request consumed')};consumed=true;}return {data:null,error:null};}}},rpc:async(_name,args)=>({data:[...args.p_expected_transcript,...args.p_lines],error:null})};
 const job={id:'job',call_id:'call',tenant_id:'tenant',source_transcript:[],ranges:[{start_ms:1000,end_ms:2000}],channel_speakers:['agent'],timeline_offset_ms:0};
 const transcribe=async(bytes,channels)=>{providerCalls++;assert.equal(wavInfo(bytes).durationMs,1000);assert.equal(channels,1);return {metadata:{request_id:'fixture'},results:{utterances:[{start:0,end:.5,channel:0,transcript:'Restored speech'}]}};};
 const lines=await fillApprovedGaps({db,job,audio:pcm(),transcribe});assert.equal(lines[0].start_ms,1000);assert.equal(lines[0].end_ms,1500);assert.equal(lines[0].speaker,'agent');assert.match(lines[0].id,/^gap:/);assert.equal(providerCalls,1);
 await assert.rejects(fillApprovedGaps({db,job,audio:pcm(),transcribe}),/consumed/);assert.equal(providerCalls,1);assert.equal(writes.find(([t])=>t==='usage_records')[1].quantity,1);
});
