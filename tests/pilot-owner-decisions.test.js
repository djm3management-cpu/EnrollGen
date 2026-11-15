import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {normalizeRtsChunk} from '../netlify/functions/rts-ingest.js';
import {runKnowledgeUpdate,generateKnowledgeUpdate} from '../netlify/functions/_knowledgeUpdate.js';
import {parseRtsFile,normalizeChunkResult} from '../netlify/functions/_rtsIngestion.js';
import {createOpenAIAdapter} from '../src/lib/llm/openai.ts';
import {complete} from '../src/lib/llm/client.ts';
import {resolveModel} from '../src/lib/llm/config.js';
import {coachingFormat} from '../src/lib/llm/schemas/coaching.js';
import {ghlPayload} from '../src/lib/enrollmentIntake.js';
import {GHL_INTAKE_FIELDS,GHL_POST_CALL_FIELDS,allowlistedGhlPayload} from '../src/lib/ghlFields.js';
import {buildGhlWebhookPayload} from '../netlify/lib/postCallWork.js';
import roster from './fixtures/deployment-roster.json' with {type:'json'};
const protectedText='DOB 1955-02-28 Medicare 1EG4-TE5-MK73 SSN 123-45-6789';
function fakeRuntime(output,env={}) {
 const requests=[],rows=[];
 return {requests,rows,runtime:{env:{RTS_INGESTION_OPENAI_MODEL:'gpt-5.6-luna',KNOWLEDGE_UPDATE_OPENAI_MODEL:'gpt-5.6-luna',...env},
  sleep:async()=>{},telemetry:async row=>rows.push(row),
  adapters:{openai:createOpenAIAdapter({OPENAI_API_KEY:'fake-only'},async(url,init)=>{
   assert.equal(String(url),'https://api.openai.com/v1/responses');
   const body=JSON.parse(init.body);requests.push(body);
   assert.doesNotMatch(JSON.stringify(body),/1955-02-28|1EG4-TE5-MK73|123-45-6789/);
   return Response.json({id:'synthetic',model:body.model,status:'completed',usage:{input_tokens:30,output_tokens:20},
    output:[{type:'message',content:[{type:'output_text',text:typeof output==='string'?output:JSON.stringify(output)}]}]});
  })}}};
}
function admissionDb(allowed=true) {
 const rules=[];
 return {rules,async rpc(name,args){
  if(name==='resolve_deployment_subject')return {data:[{}]};
  assert.equal(name,'consume_admission');rules.push(args.p_rules);
  return {data:{allowed,retry_after:60}};
 }};
}
const known={carriers:[],agents:[]};
const context={tenant:{id:'fixture'},actor:{clerk_user_id:'verified-admin'}};
const rts={source_format:{detected_columns:{Producer:'agent_name',NPN:'agent_npn',Carrier:'carrier_raw_name',Status:'contract_status'},row_count:1,source_type:'Ritter',confidence:1},
 agents_matched:[],carrier_mappings:[],warnings:[],rts_records:[{agent_raw_name:'Jane Doe',agent_npn:'123456',carrier_raw_name:'Aetna',product_line:'Medicare Advantage',contract_status:'ACTIVE',states:[{state:'FL',sub_status:'APT'}],writing_number:null,certifications:[],termination_date:null,effective_date:null}]};

test('RTS synthetic carrier CSV uses the OpenAI SDK, strict schema, shared scrub, usage audit and summary budgets',async()=>{
 const parsed=await parseRtsFile(new File(['Producer,NPN,Carrier,Status\nJane Doe,123456,Aetna,Active\n'],'appointments.csv'));
 const h=fakeRuntime(rts),db=admissionDb();
 const result=await normalizeRtsChunk(db,context,{...known,agents:[{notes:protectedText}]},{start:0,rows:parsed.rows},h.runtime);
 assert.deepEqual(result,normalizeChunkResult(rts,0,1));
 assert.equal(result.rts_records[0].carrier_raw_name,'Aetna');assert.equal(result.rts_records[0].contract_status,'ACTIVE');
 assert.equal(h.requests[0].text.format.name,'rts_normalization');assert.equal(h.requests[0].text.format.strict,true);
 assert.equal(h.requests[0].max_output_tokens,12000);assert.equal(db.rules.length,1);
 assert.ok(db.rules[0].some(rule=>rule.seconds===86400&&rule.limit===100));
 assert.ok(db.rules[0].some(rule=>rule.seconds===86400&&rule.limit===1200));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.rows[0].prompt_tokens,30);
});
for(const output of ['not JSON',JSON.stringify({...rts,rts_records:'bad'})])test(`RTS rejects malformed output ${output.slice(0,8)} without retrying`,async()=>{
 const h=fakeRuntime(output);await assert.rejects(normalizeRtsChunk(admissionDb(),context,known,{start:0,rows:[{Carrier:'Aetna'}]},h.runtime),/strict schema/);
 assert.equal(h.requests.length,1);
});
test('RTS denied and unavailable admission cannot make any OpenAI request',async()=>{
 const h=fakeRuntime(rts);
 for(const db of [admissionDb(false),{rpc:async()=>({error:{code:'57014'}})}])await assert.rejects(normalizeRtsChunk(db,context,known,{start:0,rows:[]},h.runtime));
 assert.equal(h.requests.length,0);
});

