import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawnSync} from 'node:child_process';
import {FEATURE_NAMES} from '../src/lib/deploymentFeatures.js';
Object.assign(process.env,Object.fromEntries(FEATURE_NAMES.map(name=>[name,'false'])),{
 PUBLIC_BASE_URL:'https://offline.example.test',SUPABASE_URL:'https://offline.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture',
 TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture',TWILIO_API_KEY_SID:'fixture',TWILIO_API_KEY_SECRET:'fixture',TWILIO_TWIML_APP_SID:'fixture',DEEPGRAM_API_KEY:'fixture',INBOUND_VENDOR_API_KEY:'fixture',CLERK_SECRET_KEY:'fixture',AGENT_WS_SIGNING_SECRET:'fixture',PARAGON_STATE_ROUTING_ENABLED:'true',
});
const {config}=await import('../src/config.js');
const {enqueueBillingCallback,processBillingJob,startParagonBillingWorker,verifiedParagonArrival}=await import('../src/paragonBilling.js');
const {runParagonResidenceWorker,startParagonResidenceWorker,processResidenceJob}=await import('../src/paragonResidenceWorker.js');
const {runTranscriptDispatch,sendPendingRecoveryAlerts}=await import('../src/transcripts.js');
const {createConferenceRouter}=await import('../src/routes/conferenceCalling.js');
const {createConferenceService}=await import('../src/conferenceCalling.js');
const {vendorPingRouter}=await import('../src/routes/vendorPing.js');
const {leadsRouter}=await import('../src/routes/leads.js');
const {reportSttLimit}=await import('../src/media/sttAlert.js');
const forbidden=()=>assert.fail('Disabled feature touched database, timer or outbound provider');
const db={rpc:forbidden,from:forbidden};

test('Paragon off prevents enqueue, billing/residence claims, retries, delivery and timer startup with credentials present',async()=>{
 assert.equal(config.paragonEnabled,false);assert.equal(config.paragonStateRoutingEnabled,false);
 await enqueueBillingCallback(db,config,{});
 await processBillingJob({db,config,job:{},fetchParent:forbidden,fetchChildren:forbidden});
 await verifiedParagonArrival(config,'fixture',forbidden);
 await startParagonBillingWorker({db,config,interval:forbidden}).tick();
 await runParagonResidenceWorker({db});await processResidenceJob(db,{});
 startParagonResidenceWorker({db})();
});

test('scoring off preserves transcript reconciliation but never claims scoring or delivers alerts',async()=>{
 const rpc=[];
 await runTranscriptDispatch({db:{rpc:async name=>{rpc.push(name);return {};}},scoringUrl:'https://offline.example.test',secret:'fixture',transport:forbidden});
 assert.deepEqual(rpc,['reconcile_telephony_transcripts']);
 await sendPendingRecoveryAlerts({db,scoringUrl:'https://offline.example.test',secret:'fixture',transport:forbidden});
 await reportSttLimit({env:process.env,claims:{},transport:forbidden});
});

test('conference off prevents scheduled recovery, upgrades, delivery and callbacks, even for previously active calls',async()=>{
 const service=createConferenceService({settings:config,store:{db,active:forbidden},client:{calls:forbidden,conferences:forbidden}});
 await service.tick();
 for(const work of [()=>service.upgrade({},''),()=>service.action('fixture',{}),()=>service.status('fixture',{}),()=>service.media({}, {})])await assert.rejects(work(),/disabled/);
});

test('all telephony integration routes exit before auth, claims or outbound providers',async()=>{
 const service={store:{db}};
 const app=express();app.use(express.json());app.use(vendorPingRouter);app.use(leadsRouter);
 app.use(createConferenceRouter({settings:config,service,authenticate:forbidden,signature:forbidden}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const origin=`http://127.0.0.1:${server.address().port}`;
  const routes=['/api/leads/ping','/api/leads/incoming','/api/voice/conference-capabilities','/api/voice/conference-status','/api/voice/conference-action',...['join','status','exit','events','stream-status','recording','hold'].map(name=>'/twilio/conference/'+name)];
  for(const path of routes){
   const response=await fetch(origin+path,{method:path.endsWith('capabilities')?'GET':'POST',headers:{'Content-Type':'application/json','x-api-key':'fixture'},body:path.endsWith('capabilities')?undefined:JSON.stringify({phone:'+15555555555',vendor_source:'Paragon Media'})});
   assert.equal(response.status,503,path);assert.equal((await response.json()).status,'disabled');
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('telephony fails configuration startup on a malformed shared safety switch',()=>{
 const child=spawnSync(process.execPath,['--input-type=module','-e',"import './src/config.js'"],{cwd:new URL('..',import.meta.url),env:{...process.env,CONFERENCE_CALLING_ENABLED:'yes'},encoding:'utf8'});
 assert.notEqual(child.status,0);assert.match(child.stderr,/Invalid deployment feature flag CONFERENCE_CALLING_ENABLED/);
});
