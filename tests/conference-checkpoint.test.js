import test from 'node:test';
import assert from 'node:assert/strict';
import {registerConferenceCheckpoint,flushConferenceCheckpoint} from '../src/lib/conferenceCheckpoint.js';

test('conference handoff awaits the pending browser checkpoint and preserves a newer registration',async()=>{
 const events=[];let finish;
 const old=registerConferenceCheckpoint('old-call',async()=>{events.push('saving');await new Promise(resolve=>{finish=resolve;});events.push('saved');});
 const pending=flushConferenceCheckpoint('old-call').then(()=>events.push('handoff'));
 await Promise.resolve();assert.deepEqual(events,['saving']);finish();await pending;
 assert.deepEqual(events,['saving','saved','handoff']);
 const next=registerConferenceCheckpoint('old-call',async()=>events.push('new snapshot'));
 old();await flushConferenceCheckpoint('old-call');assert.equal(events.at(-1),'new snapshot');next();
});
test('checkpoint failures block handoff and unrelated/manual calls do not flush another call',async()=>{
 const stop=registerConferenceCheckpoint('protected-call',async()=>{throw Error('save failed');});
 await flushConferenceCheckpoint('different-call');
 await assert.rejects(()=>flushConferenceCheckpoint('protected-call'),/save failed/);stop();
});
