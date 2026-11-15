import {auditSink} from './helpers/auditSink.js';
import {previousConverselyWeek,currentConverselyWeek} from '../integrations/converselySelection.js';
import {createWorker} from '../integrations/worker.js';
import {forbiddenIdentityOffsets} from '../scripts/security/agency-fingerprints.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {deploymentProfile,parseDeploymentProfile,publicDeploymentProfile,validateDestination,agencyPhone,staffedHoursLabel,isStaffed} from '../telephony/src/lib/deploymentProfile.js';
import {deploymentFeatures} from '../telephony/src/lib/deploymentFeatures.js';
import {validateRoster,writingAgent,rosterIdentity} from '../telephony/src/lib/deploymentRoster.js';
import {previousReportDate,zonedMidnight} from '../telephony/src/lib/deploymentSchedule.js';
import {normalizeIntake,emptyIntake,intakeErrors,ghlPayload} from '../src/lib/enrollmentIntake.js';
import {deliverEnrollmentWebhooks} from '../integrations/enrollmentWebhook.js';
import roster from './fixtures/deployment-roster.json' with {type:'json'};
const fixture=()=>JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON);
const valid=agent=>normalizeIntake({...emptyIntake(agent.name,roster),writingAgentId:agent.id,firstName:'Synthetic',lastName:'Member',dob:'1955-02-28',phone:'2125550199',state:'NY',mbi:'1ab2cd3ef45',prevCarrier:'Original Medicare',newCarrier:'Aetna',planName:'Test Plan',enrollCode:'AEP',premium:'0',contractId:'H1234',planId:'001',sixtyDayDate:'2027-03-02'});

test('all 12 active agents can be selected and validated; unknown, inactive and mismatched IDs are rejected',()=>{
 const active=validateRoster(roster,{ghl:true});assert.equal(active.length,12);
 for(const agent of active){assert.equal(writingAgent(active,agent.id),agent);assert.equal(writingAgent(active,agent.name),agent);assert.deepEqual(intakeErrors(valid(agent),active),{});assert.equal(ghlPayload(valid(agent),'2026-11-14T12:00:00Z',active).assignedUserId,agent.ghl_user_id);}
 assert.ok(intakeErrors({...valid(active[0]),aor:'Unknown Agent 13'},active).aor);
 assert.throws(()=>writingAgent(active,'Unknown Agent 13'));
 assert.ok(intakeErrors({...valid(active[0]),writingAgentId:active[1].id},active).aor);
 assert.ok(intakeErrors(valid(active[0]),active.map(a=>({...a,is_active:false}))).aor);
 assert.equal(rosterIdentity({id:'unknown',fullName:active[0].name,unsafeMetadata:{agent_id:active[0].agent_slug}},active),null);
 assert.equal(rosterIdentity({id:active[0].clerk_user_id},active)?.id,active[0].id);
 assert.throws(()=>validateRoster([...active,{...active[0]}]));
});

test('synthetic enrollment delivery has exactly one destination and uses the writing agent provider ID',async()=>{
 const profile=fixture();profile.ghl.enrollmentUrl='https://sink.example/enrollment';profile.ghl.postCallUrl='https://sink.example/post-call';profile.allowedHosts=['sink.example'];profile.appOrigin='https://sink.example';profile.telephonyOrigin='https://sink.example';
 const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),GHL_ENABLED:'true'};
 const sent=[],payload=ghlPayload(valid(roster[11]),'2026-11-14T12:00:00Z',roster);let claimed=false,finished=false;
 const db={rpc:async(name)=>({data:name==='claim_compliance_upload'?(claimed?[]:(claimed=true,[{id:'job',tenant_id:profile.tenantId,lease_token:'lease'}])):name==='decrypt_pii_value'?JSON.stringify(payload):(finished=true,null)}),from(table){const q={select(){return q},eq(){return q},single:async()=>({data:table==='enrollment_intakes'?{is_test_enrollment:false}:{payload_encrypted:{},intake_id:'intake'}})};return q;}};
 await deliverEnrollmentWebhooks(auditSink(db),{env,send:async(url,body)=>{sent.push({host:new URL(url).host,body:JSON.parse(body)});return {status:200};}});
 assert.equal(finished,true);assert.equal(sent.length,1);assert.deepEqual(sent.map(s=>s.host),['sink.example']);assert.equal(sent[0].body.assignedUserId,roster[11].ghl_user_id);
});

