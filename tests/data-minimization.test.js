import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIncomingLeadHandler} from '../telephony/src/lib/incomingLead.js';
import {allowlistedLeadPayload,LEAD_FIELDS} from '../telephony/src/lib/leadPayload.js';
import {redactPromptPayload} from '../telephony/src/lib/redaction.js';
import {postCallExceptionDetails} from '../netlify/lib/postCallException.js';
import {safeIxMessage} from '../integrations/ixClient.js';
import {deliveryDiagnostic} from '../integrations/diagnostics.js';
import {complete,completeStream} from '../src/lib/llm/client.ts';
const secrets=['1EG4-TE5-MK73','123-45-6789','1955-02-28','February 28, 1955','212-555-0199','4111 1111 1111 1111','123 Synthetic Street'];
const text='Medicare '+secrets[0]+' SSN '+secrets[1]+' DOB '+secrets[2]+' born '+secrets[3]+' phone '+secrets[4]+' card '+secrets[5]+' address '+secrets[6];
const clean=value=>{for(const secret of secrets)assert.ok(!JSON.stringify(value).includes(secret),secret);};
test('lead payload allowlist drops unrestricted nested fields and stores only fields consumed by the application',async()=>{
 const payload={phone:'+12125550199',first_name:'Synthetic',last_name:'Applicant',dob:'1955-02-28',zip:'10001',lead_score:'87',churn_risk:'low',vendor_source:'fixture',mbi:secrets[0],ssn:secrets[1],raw_payload:{private:text},payment:secrets[5]};
 const writes=[],logs=[];const db={from:()=>({insert:async row=>{writes.push(row);return {error:null};}})};
 const handler=createIncomingLeadHandler({db,settings:{paragonEnabled:false},log:(...args)=>logs.push(args),findContact:async input=>{assert.equal(input.phone,payload.phone);assert.equal(input.fields.mbi,undefined);return {contact:{id:'contact',tenant_id:'tenant'},created:true};}});
 const res={status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
 await handler({body:payload},res);assert.equal(res.code,201);assert.equal(writes.length,1);
 assert.deepEqual(writes[0].payload,allowlistedLeadPayload(payload));assert.ok(Object.keys(writes[0].payload).every(key=>LEAD_FIELDS.includes(key)));
 for(const key of ['phone','first_name','last_name','dob','email','mbi','ssn','raw_payload','payment'])assert.equal(writes[0].payload[key],undefined,key);
 assert.deepEqual(logs,[]);
});
test('captured synthetic lead, SQL/provider and delivery error flows contain no protected text',async()=>{
 const logs=[],original=console.error;console.error=(...args)=>logs.push(args);
 try{
  const handler=createIncomingLeadHandler({db:{},settings:{},findContact:async()=>{throw Object.assign(Error('Synthetic Private '+text),{code:'57014',details:text});}});
  const res={status(){return this;},json(value){logs.push(value);return this;}};await handler({body:{phone:'2125550199',raw:text}},res);
  console.error(postCallExceptionDetails(Object.assign(Error('Synthetic Private '+text),{code:'57014',details:text,hint:text,cause:Error(text)})));
  console.error(deliveryDiagnostic(Error('Synthetic Private '+text)));
  console.error(safeIxMessage('Synthetic Private '+text));
  clean(logs);assert.ok(!JSON.stringify(logs).includes('Synthetic Private'));
 }finally{console.error=original;}
});
test('prompt scrub traverses nested text, structured identifiers, tool arguments, static messages and schema descriptions',()=>{
 const value=redactPromptPayload({system:text,messages:[{content:text}],static_messages:[{content:text}],tools:[{description:text,arguments:JSON.stringify({dob:'19550228',phone:'5550199',mbi:'nonstandard'})}],phone:'5550199',dob:'unknown format',address:'Unit 9',account_number:'002345'});
 clean(value);for(const key of ['phone','dob','address','account_number'])assert.equal(value[key],'[REDACTED]');
 assert.doesNotMatch(value.tools[0].arguments,/19550228|5550199|nonstandard/);
});
for(const stream of [false,true])for(const provider of ['openai','anthropic'])test(`${provider} ${stream?'stream':'completion'} cannot send synthetic protected values from any prompt component`,async()=>{
 const sent=[],completion={id:'fixture',model:'fixture',content:[{type:'text',text:'Continue checklist'}],tool_calls:[],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1,cached_tokens:0,reasoning_tokens:0}};
 const adapter={complete:async request=>{sent.push(request);return completion;},async *stream(request){sent.push(request);yield {type:'message_stop',completion};}};
 const request={engine:'MA',system:text,messages:[{role:'user',content:text}],static_messages:[{role:'user',content:text}],tools:[{type:'function',function:{name:'test',description:text,parameters:{type:'object',properties:{note:{type:'string',description:text}}}}}]};
 const runtime={env:{LLM_PROVIDER_MA:provider},adapters:{openai:adapter,anthropic:adapter}};
 if(stream){for await(const event of completeStream(request,runtime)){assert.ok(event);}}else await complete(request,runtime);
 assert.equal(sent.length,1);clean(sent);
});
test('all direct embedding and Anthropic boundaries use the server redaction module',()=>{
 for(const file of ['embeddings','transcript-import','rts-ingest','_knowledgeUpdate'])assert.match(readFileSync(new URL('../netlify/functions/'+file+'.js',import.meta.url),'utf8'),/redactPromptPayload/);
 assert.doesNotMatch(readFileSync(new URL('../integrations/complianceUploads.js',import.meta.url),'utf8'),/body:typeof result\.body/);
});
test('dropping vendor extras cannot bypass the earlier Paragon publisher gate',async()=>{
 const handler=createIncomingLeadHandler({settings:{paragonEnabled:false},findContact:()=>assert.fail('disabled vendor reached contact storage'),db:{}});
 const res={status(code){this.code=code;return this;},json(){return this;}};
 await handler({body:{phone:'2125550199',publisher:'Paragon',raw:text}},res);assert.equal(res.code,503);
});

test('scrubbing identifiers preserves valid tool schema structure and removes identifier examples',()=>{
 const schema=redactPromptPayload({properties:{phone:{type:'string',description:text,default:'5550199',examples:['5550199']},dob:{$ref:'#/$defs/date',examples:['19550228']}}});
 assert.equal(schema.properties.phone.type,'string');assert.equal(schema.properties.dob.$ref,'#/$defs/date');
 assert.equal(schema.properties.phone.default,undefined);assert.equal(schema.properties.dob.examples,undefined);clean(schema);
});
