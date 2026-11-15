import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import {parse} from 'acorn';
import {createLogger,setLogSink,withLogContext,securityEvent,inspectInput,SECURITY_EVENTS} from '../telephony/src/lib/logger.js';
import {LOG_EVENTS} from '../telephony/src/lib/logEvents.js';
import {ADMIN_HANDLERS,adminRequest,adminActionClient} from '../telephony/src/lib/adminActions.js';
import {ALERT_DEFAULTS} from '../telephony/src/lib/alertPolicy.js';
import {evaluateAlerts,deliverAlert,SECRET_REVIEW_BY,createAlertEvaluator} from '../integrations/alerts.js';
import {secretAllowlist} from '../scripts/security/secret-allowlist.mjs';
import {buildAccessDatabase,fixtureRoster,T,uuid} from './helpers/databaseAccessSchema.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {resolveCallAccessIdentity} from '../netlify/functions/_evidenceAccess.js';
import {createDeploymentStatusHandler} from '../netlify/functions/deployment-status.js';
import {admit} from '../telephony/src/lib/admission.js';
import {disabledResponse} from '../telephony/src/lib/deploymentFeatures.js';
import {validateDestination,deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {appendEvidenceAudit} from '../telephony/src/lib/evidenceAudit.js';
import {runSpreadsheetWorker} from '../netlify/functions/_spreadsheet.js';
import {requireClerkAuth} from '../netlify/functions/_clerkAuth.js';
import {installOperationalTelemetry,flushOperationalTelemetry} from '../telephony/src/lib/operationalTelemetry.js';
let pg,db;
const auth={userId:fixtureRoster[0].clerk_user_id,orgId:'org_SyntheticPilot',tokenPayload:{}};
const sql=(s,args=[])=>pg.query(s,args).then(r=>r.rows);
before(async()=>{
 ({pg}=await buildAccessDatabase());db=freshInstallClient(pg);
 const [{public_profile:p}]=await sql('SELECT public_profile FROM deployment_settings');auth.orgId=p.organizationId;
 await pg.exec('SET ROLE service_role');
 await sql("INSERT INTO deployment_authorities(tenant_id,clerk_user_id,authority) VALUES($1,$2,'admin')",[T,auth.userId]);
});
after(async()=>{if(pg)await pg.close();});
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):/\.(?:js|ts)$/.test(e.name)?[d+'/'+e.name]:[]);
function nodes(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(n=>nodes(n,visit));else if(value&&typeof value==='object')nodes(value,visit);}}
test('all server modules prohibit direct console and output writes outside the shared logger',()=>{
 for(const file of ['netlify','integrations','telephony/src','supabase/functions'].flatMap(walk)){
  if(!file.endsWith('.js'))continue;
  nodes(parse(readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module'}),node=>{
   if(node.type==='Identifier'&&node.name==='console')assert.fail(file+' references console');
   if(file.endsWith('/logger.js'))return;
   if(node.type==='MemberExpression'&&node.property.name==='write'&&['stdout','stderr'].includes(node.object?.property?.name))assert.fail(file+' writes around the logger');
  });
 }
});
test('admin handler enumeration requires shared request and mutation helpers, including new admin guards',()=>{
 for(const file of readdirSync('netlify/functions').filter(f=>f.endsWith('.js')&&!f.startsWith('_'))){
  const source=readFileSync('netlify/functions/'+file,'utf8');
  if(['deployment-status.js','vendor-routing.js'].includes(file)){assert.doesNotMatch(source,/\.(?:insert|update|delete|upsert)\(/);continue;}
  if(/!identity\.admin|!admin|authority!==?'admin'/.test(source)&&/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|await run\(|sessions\.create\(/.test(source))assert.ok(ADMIN_HANDLERS.includes(file.slice(0,-3)),file+' unclassified');
 }
 for(const name of ADMIN_HANDLERS){const source=readFileSync('netlify/functions/'+name+'.js','utf8');assert.match(source,/serverRequest\(/,name);assert.match(source,/adminActionClient\(|logAdminDispatch\(/,name);}
 assert.match(readFileSync('telephony/src/lib/deploymentProvisioning.js','utf8'),/operatorAdminAction\(/);
});
for(const service of ['netlify','telephony','integrations'])test(service+' synthetic logs are structured, correlated and discard every protected field',async()=>{
 const lines=[],restore=setLogSink(line=>lines.push(JSON.parse(line))),correlation=randomUUID();
 const privateValues=['Private Person','2125550199','1EG4TE5MK73','123-45-6789','1955-02-28','88 Private Road','private transcript','private body','https://sink.example/path?token='+'private-capability','private-credential-value'];
 try{await withLogContext({service,correlation_id:correlation},async()=>{
  const logger=createLogger(service);const data=Object.fromEntries(['name','phone','mbi','ssn','dob','address','transcript','body','url','credential'].map((key,i)=>[key,privateValues[i]]));
  logger.info('provider_result',{...data,unknown:privateValues,contact_id:uuid(888),status:200});await Promise.resolve();logger.error('scoring_failed',{error:new Error(privateValues.join(' '))});
 });}finally{restore();}
 assert.equal(lines.length,2);for(const row of lines){assert.equal(row.service,service);assert.equal(row.correlation_id,correlation);assert.ok(row.time&&row.level&&row.deployment&&row.event);}
 assert.equal(lines[0].contact_id,uuid(888));assert.equal(lines[1].message,'Operation failed');
 for(const value of privateValues)assert.ok(!JSON.stringify(lines).includes(value),value);
});
test('event dimensions cannot be supplied as personal data or credentials',()=>{
 const rows=[],restore=setLogSink(l=>rows.push(JSON.parse(l)));try{createLogger('private person','private person').error('privateperson',{name:'Private Person'});}finally{restore();}
 assert.equal(rows[0].event,'server_diagnostic');assert.doesNotMatch(JSON.stringify(rows),/privateperson|Private Person|private person/);
});
for(const event of SECURITY_EVENTS)test('security catalog '+event+' has a safe verified subject and security category',()=>{
 const rows=[],restore=setLogSink(l=>rows.push(JSON.parse(l)));try{securityEvent(event,{subject:auth.userId,token:'never-log',body:'private text'});}finally{restore();}
 assert.equal(rows[0].category,'security');assert.equal(rows[0].event,event);assert.match(rows[0].subject,/^sha256:/);assert.doesNotMatch(JSON.stringify(rows),/never-log|private text/);assert.ok(LOG_EVENTS.includes(event));
});
test('real security triggers: auth failure, admission rejection, feature off, destination, configuration, audit, upload and secret input',async()=>{
 const rows=[],restore=setLogSink(l=>rows.push(JSON.parse(l))),oldKey=process.env.CLERK_JWT_KEY,oldSecret=process.env.CLERK_SECRET_KEY;
 try{
  process.env.CLERK_JWT_KEY='synthetic-verification-key';delete process.env.CLERK_SECRET_KEY;
  await requireClerkAuth(new Request('https://app.example.test'));
  delete process.env.CLERK_JWT_KEY;await requireClerkAuth(new Request('https://app.example.test'));
  await assert.rejects(admit({rpc:async()=>({data:{allowed:false,retry_after:1}})},'coach',auth.userId));
  disabledResponse('GHL_ENABLED');assert.throws(()=>validateDestination('http://forbidden.example',[]));
  await assert.rejects(appendEvidenceAudit({from:()=>({insert:async()=>({error:true})})},{actor:auth.userId,tenant:T,resource:'recording',action:'read',result:'allowed'}));
  await assert.rejects(runSpreadsheetWorker(new Uint8Array(5),'csv',{uploadBytes:1}));
  assert.equal(inspectInput({message:'api_key='+'x'.repeat(36)}),true);
 }finally{restore();if(oldKey===undefined)delete process.env.CLERK_JWT_KEY;else process.env.CLERK_JWT_KEY=oldKey;if(oldSecret===undefined)delete process.env.CLERK_SECRET_KEY;else process.env.CLERK_SECRET_KEY=oldSecret;}
 for(const event of ['verification_failed','admission_rejected','feature_disabled','destination_rejected','configuration_failed','audit_write_failed','upload_rejected','secret_input_detected'])assert.ok(rows.some(r=>r.event===event),event);
});
for(const action of ADMIN_HANDLERS)test('transactional shared boundary logs exactly once: '+action,async()=>{
 const handler=adminRequest(action,async()=>{
  const scoped=adminActionClient(db);await resolveCallAccessIdentity(scoped,auth);
  for(let n=0;n<2;n++){const result=await scoped.from('tenants').update({agency_npn:'1234'}).eq('id',T);assert.equal(result.error,null);}
  return Response.json({ok:true});
 });
 const before=(await sql('SELECT count(*)::int n FROM admin_action_log'))[0].n;
 assert.equal((await handler(new Request('https://app.example.test'))).status,200);
 assert.equal((await sql('SELECT count(*)::int n FROM admin_action_log'))[0].n,before+1);
 const [row]=await sql('SELECT * FROM admin_action_log ORDER BY occurred_at DESC LIMIT 1');assert.equal(row.actor_id,auth.userId);assert.equal(row.action,action.replaceAll('-','_'));assert.equal(row.tenant_id,T);assert.equal(row.result,'succeeded');assert.doesNotMatch(JSON.stringify(row),/agency_npn|1234/);
});
test('a failed administrator audit insert rolls back the actual mutation',async()=>{
 await pg.exec("RESET ROLE;CREATE FUNCTION synthetic_admin_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END$$;CREATE TRIGGER synthetic_admin_failure BEFORE INSERT ON admin_action_log FOR EACH ROW EXECUTE FUNCTION synthetic_admin_failure();SET ROLE service_role");
 const before=(await sql('SELECT agency_npn FROM tenants WHERE id=$1',[T]))[0].agency_npn;
 try{await assert.rejects(adminRequest('tenant-settings',async()=>{const scoped=adminActionClient(db);await resolveCallAccessIdentity(scoped,auth);return scoped.from('tenants').update({agency_npn:'9999'}).eq('id',T);})(new Request('https://app.example.test')));assert.equal((await sql('SELECT agency_npn FROM tenants WHERE id=$1',[T]))[0].agency_npn,before);await assert.rejects(sql("UPDATE deployment_authorities SET authority='manager' WHERE tenant_id=$1 AND clerk_user_id=$2",[T,auth.userId]));assert.equal((await sql('SELECT authority FROM deployment_authorities WHERE tenant_id=$1 AND clerk_user_id=$2',[T,auth.userId]))[0].authority,'admin');}
 finally{await pg.exec('RESET ROLE;DROP TRIGGER synthetic_admin_failure ON admin_action_log;DROP FUNCTION synthetic_admin_failure();SET ROLE service_role');}
});
for(const role of ['anon','authenticated','service_role','none'])test('admin log rejects UPDATE, DELETE and TRUNCATE as '+role,async()=>{
 await pg.exec(role==='none'?'RESET ROLE':'SET ROLE '+role);
 try{for(const operation of ["UPDATE admin_action_log SET result='denied'",'DELETE FROM admin_action_log','TRUNCATE admin_action_log'])await assert.rejects(pg.exec(operation));}
 finally{await pg.exec('RESET ROLE;SET ROLE service_role');}
});
test('only protected administrators can read administrator and alert history',async()=>{
 for(const [subject,visible] of [[auth.userId,true],[fixtureRoster[1].clerk_user_id,false],['unknown',false]]){
  await pg.exec('RESET ROLE');await sql("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:subject,org_id:auth.orgId,role:'authenticated'})]);await pg.exec('SET ROLE authenticated');
  assert.equal((await sql('SELECT count(*)::int n FROM admin_action_log'))[0].n>0,visible);
 }
 await pg.exec('RESET ROLE;SET ROLE service_role');
});
const empty={queues:[],subject_denials:[],provider_requests:0,provider_errors:0};
const noSecretClock=Date.parse('2026-11-01T00:00:00Z');
const cases=[['queue_depth',{queues:[{queue:'integration_deliveries',depth:50,oldest_age_seconds:0}]}],['queue_age',{queues:[{queue:'integration_deliveries',depth:1,oldest_age_seconds:300}]}],['exhausted_jobs',{failed_jobs:1}],['lease_conflicts',{lease_conflicts:3}],['audit_failures',{audit_failures:1}],['subject_denials',{subject_denials:[{subject:'sha256:'+'a'.repeat(64),count:5}]}],['rate_rejections',{rate_rejections:20}],['provider_error_rate',{provider_requests:5,provider_errors:1}],['paid_budget',{paid_budget_percent:80}],['purge_failures',{purge_failures:1}],['routing_anomalies',{routing_anomalies:1}],['secret_review',{}]];
for(const [rule,metrics] of cases)test('alert '+rule+' raises at threshold, deduplicates durably, and clears once',async()=>{
 const now=rule==='secret_review'?Date.parse('2026-12-02T00:00:00Z'):noSecretClock,conditions=evaluateAlerts({...empty,...metrics},ALERT_DEFAULTS,now).filter(c=>c.rule===rule);assert.equal(conditions.length,1);
 const run=async c=>{const result=await db.rpc('transition_operational_alerts',{p_conditions:c});assert.equal(result.error,null);};
 await run([]);const before=(await sql('SELECT count(*)::int n FROM operational_alert_history WHERE rule=$1',[rule]))[0].n;
 await run(conditions);await run(conditions);assert.equal((await sql('SELECT count(*)::int n FROM operational_alert_history WHERE rule=$1',[rule]))[0].n,before+1);
 await run([]);await run([]);assert.equal((await sql('SELECT count(*)::int n FROM operational_alert_history WHERE rule=$1',[rule]))[0].n,before+2);
});
test('disabled delivery sends nothing, webhook is allowlisted and signed; email uses its existing switch',async()=>{
 const base=JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON),alert={id:randomUUID(),rule:'queue_depth',state:'raised',count:50,threshold:50},sent=[];
 const send=async(url,body,headers)=>{sent.push({url,body,headers});return {status:200};};
 assert.deepEqual(await deliverAlert(alert,{env:{DEPLOYMENT_PROFILE_JSON:JSON.stringify(base)},send}),[]);assert.equal(sent.length,0);
 const secret='synthetic-signing-value-'.repeat(3);base.alerting={webhook:{url:'https://app.example.test/alerts',secret}};
 await deliverAlert(alert,{env:{DEPLOYMENT_PROFILE_JSON:JSON.stringify(base)},send});assert.equal(sent.length,1);
 assert.equal(sent[0].headers['X-Alert-Signature'],'sha256='+createHmac('sha256',secret).update(sent[0].headers['X-Alert-Timestamp']+'.'+sent[0].body).digest('hex'));assert.doesNotMatch(sent[0].body,/synthetic-signing/);
 base.alerting.webhook.url='https://foreign.example/alerts';assert.throws(()=>deploymentProfile({DEPLOYMENT_PROFILE_JSON:JSON.stringify(base)}));
});
test('review date is bound to the unchanged active secret exception',()=>{assert.equal(secretAllowlist.find(e=>e.status==='active, rotation pending').reviewBy,SECRET_REVIEW_BY);});
test('real operational metrics and status endpoint expose counts only and require protected admin',async()=>{
 const metrics=await db.rpc('operational_status');assert.equal(metrics.error,null);assert.ok(metrics.data.queues.length>=10);
 const handler=subject=>createDeploymentStatusHandler({authenticate:async()=>({...auth,userId:subject}),getDb:()=>db});
 const response=await handler(auth.userId)(new Request('https://app.example.test/api/deployment-status'));assert.equal(response.status,200);const data=await response.json();assert.deepEqual(Object.keys(data).sort(),['active_alerts','failed_jobs','features','last_purge_dry_run','last_success','queues']);assert.doesNotMatch(JSON.stringify(data),/clerk_user|subject_id|agent_name|transcript_text|phone_number|signing_secret/i);
 assert.equal((await handler(fixtureRoster[1].clerk_user_id)(new Request('https://app.example.test/api/deployment-status'))).status,403);
});
test('scheduled evaluator persists its heartbeat and telemetry without a delivery transport when disabled',async()=>{
 installOperationalTelemetry(db);securityEvent('authorization_denied',{subject:auth.userId});await flushOperationalTelemetry();
 await createAlertEvaluator(db,{now:()=>noSecretClock,send:()=>assert.fail('disabled delivery')})();
 assert.ok((await sql("SELECT last_success_at FROM scheduled_job_status WHERE job='alert_evaluator'"))[0].last_success_at);
});
test('alert conditions remain clear below each threshold',()=>{
 const m={...empty,queues:[{queue:'integration_deliveries',depth:49,oldest_age_seconds:299}],failed_jobs:0,lease_conflicts:2,audit_failures:0,rate_rejections:19,provider_requests:5,provider_errors:0,paid_budget_percent:79,purge_failures:0,routing_anomalies:0,subject_denials:[{subject:'sha256:'+'a'.repeat(64),count:4}]};
 assert.deepEqual(evaluateAlerts(m,ALERT_DEFAULTS,noSecretClock),[]);
});
test('email has two independent switches and preserves the existing operational envelope',async()=>{
 const base=JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON),alert={id:randomUUID(),rule:'lease_conflicts',state:'cleared',count:0,threshold:3},sent=[];
 base.alerting={email:true};const send=async(url,body,headers)=>{sent.push({url,body:JSON.parse(body),headers});return {status:200};};
 const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(base),RESEND_API_KEY:'synthetic'+'-mail-credential'};
 await deliverAlert(alert,{env,send});assert.equal(sent.length,0);
 await deliverAlert(alert,{env:{...env,OPERATIONAL_EMAIL_ENABLED:'true'},send});assert.equal(sent.length,1);assert.deepEqual(sent[0].body.to,base.email.recipients);assert.ok(sent[0].headers['Idempotency-Key']);assert.doesNotMatch(JSON.stringify(sent[0].body),/synthetic-mail-credential/);
});
test('delivery leases throttle retries, preserve successful channels, and send one recovery',async()=>{
 await pg.exec("RESET ROLE;UPDATE operational_alert_history SET delivered_at=clock_timestamp();UPDATE operational_alert_state SET active=false;SET ROLE service_role");
 const profile=JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON);profile.alerting={email:true,thresholds:{evaluationSeconds:1,rateRejections:2},webhook:{url:'https://app.example.test/alerts',secret:'synthetic-webhook-signing-'.repeat(3)}};
 const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),OPERATIONAL_EMAIL_ENABLED:'true',RESEND_API_KEY:'synthetic'+'-mail-credential'};
 let time=Date.now(),webhookOk=false;const sent=[];
 const tick=createAlertEvaluator(db,{env,now:()=>time,send:async(url,body)=>{const channel=url===profile.email.endpoint?'email':'webhook';sent.push({channel,body:JSON.parse(body)});return {status:channel==='email'||webhookOk?200:503};}});
 for(let n=0;n<2;n++)assert.equal((await db.rpc('record_operational_event',{p_event:'admission_rejected',p_level:'warn'})).error,null);
 await tick();time+=1100;await tick();assert.equal(sent.filter(s=>s.channel==='email').length,1);assert.equal(sent.filter(s=>s.channel==='webhook').length,1);
 await pg.exec("RESET ROLE;UPDATE operational_alert_history SET attempted_at=clock_timestamp()-interval '301 seconds' WHERE delivered_at IS NULL;SET ROLE service_role");webhookOk=true;time+=1100;await tick();assert.equal(sent.filter(s=>s.channel==='email').length,1);assert.equal(sent.filter(s=>s.channel==='webhook').length,2);
 await pg.exec("RESET ROLE;DELETE FROM operational_events WHERE event='admission_rejected';SET ROLE service_role");time+=1100;await tick();time+=1100;await tick();assert.equal(sent.filter(s=>s.channel==='webhook'&&s.body.state==='cleared').length,1);
});
test('paid budget checks the configured deployment request caps without changing their limits',async()=>{
 const key=T+':coach:deployment-day';const [existing]=await sql("SELECT coalesce(max(used),0)::int used FROM admission_counters WHERE key_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[key]);
 const check=await db.rpc('operational_paid_budget',{p_budgets:[{key,limit:10}]});assert.equal(check.error,null);assert.ok(check.data>=0);assert.equal((await sql("SELECT coalesce(max(used),0)::int used FROM admission_counters WHERE key_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[key]))[0].used,existing.used);
});
test('profile changes and retention overrides leave numeric-only operator before and after summaries',async()=>{
 const result=await db.rpc('configure_operational_profile',{p_summary:{retention_evidence_audit_years:10,approved_retention_overrides:0}});assert.equal(result.error,null);
 const changed=await db.rpc('configure_operational_profile',{p_summary:{retention_evidence_audit_years:11,approved_retention_overrides:1}});assert.equal(changed.error,null);
 const [row]=await sql("SELECT before_summary,after_summary FROM admin_action_log WHERE action='operator_operational_profile' AND after_summary->>'retention_evidence_audit_years'='11' ORDER BY occurred_at DESC LIMIT 1");assert.equal(row.before_summary.retention_evidence_audit_years,10);assert.equal(row.after_summary.retention_evidence_audit_years,11);assert.equal(row.after_summary.approved_retention_overrides,1);
 assert.ok((await db.rpc('configure_operational_profile',{p_summary:{reason:'Private Person'}})).error);
});
test('session unlock and paid-budget triggers record security reasons with the verified subject',async()=>{
 const {createSessionLockEventsHandler}=await import('../netlify/functions/session-lock-events.js');const {llmRuntime}=await import('../netlify/functions/_llmTelemetry.js');
 const rows=[],restore=setLogSink(line=>rows.push(JSON.parse(line)));
 try{
  const handler=createSessionLockEventsHandler({authenticate:async()=>auth,getDb:()=>db});
  assert.equal((await handler(new Request('https://app.example.test/api/session-lock-events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'session_unlock_failed'})}))).status,200);
  const runtime=llmRuntime({rpc:async()=>({data:{status:'daily_cap'}})},T,null,{pass_id:randomUUID(),subject:auth.userId});
  await assert.rejects(runtime.authorizeScoringRequest({max_completion_tokens:1},'synthetic-model',randomUUID()));
 }finally{restore();}
 for(const event of ['session_lock_failed','budget_rejected']){const row=rows.find(r=>r.event===event);assert.ok(row);assert.equal(row.category,'security');assert.match(row.subject,/^sha256:/);}
});
test('a signed-admin claim alone cannot read the protected administrator trail or operational status',async()=>{
 const subject=fixtureRoster[1].clerk_user_id;await pg.exec('RESET ROLE');await sql("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:subject,org_id:auth.orgId,org_role:'org:admin',role:'authenticated'})]);await pg.exec('SET ROLE authenticated');
 try{assert.equal((await sql('SELECT count(*)::int n FROM admin_action_log'))[0].n,0);}finally{await pg.exec('RESET ROLE;SET ROLE service_role');}
 const handler=createDeploymentStatusHandler({authenticate:async()=>({...auth,userId:subject,tokenPayload:{org_role:'org:admin'}}),getDb:()=>db});assert.equal((await handler(new Request('https://app.example.test/api/deployment-status'))).status,403);
});
test('service-set context cannot bypass operator auditing and the transaction permit is private',async()=>{
 const before=(await sql('SELECT count(*)::int n FROM admin_action_log'))[0].n;
 await sql("SELECT set_config('enrollgen.admin_request','forged-context',false)");await sql("UPDATE deployment_authorities SET team_agent_ids='{}' WHERE tenant_id=$1 AND clerk_user_id=$2",[T,auth.userId]);
 assert.equal((await sql('SELECT count(*)::int n FROM admin_action_log'))[0].n,before+1);
 await assert.rejects(sql('INSERT INTO admin_action_permit VALUES(txid_current(),$1)',[randomUUID()]));
});
test('operator roster batches record provisioning and deactivation UUID summaries exactly once',async()=>{
 const {provisionDeployment}=await import('../telephony/src/lib/deploymentProvisioning.js');
 const profile=JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON);profile.tenantId=T;profile.organizationId=auth.orgId;
 const agents=fixtureRoster.map((agent,index)=>({...agent,tenant_id:T,is_active:index!==3}));
 const before=(await sql("SELECT count(*)::int n FROM admin_action_log WHERE action='provision_deployment_roster'"))[0].n;
 await provisionDeployment(db,agents,{DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile)});
 const rows=await sql("SELECT * FROM admin_action_log WHERE action='provision_deployment_roster' ORDER BY occurred_at DESC");assert.equal(rows.length,before+1);assert.equal(rows[0].after_summary.active_count,3);assert.equal(rows[0].before_summary.active_count,4);assert.equal(rows[0].after_summary.active_agent_ids.length,3);assert.equal(rows[0].actor_id,'service:deployment_operator');
 for(const id of rows[0].after_summary.active_agent_ids)assert.match(id,/^[a-f0-9-]{36}$/);assert.doesNotMatch(JSON.stringify(rows[0]),/identity_aliases|licensed_states|npn/);
});
test('purge status preserves the real retention classes, strips non-count fields, and alerts on partial failures',async()=>{
 await sql("INSERT INTO retention_runs(mode,status,finished_at,counts,failures) VALUES('dry-run','complete',clock_timestamp(),$1,$2)",[JSON.stringify({enrollmentRecording:2,evidenceAudit:3,contactReview:1,name:'Synthetic Private',phone:'2125550199'}),JSON.stringify({delete_failed:1})]);
 const result=await db.rpc('operational_status');assert.equal(result.error,null);assert.deepEqual(result.data.last_purge_dry_run.counts,{enrollmentRecording:2,evidenceAudit:3,contactReview:1});assert.equal(result.data.last_purge_dry_run.failures.delete_failed,1);assert.ok(result.data.purge_failures>=1);assert.doesNotMatch(JSON.stringify(result.data),/Synthetic Private|2125550199/);
});