test('profile fails closed without required values and validates only enabled integration sections',async()=>{
 const p=fixture();for(const key of ['email','ghl','ix','paragon','conversely'])delete p[key];
 assert.ok(parseDeploymentProfile(p,deploymentFeatures({})));
 const forbidden=()=>assert.fail('Disabled service touched a database');
 await createWorker({rpc:forbidden,from:forbidden},{env:{DEPLOYMENT_PROFILE_JSON:JSON.stringify(p)},send:forbidden,log:()=>{}})();
 for(const key of ['tenantId','organizationId','agencyName','agencyLine','textSender','timezone','staffedHours','allowedHosts','appOrigin','telephonyOrigin']){const bad=structuredClone(p);delete bad[key];assert.throws(()=>parseDeploymentProfile(bad,deploymentFeatures({})),key);}
 for(const [flag,key] of [['GHL_ENABLED','ghl'],['CONVERSELY_UPLOAD_ENABLED','conversely'],['IX_UPLOAD_ENABLED','ix'],['PARAGON_ENABLED','paragon'],['OPERATIONAL_EMAIL_ENABLED','email']])assert.throws(()=>parseDeploymentProfile(p,deploymentFeatures({[flag]:'true'})),new RegExp(key));
 const bad=fixture();bad.timezone='Not/AZone';assert.throws(()=>parseDeploymentProfile(bad),/timezone/);
 const publicProfile=publicDeploymentProfile(deploymentProfile());for(const key of ['email','ghl','ix','paragon','conversely','allowedHosts','textSender'])assert.equal(Object.hasOwn(publicProfile,key),false);
});

test('startup modules reject missing profile before service construction; errors do not echo values',()=>{
 const env={...process.env};delete env.DEPLOYMENT_PROFILE_JSON;
 for(const module of ['./integrations/supabase.js','./telephony/src/config.js']){
 const child=spawnSync(process.execPath,['--input-type=module','-e',`import '${module}'`],{env,encoding:'utf8'});assert.notEqual(child.status,0);assert.match(child.stderr,/deployment profile/);
 }
 const child=spawnSync(process.execPath,['--input-type=module','-e',"import {deploymentProfile} from './telephony/src/lib/deploymentProfile.js';deploymentProfile()"],{env:{...env,DEPLOYMENT_PROFILE_JSON:'secret-must-not-be-echoed'},encoding:'utf8'});
 assert.notEqual(child.status,0);assert.doesNotMatch(child.stderr,/secret-must-not-be-echoed/);
});

test('delivery destinations reject insecure, foreign, local, internal, numeric and credential-bearing URLs',()=>{
 assert.equal(validateDestination('https://sink.example/path',['sink.example']),'https://sink.example/path');
 for(const url of ['http://sink.example','https://foreign.example','https://localhost','https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::1]','https://10.0.0.1','https://metadata.internal','https://agency.local','https://user:pass@sink.example','https://sink.example:8443','https://sink.example/#fragment']){
  assert.throws(()=>validateDestination(url,url.includes('foreign.example')?['sink.example']:['sink.example',new URL(url).hostname]),url==='https://foreign.example'?undefined:undefined);
 }
});

test('calendar reports, staffed hours and midnight windows follow DST in the selected IANA zone',()=>{
 const p=fixture();p.timezone='America/Los_Angeles';
 assert.equal(previousConverselyWeek('2026-03-09T06:30:00Z',p.timezone),'2026-02-23');
 assert.equal(currentConverselyWeek('2026-03-09T07:30:00Z',p.timezone),'2026-03-09');
 assert.equal(zonedMidnight('2026-03-08',p.timezone),'2026-03-08T08:00:00.000Z');
 assert.equal(zonedMidnight('2026-03-09',p.timezone),'2026-03-09T07:00:00.000Z');
 assert.equal(zonedMidnight('2026-11-01',p.timezone),'2026-11-01T07:00:00.000Z');
 assert.equal(zonedMidnight('2026-11-02',p.timezone),'2026-11-02T08:00:00.000Z');
 assert.equal(previousReportDate('2026-03-09T06:30:00Z',p.timezone),'2026-03-07');
 assert.equal(previousReportDate('2026-11-02T07:30:00Z',p.timezone),'2026-10-31');
 assert.equal(isStaffed('2026-03-06T18:00:00Z',p),true);assert.equal(isStaffed('2026-03-09T17:00:00Z',p),true);
 assert.equal(isStaffed('2026-11-02T17:59:00Z',p),false);assert.equal(isStaffed('2026-11-02T18:00:00Z',p),true);
 assert.match(staffedHoursLabel(p),/Monday through Friday, 10 AM to 6 PM/);assert.equal(agencyPhone(p),'(212) 555-0100');
});

test('runtime sources contain none of the Appendix A deployment identifiers',()=>{

 const scan=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='fixtures'?[]:scan(path.join(d,e.name))):/\.(?:js|mjs|cjs|jsx|ts|tsx|html|sql|json|yml|py)$/.test(e.name)?[path.join(d,e.name)]:[]);
 const hits=[];
 for(const file of scan('supabase/seeds'))assert.doesNotMatch(readFileSync(file,'utf8'),/https?:\/\//,'Fresh seeds must not contain live URLs');
 for(const file of ['src','netlify','integrations','telephony/src','status-page','supabase/seeds','supabase/bootstrap','supabase/functions','scripts','telephony/scripts','infra'].flatMap(scan)){
  const content=readFileSync(file,'utf8');if(forbiddenIdentityOffsets(content).length)hits.push(file);
 }
 assert.deepEqual(hits,[]);
});
