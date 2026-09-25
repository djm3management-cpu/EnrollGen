import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../../supabase/functions/get-availability/handler.js';
import {vendorMetadata} from '../src/vendorMetadata.js';
import {telephonyCallIdentity} from '../../src/lib/telephonyCallIdentity.js';
import {linkTelephonyRecord} from '../../netlify/functions/_telephonyLink.js';
import {availabilityPayload,dispositionPayload,mappedDisposition,csvReport,assertPrivateFieldsAbsent} from '../../integrations/payloads.js';
import {signature,publicAddress,validateUrl} from '../../integrations/transport.js';
import {createWorker,deliver,retryDelay} from '../../integrations/worker.js';
import {createHmac} from 'node:crypto';
const sql=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
const tenant='00000000-0000-4000-8000-000000000001';
const sid='CA'+'a'.repeat(32),child='CA'+'b'.repeat(32);
let db;
before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE tenants(id uuid PRIMARY KEY); INSERT INTO tenants VALUES ('${tenant}');
 CREATE TABLE agent_availability(agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);
 CREATE TABLE tenant_agents(agent_slug text,is_active boolean,clerk_user_id text,tenant_id uuid);
 CREATE TABLE enrolled_agents(clerk_user_id text,tenant_id uuid,licensed_states text[]);
 CREATE TABLE call_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,metadata jsonb DEFAULT '{}',call_outcome text,call_duration_seconds integer,created_at timestamptz DEFAULT now());
 CREATE TABLE inbound_calls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,twilio_call_sid text UNIQUE,from_number text,to_number text,status text DEFAULT 'ringing',call_record_id uuid,created_at timestamptz DEFAULT now(),duration_seconds integer);
 CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,parent_call_sid text,child_call_sid text,inbound_call_id uuid,agent_id text,created_at timestamptz DEFAULT now());`);
 for(const path of ['038_call_owned_agent_reservations','039_agent_phone_presence','046_sticky_agent_routing','047_availability_feed','048_vendor_integrations'])await db.exec(await sql('supabase/migrations/'+path+'.sql'));
});
after(async()=>db?.close());
async function reset(){
 await db.exec(`TRUNCATE integration_delivery_attempts,integration_deliveries,integration_report_log,integration_link_issues,lead_source_pings,lead_sources,telephony_call_attempts,inbound_calls,call_records CASCADE;
 DELETE FROM availability_consumers WHERE name<>'nghs-status'; UPDATE availability_consumers SET push_enabled=false;
 UPDATE integration_push_state SET fingerprint=NULL;
 TRUNCATE agent_availability CASCADE; TRUNCATE tenant_agents,enrolled_agents;
 INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES('a','A','available',true);
 INSERT INTO agent_phone_sessions VALUES(gen_random_uuid(),'a',now()+interval '1 hour');
 INSERT INTO tenant_agents VALUES('a',true,'user-a','${tenant}');
 INSERT INTO enrolled_agents VALUES('user-a','${tenant}',ARRAY['NJ']);`);
}
async function source(extra={}){
 const row={tenant_id:tenant,name:'Aggregator',type:'aggregator',twilio_number:'+15551230000',...extra};
 const names=Object.keys(row);return (await db.query(`INSERT INTO lead_sources(${names.join(',')}) VALUES(${names.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(row))).rows[0];
}
async function call(extra={}){
 const row={tenant_id:tenant,twilio_call_sid:sid,from_number:'+15551231111',to_number:'+15551230000',...extra};
 const names=Object.keys(row);return (await db.query(`INSERT INTO inbound_calls(${names.join(',')}) VALUES(${names.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(row))).rows[0];
}
const sample={any_available:true,available_count:2,unavailable_count:1,total_count:3,available_states:['CA','NJ'],agents:[
 {agent_id:'a',agent_name:'A',available:true,status:'available',licensed_states:['NJ']},
 {agent_id:'b',agent_name:'B',available:true,status:'available',licensed_states:['CA']},
 {agent_id:'c',agent_name:'C',available:false,status:'busy',licensed_states:['TX']}]};
function handlerFixture(){const logs=[];const h=createHandler({rpc:async()=>({data:{authorized:true,consumer_name:'test',feed:sample}}),log:l=>logs.push(JSON.parse(l))});return {h,logs};}
for(const [query,expected] of [['format=simple',{available:true,count:2}],['format=simple&state=NJ',{available:true,count:1}],['format=simple&state=TX',{available:false,count:0}],['format=simple&min=3',{available:false,count:2}],['format=simple&state=NJ&min=2',{available:false,count:1}]]){
 test('pull '+query,async()=>{const {h}=handlerFixture();const r=await h(new Request('https://feed.test/?'+query,{headers:{'x-api-key':'test'}}));assert.deepEqual(await r.json(),expected);});
}
test('default unchanged, state projection, text, HEAD and query key logging',async()=>{
 const {h,logs}=handlerFixture();
 const get=(q='',method='GET')=>h(new Request('https://feed.test/?key=test&'+q,{method}));
 assert.deepEqual(await (await get()).json(),sample);
 const filtered=await (await get('state=nj')).json();assert.equal(filtered.total_count,1);assert.deepEqual(filtered.available_states,['NJ']);
 for(const [query,text] of [['format=text','1'],['format=text&state=TX','0'],['format=text&min=4','0']]){
  const r=await get(query);assert.match(r.headers.get('content-type'),/text\/plain/);assert.equal(await r.text(),text);
 }
 assert.equal((await get('','HEAD')).status,200);const unavailable=await get('min=3','HEAD');assert.equal(unavailable.status,503);assert.equal(await unavailable.text(),'');
 assert.ok(logs.every(l=>l.auth_method==='query'));assert.ok(!JSON.stringify(logs).includes('key='));
 await h(new Request('https://feed.test/?key=ignored',{headers:{'x-api-key':'header'}}));assert.equal(logs.at(-1).auth_method,'header');
 for(const q of ['min=0','min=-1','min=1.5','min=NaN','state=ZZ','format=xml'])assert.equal((await get(q)).status,400);
});
test('push dormant, five-second debounce, state changes and five-minute heartbeat are durable',async()=>{
 await reset();await db.query("SELECT enqueue_availability_push('2030-01-01T00:00:00Z')");
 assert.equal((await db.query('SELECT count(*)::int AS n FROM integration_deliveries')).rows[0].n,0);
 await db.exec("UPDATE availability_consumers SET push_url='https://vendor.test/push',push_secret=repeat('s',32),push_enabled=true");
 const tick=t=>db.query('SELECT enqueue_availability_push($1)',[t]);
 await tick('2030-01-01T00:00:00Z');await tick('2030-01-01T00:00:04Z');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM integration_deliveries')).rows[0].n,0);
 await tick('2030-01-01T00:00:05Z');await tick('2030-01-01T00:04:59Z');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM integration_deliveries')).rows[0].n,1);
 await tick('2030-01-01T00:05:05Z');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM integration_deliveries')).rows[0].n,2);
 await db.exec("UPDATE enrolled_agents SET licensed_states=ARRAY['PA']");
 await tick('2030-01-01T00:05:06Z');await tick('2030-01-01T00:05:11Z');
 const rows=(await db.query("SELECT payload FROM integration_deliveries WHERE status='pending'")).rows;
 assert.equal(rows.length,1);assert.deepEqual(rows[0].payload.available_states,['PA']);
});
test('source attribution by number, signed request metadata, ping match and direct fallback',async()=>{
 await reset();assert.equal((await call()).source_kind,'direct');await db.exec('TRUNCATE inbound_calls CASCADE');
 const agg=await source();const pub=await source({name:'Publisher',type:'publisher',twilio_number:null,parent_source_id:agg.id,external_id:'pub-1'});
 const metadata=vendorMetadata({body:{'SipHeader_X-Publisher-ID':'pub-1','SipHeader_X-Aggregator-Call-ID':'external-123'},query:{}});
 const tagged=await call({vendor_metadata:metadata});assert.equal(tagged.aggregator_source_id,agg.id);assert.equal(tagged.lead_source_id,pub.id);assert.equal(tagged.aggregator_call_id,'external-123');
 await db.exec('TRUNCATE inbound_calls CASCADE');
 assert.deepEqual(vendorMetadata({body:{},query:{publisher:'pub-1',aggregator_call_id:'query-id'}}),{publisher:'pub-1',aggregator_call_id:'query-id'});
 await db.query('INSERT INTO lead_source_pings(source_id,caller_phone,publisher,aggregator_call_id) VALUES($1,$2,$3,$4)',[agg.id,'+15551231111','pub-1','ping-id']);
 assert.equal((await call()).aggregator_call_id,'ping-id');
 assert.equal((await call({twilio_call_sid:child})).source_kind,'aggregator'); // Ping is single-use.
 await db.exec('TRUNCATE inbound_calls CASCADE');
 await db.query("INSERT INTO lead_source_pings(source_id,caller_phone,publisher,received_at) VALUES($1,'+15551231111','pub-1',now()-interval '6 minutes')",[agg.id]);
 assert.equal((await call()).source_kind,'aggregator');
});
test('source attribution errors never block inbound inserts',async()=>{
 await reset();await source();await db.exec('ALTER TABLE lead_sources RENAME COLUMN twilio_number TO temp_number');
 try{assert.equal((await call()).source_kind,'direct');}finally{await db.exec('ALTER TABLE lead_sources RENAME COLUMN temp_number TO twilio_number');}
});
test('exact SID links inbound and outbound, refuses cross-tenant/agent and duplicate-record links',async()=>{
 await reset();const incoming=await call();
 const record=(await db.query('INSERT INTO call_records(tenant_id) VALUES($1) RETURNING id',[tenant])).rows[0];
 await db.query('INSERT INTO telephony_call_attempts(tenant_id,parent_call_sid,child_call_sid,inbound_call_id,agent_id) VALUES($1,$2,$3,$4,$5)',[tenant,sid,child,incoming.id,'a']);
 const link=(id=record.id,user='user-a')=>db.query('SELECT link_telephony_call_record($1,$2,$3,$4) AS result',[id,tenant,child,user]);
 assert.equal((await link(record.id,'wrong-user')).rows[0].result,'sid_or_agent_not_found');
 assert.equal((await link()).rows[0].result,'linked');assert.equal((await link()).rows[0].result,'linked');
 assert.equal((await db.query('SELECT call_record_id FROM inbound_calls')).rows[0].call_record_id,record.id);
 const other=(await db.query('INSERT INTO call_records(tenant_id) VALUES($1) RETURNING id',[tenant])).rows[0];
 assert.equal((await link(other.id)).rows[0].result,'already_linked');
 await db.exec('UPDATE telephony_call_attempts SET inbound_call_id=NULL,call_record_id=NULL');
 assert.equal((await link(other.id)).rows[0].result,'linked');
 assert.equal((await db.query('SELECT call_record_id FROM telephony_call_attempts')).rows[0].call_record_id,other.id);
});
test('SDK parent identity survives wrap-up and link failures are fail-open',async()=>{
 assert.deepEqual(telephonyCallIdentity({params:{twilioCallSid:sid},call:{parameters:{CallSid:child}}}),{telephonyCall:true,twilioCallSid:sid});
 assert.equal(telephonyCallIdentity({params:{direction:'outbound'},call:{parameters:{CallSid:sid}}}).twilioCallSid,sid);
 assert.deepEqual(telephonyCallIdentity(null),{});
 const result=await linkTelephonyRecord({rpc:()=>{throw Error('database down');}},{id:'record'},{telephony_call:true,twilio_call_sid:sid},{userId:'a'},{id:tenant},()=>{});
 assert.equal(result,'database_error');
});
const disposition={aggregator_call_id:'agg-123',twilio_call_sid:sid,publisher:'pub-1',call_start_time:'2026-01-01T12:00:00Z',caller_phone:'+15551231111',duration:65,disposition_code:'enrolled',sale:true};
test('HMAC is over exact bytes; both push formats and field mapping work',async()=>{
 const requests=[];const send=async(url,body,headers)=>{requests.push({url,body,headers});return{status:200};};
 const secret='s'.repeat(32);
 for(const format of ['json','simple'])await deliver({id:'id',kind:'push',payload:sample},{active:true,push_enabled:true,push_url:'https://example.test',push_secret:secret,push_format:format},{send});
 assert.deepEqual(JSON.parse(requests[1].body),{available:true,count:2});
 assert.equal(requests[0].headers['X-Signature'],'sha256='+createHmac('sha256',secret).update(requests[0].body).digest('hex'));
 await deliver({id:'disposition',kind:'postback',payload:disposition},{active:true,postback_url:'https://example.test',postback_secret:secret,postback_field_map:{twilio_call_sid:'call_id',sale:'converted'}},{send});
 const body=JSON.parse(requests[2].body);assert.equal(body.call_id,sid);assert.equal(body.converted,true);assert.ok(!('twilio_call_sid' in body));
 assert.notEqual(signature('abc',secret),signature('abd',secret));
});
test('privacy projection excludes prohibited fields from every vendor channel, including mapped names',async()=>{
 const privateData={health:'x',plan:'x',carrier:'x',mbi:'x',dob:'x',address:'x',notes:'x',transcript:'x'};
 for(const format of ['json','simple'])assertPrivateFieldsAbsent(availabilityPayload({...sample,...privateData},format));
 assertPrivateFieldsAbsent(dispositionPayload({...disposition,...privateData}));
 assertPrivateFieldsAbsent(mappedDisposition({...disposition,...privateData},{sale:'converted'}));
 assert.equal(dispositionPayload({...disposition,disposition_code:'possible_cognitive_impairment'}).disposition_code,'other');
 const csv=csvReport([{...disposition,...privateData}]);for(const name of Object.keys(privateData))assert.ok(!csv.split('\r\n')[0].includes(name));
 assert.match(csv,/'\+15551231111/);
 for(const name of Object.keys(privateData))assert.throws(()=>mappedDisposition(disposition,{sale:name}));
 assert.throws(()=>mappedDisposition(disposition,{notes:'extra'}));assert.throws(()=>mappedDisposition(disposition,{sale:'duration'}));
});
test('retry backoff, disabled delivery and failures isolated from other worker stages',async()=>{
 assert.deepEqual([1,2,3,9].map(n=>retryDelay('push',n)),[5,10,20,60]);assert.equal(retryDelay('postback',20),3600);
 let sent=0;assert.equal((await deliver({kind:'push'},{active:false},{send:()=>{sent++;}})).result,'disabled');assert.equal(sent,0);
 const stages=[];const fake={rpc:async(name)=>{stages.push(name);if(name==='enqueue_availability_push')return {error:true};return {data:name==='claim_integration_delivery'?[]:null};}};
 await createWorker(fake,{log:()=>{}})();assert.ok(stages.includes('enqueue_disposition_postbacks'));assert.ok(stages.includes('enqueue_daily_vendor_reports'));
});
test('public transport refuses local destinations and unsafe URLs',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('8.8.8.8'),true);assert.throws(()=>validateUrl('http://example.test'));assert.throws(()=>validateUrl('https://user:pass@example.test'));
});

test('postback queue is idempotent, retries for 24 hours, logs attempts and supports manual resend',async()=>{
 await reset();const agg=await source({postback_url:'https://vendor.test/postback',created_at:'2026-01-01T00:00:00Z'});
 const incoming=await call();
 const {rows:[record]}=await db.query("INSERT INTO call_records(tenant_id,call_outcome,metadata) VALUES($1,'enrolled',$2) RETURNING id",[tenant,{wrap_up_saved_at:'2026-09-01T12:00:00Z'}]);
 await db.query('UPDATE inbound_calls SET call_record_id=$1 WHERE id=$2',[record.id,incoming.id]);
 await db.exec('SELECT enqueue_disposition_postbacks(); SELECT enqueue_disposition_postbacks()');
 let jobs=(await db.query('SELECT * FROM integration_deliveries')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].source_id,agg.id);
 assert.equal(jobs[0].payload.twilio_call_sid,sid);assert.equal(jobs[0].payload.sale,true);
 let job=(await db.query('SELECT * FROM claim_integration_delivery()')).rows[0];assert.equal(job.attempts,1);
 await db.query('SELECT finish_integration_delivery($1,$2,500,$3,5)',[job.id,job.lease_token,'http_error']);
 assert.equal((await db.query('SELECT * FROM claim_integration_delivery()')).rows.length,0);
 await db.query("UPDATE integration_deliveries SET available_at=now()-interval '1 second' WHERE id=$1",[job.id]);
 job=(await db.query('SELECT * FROM claim_integration_delivery()')).rows[0];assert.equal(job.attempts,2);
 await db.query("UPDATE integration_deliveries SET expires_at=now()+interval '1 second' WHERE id=$1",[job.id]);
 await db.query('SELECT finish_integration_delivery($1,$2,500,$3,10)',[job.id,job.lease_token,'http_error']);
 assert.equal((await db.query('SELECT status FROM integration_deliveries')).rows[0].status,'failed');
 assert.equal((await db.query('SELECT count(*)::int n FROM integration_delivery_attempts')).rows[0].n,2);
 assert.equal((await db.query('SELECT resend_disposition($1) AS ok',[job.id])).rows[0].ok,true);
 job=(await db.query('SELECT * FROM claim_integration_delivery()')).rows[0];
 await db.query('SELECT finish_integration_delivery($1,$2,200,$3,0)',[job.id,job.lease_token,'sent']);
 assert.equal((await db.query('SELECT status FROM integration_deliveries')).rows[0].status,'sent');
});
test('push retries expire at ten minutes and an in-flight consumer is not double-claimed',async()=>{
 await reset();
 await db.query("INSERT INTO integration_deliveries(kind,consumer_name,dedupe_key,payload,expires_at) VALUES('push','nghs-status','push1',$1,now()+interval '10 minutes'),('push','nghs-status','push2',$1,now()+interval '10 minutes')",[sample]);
 const job=(await db.query('SELECT * FROM claim_integration_delivery()')).rows[0];
 assert.equal((await db.query('SELECT * FROM claim_integration_delivery()')).rows.length,0);
 await db.query("UPDATE integration_deliveries SET expires_at=now()+interval '1 second' WHERE id=$1",[job.id]);
 await db.query("SELECT finish_integration_delivery($1,$2,503,'http_error',5)",[job.id,job.lease_token]);
 assert.equal((await db.query('SELECT status FROM integration_deliveries WHERE id=$1',[job.id])).rows[0].status,'failed');
 assert.ok((await db.query('SELECT * FROM claim_integration_delivery()')).rows[0]);
});
test('daily reports use Eastern dates, DST boundaries, one send per day and zero-call skip',async()=>{
 for(const [day,start,end,run] of [['2026-03-08','2026-03-08T05:00:00Z','2026-03-09T04:00:00Z','2026-03-09T11:00:00Z'],['2026-11-01','2026-11-01T04:00:00Z','2026-11-02T05:00:00Z','2026-11-02T12:00:00Z']]){
  await reset();const agg=await source({report_emails:['vendor@example.test']});
  await source({name:'Empty',type:'publisher',parent_source_id:agg.id,twilio_number:null,report_emails:['empty@example.test']});
  await call({created_at:start});await call({twilio_call_sid:child,created_at:new Date(new Date(end).getTime()-1).toISOString()});
  await call({twilio_call_sid:'CA'+'c'.repeat(32),created_at:end});
  await db.query('SELECT enqueue_daily_vendor_reports($1)',[new Date(new Date(run).getTime()-1000).toISOString()]);
  assert.equal((await db.query('SELECT count(*)::int n FROM integration_deliveries')).rows[0].n,0);
  await db.query('SELECT enqueue_daily_vendor_reports($1)',[run]);await db.query('SELECT enqueue_daily_vendor_reports($1)',[run]);
  const jobs=(await db.query('SELECT * FROM integration_deliveries')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].payload.date,day);assert.equal(jobs[0].payload.calls.length,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM integration_report_log WHERE result='skipped_empty'")).rows[0].n,1);
  let request;
  await deliver(jobs[0],agg,{env:{RESEND_API_KEY:'test-key',INTEGRATIONS_REPORT_FROM:'Reports <reports@example.test>'},send:async(url,body,headers)=>{request={url,body:JSON.parse(body),headers};return {status:200};}});
  assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.headers['Idempotency-Key'],jobs[0].id);
  const csv=Buffer.from(request.body.attachments[0].content,'base64').toString();assert.equal(csv.trim().split('\r\n').length,3);assert.ok(csv.includes('caller_phone'));
 }
});
test('unconfigured destinations produce no deliveries; disabled postbacks and revoked consumers are skipped',async()=>{
 await reset();await call();await db.exec("SELECT enqueue_disposition_postbacks(); SELECT enqueue_daily_vendor_reports('2030-01-02T12:00:00Z')");
 assert.equal((await db.query('SELECT count(*)::int n FROM integration_deliveries')).rows[0].n,0);
 let sends=0;
 const options={send:async()=>{sends++;return{status:200};}};
 assert.equal((await deliver({kind:'postback',payload:disposition},{active:false},options)).result,'disabled');
 assert.equal((await deliver({kind:'postback',payload:disposition},{active:true},options)).result,'disabled');assert.equal(sends,0);
});
test('RPC/table privileges protect vendor secrets and ping credentials are source-bound',async()=>{
 await reset();const agg=await source({ping_key_hash:'test-hash'});
 assert.equal((await db.query("SELECT register_lead_ping('wrong','+15551231111',NULL,NULL) AS ok")).rows[0].ok,false);
 assert.equal((await db.query("SELECT register_lead_ping('test-hash','+15551231111','pub','external') AS ok")).rows[0].ok,true);
 await db.query('UPDATE lead_sources SET active=false WHERE id=$1',[agg.id]);
 assert.equal((await db.query("SELECT register_lead_ping('test-hash','+15551231111',NULL,NULL) AS ok")).rows[0].ok,false);
 const {rows:[r]}=await db.query("SELECT has_table_privilege('anon','lead_sources','SELECT') AS secrets,has_function_privilege('authenticated','claim_integration_delivery()','EXECUTE') AS claim");assert.deepEqual(r,{secrets:false,claim:false});
});

test('persisted exact SID repairs a late link; no timestamp or phone guessing',async()=>{
 await reset();const incoming=await call();
 const {rows:[r]}=await db.query('INSERT INTO call_records(tenant_id,metadata) VALUES($1,$2) RETURNING id',[tenant,{telephony_call:true,twilio_call_sid:sid,telephony_user_id:'user-a'}]);
 await db.exec('SELECT repair_telephony_record_links()');
 assert.equal((await db.query('SELECT reason FROM integration_link_issues')).rows[0].reason,'sid_or_agent_not_found');
 await db.query("INSERT INTO telephony_call_attempts(tenant_id,parent_call_sid,inbound_call_id,agent_id) VALUES($1,$2,$3,'a')",[tenant,sid,incoming.id]);
 await db.exec("UPDATE integration_link_issues SET updated_at=now()-interval '2 minutes'; SELECT repair_telephony_record_links()");
 assert.equal((await db.query('SELECT twilio_call_sid FROM call_records WHERE id=$1',[r.id])).rows[0].twilio_call_sid,sid);
 assert.equal((await db.query('SELECT count(*)::int n FROM integration_link_issues')).rows[0].n,0);
});
test('worker records transport failures and proceeds to the next delivery',async()=>{
 const finished=[],logs=[];
 const job={id:'job-a',kind:'postback',payload:disposition,lease_token:'token',attempts:1,source_id:'source',expires_at:new Date(Date.now()+86400000).toISOString()};
 const jobs=[job,{...job,id:'job-b'}];let sends=0;
 const fake={rpc:async(name,params)=>{
   if(name==='claim_integration_delivery')return {data:jobs.length?[jobs.shift()]:[]};
   if(name==='finish_integration_delivery')finished.push(params);
   return {data:null};
 },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{active:true,postback_url:'https://vendor.test'}})})})})};
 await createWorker(fake,{send:async()=>{sends++;if(sends===1)throw Error('vendor offline');return{status:200};},log:l=>logs.push(l)})();
 assert.equal(finished.length,2);assert.equal(finished[0].p_result,'delivery_error');assert.equal(finished[1].p_result,'sent');assert.equal(finished[0].p_delay,5);
 assert.ok(logs.every(l=>!l.includes(disposition.caller_phone)));
});
test('credential selection and query authentication hash the actual supplied key',async()=>{
 const received=[];const h=createHandler({rpc:async p=>{received.push(p.p_key_hash);return{data:{authorized:p.p_key_hash===await (await import('../../supabase/functions/get-availability/handler.js')).hashKey('valid'),consumer_name:'vendor',feed:sample}};},log:()=>{}});
 assert.equal((await h(new Request('https://feed.test/?key=valid'))).status,200);
 assert.equal((await h(new Request('https://feed.test/?key=valid',{headers:{'x-api-key':'invalid'}}))).status,401);
 assert.notEqual(received[0],received[1]);
});
test('all actual outbound bodies discard private fields, including report attachment content',async()=>{
 const sentinel='PRIVATE_MEDICAL_VALUE';
 const contaminated={...disposition,health:sentinel,plan:sentinel,carrier:sentinel,mbi:sentinel,dob:sentinel,address:sentinel,notes:sentinel};
 const requests=[];const send=async(url,body)=>{requests.push(JSON.parse(body));return{status:200};};
 const env={RESEND_API_KEY:'test',INTEGRATIONS_REPORT_FROM:'reports@example.test'};
 for(const job of [
  {id:'1',kind:'push',payload:{...sample,notes:sentinel,agents:sample.agents.map(a=>({...a,notes:sentinel}))}},
  {id:'2',kind:'postback',payload:contaminated},
  {id:'3',kind:'report',payload:{date:'2026-01-01',calls:[contaminated]}},
 ])await deliver(job,{active:true,push_enabled:true,push_url:'https://vendor.test',push_secret:'x'.repeat(32),postback_url:'https://vendor.test',report_emails:['vendor@example.test']},{send,env});
 for(const body of requests){assertPrivateFieldsAbsent(body);assert.ok(!JSON.stringify(body).includes(sentinel));}
 const csv=Buffer.from(requests[2].attachments[0].content,'base64').toString();assert.ok(!csv.includes(sentinel));
});

test('an in-flight obsolete push cannot retry after a newer status or overlap its send',async()=>{
 await reset();
 await db.exec("UPDATE availability_consumers SET push_url='https://vendor.test/push',push_secret=repeat('s',32),push_enabled=true,push_fingerprint=NULL,push_enqueued_at=NULL");
 await db.exec("SELECT enqueue_availability_push(now()-interval '10 seconds'); SELECT enqueue_availability_push(now())");
 const job=(await db.query('SELECT * FROM claim_integration_delivery()')).rows[0];
 assert.ok(job);
 await db.exec("UPDATE agent_availability SET status='offline',available=false; SELECT enqueue_availability_push(now()-interval '10 seconds'); SELECT enqueue_availability_push(now())");
 assert.equal((await db.query('SELECT * FROM claim_integration_delivery()')).rows.length,0);
 await db.query("SELECT finish_integration_delivery($1,$2,500,'http_error',5)",[job.id,job.lease_token]);
 assert.equal((await db.query('SELECT status FROM integration_deliveries WHERE id=$1',[job.id])).rows[0].status,'canceled');
 const newer=(await db.query('SELECT * FROM claim_integration_delivery()')).rows[0];assert.equal(newer.payload.any_available,false);
});
