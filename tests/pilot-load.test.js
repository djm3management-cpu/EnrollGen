import test from 'node:test';
import assert from 'node:assert/strict';
import {runLocalLoad} from '../scripts/pilot/local-load.mjs';
test('short 12-agent/20-call + separate 40-track local acceptance and fault cohort',async()=>{
 const result=await runLocalLoad();
 assert.equal(result.metrics.calls,20);assert.equal(result.metrics.overflows,8);assert.equal(result.metrics.tracks,40);
 // These two platform gates remain explicit failed/unverified results; the local
 // suite never converts WASM serialization or accelerated time into a pass.
 for(const [name,gate] of Object.entries(result.gates))if(!['multi_connection_db_locks','real_duration_soak','stable_memory'].includes(name))assert.equal(gate.pass,true,name);
 assert.equal(result.gates.multi_connection_db_locks.pass,false);
 assert.equal(result.gates.real_duration_soak.pass,false);
});
