import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {PILOT_LIMITS,admit,admissionResponse,AdmissionError,createSocketAdmission,admissionRules} from '../telephony/src/lib/admission.js';
import {deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {assertTokenBoundary,allowedBrowserOrigin,assertSingleReplica} from '../telephony/src/lib/browserBoundary.js';
import {downloadMessageMedia} from '../telephony/src/lib/messageMedia.js';
import {assertLoadSafety,assertSafeEnvironment} from '../scripts/pilot/load-safety.js';
let pg,db;
before(async()=>{pg=await freshDatabase();db=freshInstallClient(pg);});
after(async()=>{await pg?.close();});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
for(const route of Object.keys(PILOT_LIMITS).filter(r=>r!=='agentSocket'))test(`${route}: independent handlers share atomic allowance; denial performs no work`,async()=>{
 await pg.exec('TRUNCATE admission_counters');
 const profile={...deploymentProfile(),admissionLimits:{[route]:{minute:3,subjectDay:10,deploymentDay:20}}};let work=0;
 const handler=async()=>{try{await admit(db,route,'verified-subject',profile);work++;return new Response('ok');}catch(e){return admissionResponse(e);}};
 const first=await handler({agent_id:'first'});assert.equal(first.status,200);
 const responses=await Promise.all(Array.from({length:20},(_,i)=>handler({agent_id:`spoof-${i}`,vendor_source:`spoof-${i}`,'x-forwarded-for':`198.51.100.${i}`})));
 assert.equal(responses.filter(r=>r.status===200).length,2);assert.equal(work,3);
 for(const response of responses.filter(r=>r.status===429)){assert.ok(Number(response.headers.get('retry-after'))>0);assert.ok((await response.json()).retry_at);}
 const other=await admit(db,route,'another-verified-subject',profile);assert.equal(other,undefined);
});
test('all subject and deployment paid budgets deny before work and denied rules consume nothing',async()=>{
 for(const route of Object.keys(PILOT_LIMITS).filter(r=>PILOT_LIMITS[r].subjectDay)){
  await pg.exec('TRUNCATE admission_counters');const profile={...deploymentProfile(),admissionLimits:{[route]:{minute:100,subjectDay:2,deploymentDay:3}}};
  await admit(db,route,'a',profile);await admit(db,route,'a',profile);
  await assert.rejects(admit(db,route,'a',profile),e=>e.status===429&&e.retryAfter>0);
  await admit(db,route,'b',profile);
  await assert.rejects(admit(db,route,'c',profile),e=>e.status===429);
  const rows=(await pg.query("SELECT used FROM admission_counters WHERE window_seconds=86400 ORDER BY used")).rows.map(r=>r.used);assert.deepEqual(rows,[1,2,3]);
 }
});
test('counter errors and absent migration fail closed, with no paid work',async()=>{
 await assert.rejects(admit({rpc:async()=>({data:null,error:{code:'57014'}})},'coach','verified'),e=>e.status===503);
 await assert.rejects(admit({rpc:async()=>({data:null})},'coach','verified'),e=>e.status===503);
});
test('counter is service only, hash only, and can be pruned in bounded batches',async()=>{
 for(const role of ['anon','authenticated']){
  await pg.exec('SET ROLE '+role);
  await assert.rejects(pg.query('SELECT * FROM admission_counters'),e=>e.code==='42501');
  await assert.rejects(pg.query("SELECT consume_admission('[]')"),e=>e.code==='42501');
  await pg.exec('RESET ROLE');
 }
 const rows=(await pg.query('SELECT key_hash FROM admission_counters')).rows;assert.ok(rows.every(r=>/^[a-f0-9]{64}$/.test(r.key_hash)));
 await pg.exec("UPDATE admission_counters SET expires_at=now()-interval '2 days'");
 assert.ok((await db.rpc('prune_admission_counters')).data>0);
});
test('vendor admission verifies active hashes and ignores supplied vendor names and client addresses',async()=>{
 await pg.exec('TRUNCATE admission_counters');const hash='a'.repeat(64);
 await pg.query("INSERT INTO availability_consumers(name,key_hash) VALUES('synthetic-vendor',$1)",[hash]);
 const check=(route,key=hash)=>db.rpc('admit_vendor',{p_key_hash:key,p_route:route,p_limit:2});
 for(const route of ['vendorPing','availability']){
  assert.equal((await check(route,'b'.repeat(64))).data.authorized,false);
  const responses=await Promise.all(Array.from({length:12},()=>check(route)));
  assert.equal(responses.filter(r=>r.data.allowed).length,2);assert.equal(responses.filter(r=>r.data.authorized&&!r.data.allowed).length,10);
 }
 await pg.exec("UPDATE availability_consumers SET active=false WHERE name='synthetic-vendor'");assert.equal((await check('availability')).data.authorized,false);
});
test('Paragon report sliding window serializes concurrent attempts and reports retry',async()=>{
 await pg.exec('TRUNCATE paragon_report_access');
 const results=await Promise.all(Array.from({length:60},()=>db.rpc('authorize_paragon_report_limited',{p_hash:null,p_ip:'synthetic-local-ip'})));
 assert.ok(results.every(r=>!r.error));assert.equal(results.filter(r=>!r.data.limited).length,30);assert.equal(results.filter(r=>r.data.limited).length,30);
 assert.equal((await pg.query('SELECT count(*)::int n FROM paragon_report_access WHERE NOT rate_limited')).rows[0].n,30);
 const text=source('netlify/functions/paragon-vendor-report.js');assert.ok(!text.includes('x-forwarded-for'));assert.ok(text.includes('x-nf-client-connection-ip'));
});
test('socket reservations are synchronous, bounded per signed subject, and released once',()=>{
 let time=0;const reserve=createSocketAdmission({now:()=>time,profile:()=>deploymentProfile()});
 const releases=Array.from({length:3},()=>reserve('signed-subject'));
 assert.throws(()=>reserve('signed-subject'),e=>e.status===429);releases[0]();releases[0]();const release=reserve('signed-subject');release();
 releases.forEach(r=>r());for(let i=0;i<26;i++)reserve('signed-subject')();
 assert.throws(()=>reserve('signed-subject'),e=>e.status===429);time=60001;reserve('signed-subject')();
});
test('media bounds host, redirects, declared and streamed size, and stalled body and headers',async()=>{
 const transport=async(_url,options)=>{assert.equal(options.redirect,'error');return new Response(Uint8Array.of(1,2));};
 assert.equal((await downloadMessageMedia('https://api.twilio.com/media',{transport})).length,2);
 for(const url of ['https://evil.test/media','http://api.twilio.com/media','https://api.twilio.com.evil.test/media','https://api.twilio.com:444/media','https://user:pass@api.twilio.com/media'])await assert.rejects(downloadMessageMedia(url,{transport:()=>assert.fail('forbidden media fetched')}));
 await assert.rejects(downloadMessageMedia('https://api.twilio.com/media',{transport:async()=>new Response('x',{headers:{'content-length':'9999'}}),limits:{bytes:8,timeoutMs:100}}),/too large/);
 await assert.rejects(downloadMessageMedia('https://api.twilio.com/media',{transport:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(10));}})),limits:{bytes:8,timeoutMs:100}}),/too large/);
 await assert.rejects(downloadMessageMedia('https://api.twilio.com/media',{transport:()=>new Promise(()=>{}),limits:{bytes:8,timeoutMs:10}}),/timed out/);
 await assert.rejects(downloadMessageMedia('https://api.twilio.com/media',{transport:async()=>new Response(new ReadableStream({start(){}})),limits:{bytes:8,timeoutMs:10}}),/timed out/);
});
test('deployment origin, parties, audiences and replica guards reject foreign boundaries',()=>{
 const p=deploymentProfile(),valid={azp:p.authorizedParties[0],aud:p.tokenAudiences[0]};assertTokenBoundary(valid,p);
 for(const claims of [{...valid,aud:'foreign'},{...valid,azp:'https://foreign.test'},{azp:valid.azp},{aud:valid.aud}])assert.throws(()=>assertTokenBoundary(claims,p));
 assert.equal(allowedBrowserOrigin('https://evil.test',p),false);assert.equal(allowedBrowserOrigin(p.browserOrigins[0],p),true);
 for(const key of ['RAILWAY_REPLICA_COUNT','WEB_CONCURRENCY','TELEPHONY_REPLICAS','REPLICAS'])assert.throws(()=>assertSingleReplica({[key]:'2'},()=>{}));
 assertSingleReplica({},()=>{});
});
test('load guards reject remote, current-agency, missing ceilings, credentials and non-synthetic targets',()=>{
 const good={synthetic:true,targets:['http://localhost:3000'],project:'synthetic-local-project',account:'synthetic-local-account',maxCalls:20,maxDurationSeconds:60};assertLoadSafety(good);
 for(const patch of [{targets:['https://external.test']},{account:'current-account'},{project:'org_3DHzWeCe9QZ4zmAYXCmUpGnDwfQ'},{maxCalls:101},{maxDurationSeconds:7201},{synthetic:false},{targets:['http://user:secret@localhost']}])assert.throws(()=>assertLoadSafety({...good,...patch}));
 assert.throws(()=>assertSafeEnvironment({SUPABASE_URL:'https://external.test'}));
 assert.throws(()=>assertLoadSafety({...good,targets:['https://pilot.example.test']},{paid:true}));
 assertLoadSafety({...good,targets:['https://pilot.example.test'],disposableHosts:['pilot.example.test'],spendCeilingUsd:5},{paid:true});
});
test('every audited entry point is wired to the shared admission boundary before paid work',()=>{
 for(const [file,hook] of Object.entries({'netlify/functions/coach.js':'admitAgent','netlify/functions/deepgram-token.js':'admitAgent','netlify/functions/transcribe.js':'admitAgent','netlify/functions/transcript-import.js':'admitAgent','netlify/functions/embeddings.js':'admission(db','netlify/functions/score-call-background.js':'admission(sb','netlify/functions/compliance-review-background.js':'admission(db','netlify/functions/weekly-coaching.js':'admitCall','telephony/src/routes/leads.js':'admitHttp','telephony/src/routes/voiceToken.js':'admitHttp','telephony/src/routes/sms.js':'admitHttp','telephony/src/routes/vendorPing.js':'admit_vendor','supabase/functions/get-availability/index.ts':'admit_vendor','telephony/src/media/agentSocket.js':'reserveSocket','telephony/src/media/sttReconnectBudget.js':'admit(db'}))assert.ok(source(file).includes(hook),file);
 assert.ok(admissionRules('coach','verified').every(r=>r.key.includes('verified')||r.key.endsWith('deployment-day')));
 assert.equal(admissionResponse(new AdmissionError(429,12)).status,429);
});