test('knowledge job uses shared OpenAI scrub and budgets, writes a valid proposal and leaves live content unchanged',async()=>{
 const previous=process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED;process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED='true';
 try{
  const entry={id:'entry',tenant_id:'fixture',key:'synthetic',content:protectedText,source_urls:['https://source.invalid']};
  const inserts=[],db=admissionDb();
  db.from=table=>{
   if(table==='knowledge_updates')return {insert:async row=>{inserts.push(row);return {};}};
   assert.equal(table,'knowledge_base');
   const query={select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},then(resolve){resolve({data:[entry]});}};return query;
  };
  const h=fakeRuntime({changed:true,summary:'New regulatory date.',confidence:0.9,updatedContent:'Proposed synthetic knowledge.'});
  const result=await runKnowledgeUpdate({tenantId:'fixture'},{getDb:()=>db,fetchSources:async()=>protectedText,runtime:h.runtime});
  assert.equal(result.results[0].result,'pending_review');assert.equal(inserts[0].new_content,'Proposed synthetic knowledge.');assert.equal(inserts[0].status,'pending_review');
  assert.equal(entry.content,protectedText);assert.equal(db.rules.length,1);assert.equal(h.requests[0].text.format.name,'knowledge_update');
  const denied=admissionDb(false);denied.from=db.from;
  await assert.rejects(runKnowledgeUpdate({tenantId:'fixture'},{getDb:()=>denied,fetchSources:async()=>'',runtime:h.runtime}),e=>e.status===429);
  assert.equal(h.requests.length,1);
  const malformed=fakeRuntime('not JSON');
  const failure=await runKnowledgeUpdate({tenantId:'fixture'},{getDb:()=>db,fetchSources:async()=>'',runtime:malformed.runtime});
  assert.equal(failure.results[0].result,'error');assert.equal(inserts[1].status,'draft');assert.equal(inserts[1].new_content,null);
  assert.equal(inserts[1].change_summary,'Agentic update failed.');
 }finally{if(previous===undefined)delete process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED;else process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED=previous;}
});
test('knowledge no-change and malformed responses retain fail-closed semantics',async()=>{
 const h=fakeRuntime({changed:false,summary:'',confidence:0,updatedContent:''});
 assert.equal((await generateKnowledgeUpdate({content:protectedText},protectedText,h.runtime)).changed,false);
 for(const output of ['CHANGES_DETECTED',{}, {changed:true,summary:'',confidence:2,updatedContent:''},{changed:true,summary:'',confidence:0.9,updatedContent:''}]){
  const bad=fakeRuntime(output);await assert.rejects(generateKnowledgeUpdate({content:''},'',bad.runtime));assert.equal(bad.requests.length,1);
 }
});
for(const engine of ['ANCILLARY','ANNUITY'])test(`${engine} interventions share the OpenAI model and scrubbed completion contract`,async()=>{
 const intervention={level:'warn',issue_tag:'suitability',confidence:0.95,message:'Review the suitability checklist.'};
 const h=fakeRuntime(intervention);const result=await complete({engine,system:protectedText,messages:[{role:'user',content:protectedText}],response_format:coachingFormat},h.runtime);
 assert.deepEqual(result.parsed,intervention);assert.equal(h.requests[0].model,resolveModel(undefined,{}));assert.equal(h.requests.length,1);
});
test('both job model settings are explicit, fail clearly when missing, and never use the general fallback',async()=>{
 for(const [task,setting] of [['rts_ingestion','RTS_INGESTION_OPENAI_MODEL'],['knowledge_update','KNOWLEDGE_UPDATE_OPENAI_MODEL']]){
  const h=fakeRuntime({},{[setting]:''});
  await assert.rejects(complete({engine:'MA',path:'summary',task,system:'',messages:[]},h.runtime),new RegExp(setting));assert.equal(h.requests.length,0);
 }
});
test('both GHL payloads have exact allowlists, preserve all remaining values and drop future fields by default',()=>{
 const data=Object.fromEntries(GHL_INTAKE_FIELDS.map(key=>[key,`fixture-${key}`]));
 Object.assign(data,{dob:'1955-02-28',mbi:'1EG4-TE5-MK73',medicaidNum:'PRIVATE-CASE',medicaid:'Yes',aor:roster[0].name,writingAgentId:roster[0].id,newPrivateField:protectedText});
 const payload=ghlPayload(data,'fixture-time',roster);
 assert.deepEqual(Object.keys(payload).sort(),[...GHL_INTAKE_FIELDS].sort());
 for(const key of GHL_INTAKE_FIELDS)assert.equal(payload[key],({agency:'Pilot Benefit Agency',assignedUserId:roster[0].ghl_user_id,assignedTo:roster[0].ghl_user_id,submittedAt:'fixture-time'})[key]??data[key]);
 const legacyInput={customer_first_name:'First',customer_last_name:'Last',customer_dob:data.dob,customer_mbi:data.mbi,medicaid_number:data.medicaidNum,medicaid:'Yes',customer_phone:'123',customer_email:'fixture@example.test',customer_state:'NY',previous_carrier:'Old',carrier_name:'New',enrollment_code:'AEP',premium:'0',sunfire_code:'SF-1',effective_date:'2027-01-01',sixty_day_date:'2027-03-02',sep:'Yes',hra:'Yes',hra_date:'2026-11-01',clerk_user_id:roster[0].clerk_user_id};
 const legacy=buildGhlWebhookPayload(legacyInput,{},roster);
 assert.deepEqual(Object.keys(legacy).sort(),[...GHL_POST_CALL_FIELDS].sort());
 const {submittedAt,...rest}=legacy;assert.ok(Number.isFinite(Date.parse(submittedAt)));
 assert.deepEqual(rest,{firstName:'First',lastName:'Last',phone:'123',email:'fixture@example.test',state:'NY',medicaid:'Yes',prevCarrier:'Old',newCarrier:'New',enrollCode:'AEP',premium:'0',sunfireCode:'SF-1',effectiveDate:'2027-01-01',sixtyDayDate:'2027-03-02',sep:'Yes',agency:'Pilot Benefit Agency',aor:roster[0].name,assignedUserId:roster[0].ghl_user_id,hra:'Yes',hraDate:'2026-11-01'});
 assert.deepEqual(allowlistedGhlPayload({...payload,newPrivateField:protectedText,dob:data.dob}),payload);
});
test('no tracked source can reference the removed provider API host, SDK or model family',()=>{
 const host=['api','anthropic','com'].join('.'),sdk=['@anthropic-ai','sdk'].join('/'),models=new RegExp(['claude','(?:-|\\s+)(?:sonnet|opus|haiku|[0-9])'].join(''),'i');
 const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(path=>!path.startsWith('docs/')&&/\.(?:[cm]?[jt]sx?|json|ya?ml|toml)$/.test(path)&&!path.startsWith('.claude/'));
 const offenders=paths.filter(path=>{const source=readFileSync(path,'utf8');return source.includes(host)||source.includes(sdk)||models.test(source);});
 assert.deepEqual(offenders,[]);
});

for(const task of ['rts_ingestion','knowledge_update'])test(`${task} retries stay on its named model and cannot spend on a general fallback`,async()=>{
 const h=fakeRuntime({});const models=[];
 h.runtime.adapters.openai.complete=async(_request,model)=>{models.push(model);throw Object.assign(Error('Synthetic unavailable'),{status:503});};
 h.runtime.env.LLM_FALLBACK_MODEL='gpt-5.6-terra';
 await assert.rejects(complete({engine:'MA',path:'summary',task,system:'',messages:[]},h.runtime));
 assert.deepEqual(models,['gpt-5.6-luna','gpt-5.6-luna','gpt-5.6-luna']);assert.equal(h.rows.length,3);
 assert.ok(h.rows.every(row=>row.metadata.task===task&&!row.fallback_used));
});
test('job telemetry failure prevents accepting model output without another paid attempt',async()=>{
 const h=fakeRuntime({changed:false,summary:'',confidence:0,updatedContent:''});
 h.runtime.telemetry=async()=>{throw Error('Synthetic audit storage unavailable');};
 await assert.rejects(generateKnowledgeUpdate({content:''},'',h.runtime),/audit storage unavailable/);
 assert.equal(h.requests.length,1);
});
