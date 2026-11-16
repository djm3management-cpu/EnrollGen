import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSupervisorWhisperPhone} from '../src/lib/supervisorWhisperPhone.js';
function harness({failure=null,late=false}={}) {
 const operations=[],handlers={},timers=new Map(),states=[];let i=0,renew;
 const call={mute:value=>operations.push(['local-mute',value]),disconnect:()=>operations.push(['disconnect']),on:(name,fn)=>handlers['call-'+name]=fn,isMuted:()=>[...operations].reverse().find(o=>o[0]==='local-mute')?.[1]!==false};
 class Device {constructor(token,options){operations.push(['device',token,options]);}on(name,fn){handlers[name]=fn;}async connect(input){operations.push(['connect',input]);return call;}destroy(){operations.push(['destroy']);}register(){assert.fail('coach must never register');}}
 const request=async(path,body)=>{operations.push(['request',path,body]);if(late&&path==='control'&&body.action==='renew')return new Promise(r=>renew=r);return {ok:body.action!==failure,json:async()=>path==='token'?{token:'synthetic-token',id:'synthetic-session'}:{active:true,confirmed:true}};};
 const phone=createSupervisorWhisperPhone({getToken:async()=>'synthetic',loadDevice:async()=>({Device}),request,onState:s=>states.push(s),onEnd:()=>operations.push(['end']),schedule:(fn,ms)=>{timers.set(++i,{fn,ms});return i;},cancel:id=>timers.delete(id)});
 return {phone,operations,handlers,timers,states,resolveRenew:()=>renew?.({ok:true,json:async()=>({active:true,confirmed:true})})};
}
test('browser uses the existing Voice client, starts muted and never registers inbound or presence',async()=>{
 const h=harness();await h.phone.connect({grant:'synthetic',attempt:'synthetic'});assert.deepEqual(h.operations.find(o=>o[0]==='connect')[1],{params:{}});assert.deepEqual(h.operations.find(o=>o[0]==='device')[2].codecPreferences,['opus','pcmu']);assert.equal(h.operations.find(o=>o[0]==='local-mute')[1],true);let rejected=false;h.handlers.incoming({reject:()=>rejected=true});assert.equal(rejected,true);h.phone.stop();
});
test('Talk waits for server authorization before microphone unmute and Mute silences immediately',async()=>{
 const h=harness();await h.phone.connect({});await h.phone.setMuted(false);const authorization=h.operations.findIndex(o=>o[0]==='request'&&o[2].action==='talk'),unmute=h.operations.findIndex(o=>o[0]==='local-mute'&&o[1]===false);assert.ok(authorization<unmute);await h.phone.setMuted(true);const muteRequest=h.operations.findIndex(o=>o[0]==='request'&&o[2].action==='mute');assert.deepEqual(h.operations[muteRequest-1],['local-mute',true]);h.phone.stop();
});
test('failed Talk ends browser audio without ever unmuting',async()=>{const h=harness({failure:'talk'});await h.phone.connect({});await assert.rejects(h.phone.setMuted(false));assert.ok(!h.operations.some(o=>o[0]==='local-mute'&&o[1]===false));assert.ok(h.operations.some(o=>o[0]==='disconnect'));assert.equal(h.timers.size,0);});
test('renewal failure disconnects once and attempts the existing server cleanup',async()=>{const h=harness({failure:'renew'});await h.phone.connect({});h.phone.stop();assert.equal(h.operations.filter(o=>o[0]==='disconnect').length,1);assert.ok(h.operations.some(o=>o[0]==='request'&&o[2].action==='stop'));});
test('local watchdog disconnects even when renewal hangs',async()=>{const h=harness({late:true});const connection=h.phone.connect({});await new Promise(r=>setImmediate(r));const deadline=[...h.timers.values()].find(t=>t.ms===6000);assert.ok(deadline);deadline.fn();assert.ok(h.operations.some(o=>o[0]==='disconnect'));h.resolveRenew();await connection;});
test('stop during token issuance cannot leave a device or late coach connection',async()=>{const h=harness();h.phone.stop();await h.phone.connect({});assert.ok(!h.operations.some(o=>o[0]==='device'));assert.ok(h.operations.some(o=>o[0]==='request'&&o[2].action==='stop'));});
test('floor reuses lock, visibility, identity cleanup and existing themes, without extra helper text',()=>{
 const source=readFileSync('src/components/SupervisorFloor.jsx','utf8');assert.match(source,/createSupervisorWhisperPhone/);assert.match(source,/disabled={!coach.confirmed}/);assert.match(source,/document.hidden/);assert.match(source,/locked,user\?\.id,organization\?\.id/);assert.doesNotMatch(source,/fontWeight:\s*(?:600|700|800|900)/);assert.match(source,/data.whisper&&row.whisper_available/);
 for(const file of ['ActiveCallBar.jsx','ActiveCallExpanded.jsx']){const ui=readFileSync('src/components/phone/'+file,'utf8');assert.match(ui,/Whisper ·/);assert.match(ui,/fontWeight:400/);}
});
