import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecordingWavs,readRecordingWav,planRecordingMerge} from '../src/lib/mergedRecording.js';
import {conferencePlayback} from '../netlify/functions/_conferencePlayback.js';
import {database,seed} from '../telephony/tests/helpers/conferenceHarness.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';

const epoch=Date.parse('2026-10-29T12:00:00Z');
const time=seconds=>new Date(epoch+seconds*1000).toISOString();
function wav(duration,value,{rate=8000,channels=2}={}){
 const frames=duration*rate,bytes=frames*channels*2,buffer=new ArrayBuffer(44+bytes),v=new DataView(buffer);
 const tag=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
 tag(0,'RIFF');v.setUint32(4,bytes+36,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);
 v.setUint16(32,channels*2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,bytes,true);
 for(let frame=0;frame<frames;frame++)for(let ch=0;ch<channels;ch++)v.setInt16(44+(frame*channels+ch)*2,typeof value==='function'?value(frame/rate,ch):value+ch,true);
 return buffer;
}
test('merged WAV trims all overlaps, selects private consultation audio, and preserves chronological sample offsets',()=>{
 const segments=[{id:'legacy',startedAt:time(0),role:'legacy'},
  {id:'customer',startedAt:time(2),role:'customer'},
  {id:'agent',startedAt:time(2),role:'agent',originalAgent:true},
  {id:'third',startedAt:time(4),role:'third_party'}];
 const buffers=new Map([['legacy',wav(6,1000)],['customer',wav(8,(t,ch)=>2000+Math.floor(t)*10+ch)],
  ['agent',wav(6,(t,ch)=>3000+Math.floor(t)*10+ch)],['third',wav(8,(t,ch)=>4000+Math.floor(t)*10+ch)]]);
 const merged=mergeRecordingWavs({startedAt:time(-2),segments,events:[
  {event:'customer_hold_changed',at:time(4),payload:{held:true}},
  {event:'participant_joined',at:time(5)},
  {event:'customer_hold_changed',at:time(6),payload:{held:false}}]},buffers);
 const audio=readRecordingWav(merged.buffer);
 assert.equal(merged.duration,12);assert.equal(audio.duration,12);assert.equal(merged.startOffset,2);
 assert.deepEqual(merged.clips.map(c=>c.id),['legacy','customer','agent','customer','third']);
 for(const [second,left] of [[1,1000],[3,2010],[5,3030],[7,2050],[11,4070]]){
  assert.equal(audio.sample(second*8000,0),left);assert.equal(audio.sample(second*8000,1),left+1);
 }
 assert.equal(merged.buffer.byteLength,44+12*8000*4);
});
test('merge refuses real gaps and missing timing instead of dropping time, duplicating audio or inserting fake coverage',()=>{
 assert.throws(()=>planRecordingMerge([{id:'first',start:0,duration:2,role:'legacy'},{id:'later',start:3,duration:2,role:'customer'}]),/1\.00 seconds have no recording coverage/);
 assert.throws(()=>mergeRecordingWavs({startedAt:time(0),segments:[{id:'unknown',startedAt:null}]},new Map([['unknown',wav(1,0)]])),/missing its provider start time/);
 assert.throws(()=>planRecordingMerge([{id:'hold-music',start:epoch/1000,duration:2,role:'customer'}],
  [{event:'customer_hold_changed',at:time(0),payload:{held:true}}]),/no recording coverage/);
});
test('merge resamples mono PCM into stereo and rejects corrupted WAV input',()=>{
 const merged=mergeRecordingWavs({startedAt:time(0),segments:[{id:'mono',startedAt:time(0),role:'customer'}]},
  new Map([['mono',wav(1,(t)=>Math.floor(t*1000),{rate:16000,channels:1})]]));
 const audio=readRecordingWav(merged.buffer);assert.equal(audio.duration,1);assert.equal(audio.sample(4000,0),500);assert.equal(audio.sample(4000,1),500);
 assert.throws(()=>readRecordingWav(new ArrayBuffer(4)),/supported WAV/);
});
test('authorized conference manifest pins tenant/call and maps source roles and hold boundaries',async()=>{
 const {pg,db}=await database();
 try{
  const c=await seed(pg);await pg.query('SELECT prepare_call_conference($1,$2)',[c.attempt,'restricted']);
  await pg.query("SELECT conference_event($1,'customer_hold_changed','{\"held\":true}')",[c.record]);
  const result=await conferencePlayback(db,{tenant:{id:c.tenant}},
   {field:'call_record_id',id:c.record,record:{}},[
    {id:'customer-recording',callback_call_sid:c.parent,recording_sid:'RE-customer',provider_created_at:time(0),recording_duration_seconds:5},
    {id:'agent-recording',callback_call_sid:c.child,recording_sid:'RE-agent',provider_created_at:time(2),recording_duration_seconds:3}]);
  assert.equal(result.callId,c.record);assert.deepEqual(result.segments.map(s=>s.role),['customer','agent']);
  assert.equal(result.segments[1].originalAgent,true);assert.equal(result.events.at(-1).payload.held,true);
  assert.equal(await conferencePlayback(db,{tenant:{id:'00000000-0000-4000-8000-000000000099'}},{field:'call_record_id',id:c.record,record:{}},[]),null);
 }finally{await pg.close();}
});

