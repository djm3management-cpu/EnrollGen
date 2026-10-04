import test from 'node:test';
import assert from 'node:assert/strict';
import { installTranscriptExitFlush, CHECKPOINT_INTERVAL_MS } from '../src/lib/postCallPipeline.js';
test('outbound tab close and hidden tab send authenticated keepalive checkpoints from latest snapshot',async()=>{
 const events=new Map(), sent=[];
 const surface={ addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),setInterval:()=>1,clearInterval:()=>{} };
 const documentTarget={...surface,visibilityState:'visible'};
 let text='short outbound call';
 const cleanup=installTranscriptExitFlush({windowTarget:surface,documentTarget,getToken:async()=> 'token',
 getSnapshot:()=>({transcript_text:text,call_direction:'outbound',session_id:'session'}),
 send:async(url,options)=>{sent.push({url,options});return {ok:true};}});
 await Promise.resolve();events.get('beforeunload')();
 text='latest final';documentTarget.visibilityState='hidden';events.get('visibilitychange')();
 assert.equal(sent.length,2);assert.equal(sent[0].options.keepalive,true);
 assert.equal(sent[0].options.headers.Authorization,'Bearer token');
 assert.equal(JSON.parse(sent[1].options.body).transcript_text,'latest final');
 assert.equal(JSON.parse(sent[1].options.body).action,'checkpoint');
 assert.ok(CHECKPOINT_INTERVAL_MS<=15000);cleanup();assert.equal(events.size,0);
});