const vnode=(type,props,...children)=>({type,props:props||{},children});
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children||[]).flat(Infinity).flatMap(nodes)];
function component(file,name,bindings){
 const source=readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default /gm,'').replace(/^export /gm,'');
 const context=vm.createContext({h:vnode,Fragment:'fragment',...bindings});
 vm.runInContext(transformSync(source,{loader:'jsx',jsxFactory:'h',jsxFragment:'Fragment',format:'cjs'}).code+`;globalThis.component=${name};`,context);
 return context.component;
}
test('merged player builds once across rerenders, seeks within one WAV and revokes its private blob on close',async()=>{
 const h=hookHarness(),getToken=async()=> 'session',revoked=[],times=[];let created=0,downloads=0,lists=0,seekRequest;
 const playback={callId:'record',startedAt:time(0),endedAt:time(1),segments:[{id:'one',role:'customer',startedAt:time(0),providerAvailable:false}],events:[]};
 const Player=component('../src/components/callDetail/MergedRecordingPlayer.jsx','MergedRecordingPlayer',{
  ...h.hooks,useAppAuth:()=>({getToken}),mergeRecordingWavs,
  listRecordings:async()=>{lists++;return{playback};},recordingMedia:async()=>({url:'https://storage.test/source.wav'}),
  fetch:async()=>{downloads++;return new Response(wav(1,1234));},AbortController,Blob,
  URL:{createObjectURL:()=>`blob:merged-${++created}`,revokeObjectURL:url=>revoked.push(url)},
 });
 try{
  h.mount(()=>Player({target:{call_record_id:'record'},playRequest:1,seekRequest,onTime:value=>times.push(value)}));
  await h.flush();h.render();await h.flush();h.render();await h.flush();
  assert.equal(lists,1);assert.equal(downloads,1);assert.equal(created,1);
  const audio=nodes(h.value).find(node=>node.type==='audio');assert.equal(audio.props.src,'blob:merged-1');
  const element={readyState:1,currentTime:0,play:async()=>{}};audio.props.ref.current=element;
  seekRequest={seconds:0.5,sequence:1};h.render();await h.flush();
  assert.equal(element.currentTime,0.5);audio.props.onTimeUpdate({currentTarget:{currentTime:0.75}});assert.equal(times[0],0.75);
 }finally{h.unmount();}
 assert.deepEqual(revoked,['blob:merged-1']);
});
test('call record transcript view uses merged playback instead of selecting the first overlapping artifact',async()=>{
 const h=hookHarness();
 const Player=component('../src/components/callLog/CallTranscriptPlayer.jsx','CallTranscriptPlayer',{
  ...h.hooks,useAppAuth:()=>({getToken:async()=> 'session'}),formatTalk:value=>String(value),redactSensitiveText:value=>value,
  recordingTarget:row=>({call_record_id:row.call_record_id}),MergedRecordingPlayer:'merged-player',Play:'play',Pause:'pause',
  recordingMedia:()=>assert.fail('Conference must not default to one source artifact'),
 });
 try{
  h.mount(()=>Player({row:{call_record_id:'record'},detail:{metadata:{conference_events:[]},transcript_diarized:[{speaker:'third_party',text:'Third person',start_ms:500}]},playRequest:1}));
  await h.flush();assert.equal(nodes(h.value).some(node=>node.type==='audio'),false);
  const merged=nodes(h.value).find(node=>node.type==='merged-player');assert.equal(merged.props.playRequest,1);
  nodes(h.value).find(node=>node.props['aria-label']?.startsWith('Seek to')).props.onClick();await h.flush();
  assert.equal(nodes(h.value).find(node=>node.type==='merged-player').props.seekRequest.seconds,0.5);
 }finally{h.unmount();}
});
