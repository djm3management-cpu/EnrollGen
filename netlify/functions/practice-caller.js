import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,resolveCallAccessIdentity,checked,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {admitPractice} from './_admission.js';
import {practiceFeatures,DIFFICULTIES} from '../../src/lib/practiceCaller.js';
import {scenarioById,publicScenarios} from '../../src/practice/scenarios.js';
import {safePracticeText,collectedItems,consumerSystem,checkedConsumerOutput,CONSUMER_SCHEMA} from '../lib/practice/consumer.js';
import {practiceInvoker,finishPractice} from '../lib/practice/work.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export function practiceChecked(result){if(result.error)throw new EvidenceError(result.error.code==='42501'?403:result.error.code==='54000'?429:result.error.code==='55000'?409:result.error.code==='22023'?400:503,'Practice unavailable.');return result.data;}
export function createPracticeCallerHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,admission=admitPractice,model,env=process.env}={}){
 return serverRequest('practice-caller',async request=>{
  if(!practiceFeatures(env).PRACTICE_CALLER_ENABLED)return evidenceJson(404,{error:'Not found.'});
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Use GET or POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth),actor={p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null};
   if(request.method==='GET'){
    await admission(db,'practiceRead',auth.userId);
    const params=new URL(request.url).searchParams,id=params.get('id');
    if(id){if(!uuid(id))throw new EvidenceError(400,'Invalid session.');return evidenceJson(200,{session:practiceChecked(await db.rpc('read_practice_session',{...actor,p_id:id}))});}
    const before=params.get('before'),beforeId=params.get('before_id');
    if((before||beforeId)&&(!uuid(beforeId)||!before||!Number.isFinite(Date.parse(before))))throw new EvidenceError(400,'Invalid page.');
    const data=practiceChecked(await db.rpc('list_practice_sessions',{...actor,p_before:before,p_before_id:beforeId}));
    const more=data.sessions.length>30;data.sessions=data.sessions.slice(0,30);const last=data.sessions.at(-1);
    return evidenceJson(200,{...data,next:more?{before:last.started_at,before_id:last.id}:null,scenarios:publicScenarios()});
   }
   let body;try{const raw=await request.text();if(raw.length>4000)throw Error();body=JSON.parse(raw);}catch{throw new EvidenceError(400,'Invalid request.');}
   if(!body||!['start','turn','end'].includes(body.action))throw new EvidenceError(400,'Invalid action.');
   if(body.action==='start'){
    const scenario=scenarioById(body.scenario_id);if(!scenario||!DIFFICULTIES.includes(body.difficulty))throw new EvidenceError(400,'Invalid scenario or difficulty.');
    await admission(db,'practiceStart',auth.userId);
    return evidenceJson(200,{session:practiceChecked(await db.rpc('start_practice_session',{...actor,p_scenario:scenario.id,p_product:scenario.product,p_difficulty:body.difficulty}))});
   }
   if(!uuid(body.id))throw new EvidenceError(400,'Invalid session.');
   // The database independently authorizes mutation and never permits a manager
   // or admin to play another agent's session.
   let text,items=[];
   if(body.action==='turn'){try{items=collectedItems(body.text);text=safePracticeText(body.text);}catch{throw new EvidenceError(400,'Invalid turn.');}}
   await admission(db,body.action==='turn'?'practiceTurn':'practiceEnd',auth.userId);
   let session=practiceChecked(await db.rpc('begin_practice_work',{...actor,p_id:body.id,p_kind:body.action==='turn'?'turn':'result',p_text:text||null}));
   if(!session)return evidenceJson(409,{error:'Session ended.'});
   try{
    if(session.work_kind==='turn'){
     const invoke=practiceInvoker({session,db,env,model}),scenario=scenarioById(session.scenario_id);
     const output=items.length?{reply:'I have it ready.',ended:false}:checkedConsumerOutput(await invoke('practice_consumer',{system:consumerSystem(scenario,session.difficulty),messages:[{role:'user',content:JSON.stringify({untrusted_transcript:session.transcript.slice(-24).map(({speaker,text,start_ms,end_ms})=>({speaker,text,start_ms,end_ms}))})}],max_completion_tokens:384,response_format:{type:'json_schema',json_schema:{name:'practice_consumer',strict:true,schema:CONSUMER_SCHEMA}}}));
     session=practiceChecked(await db.rpc('finish_practice_turn',{p_id:session.id,p_token:session.work_token,p_reply:output.reply,p_ended:output.ended,p_collected:items}));
     if(!session)throw Error('Practice superseded');
     if(session.status==='ending')session=practiceChecked(await db.rpc('begin_practice_work',{...actor,p_id:session.id,p_kind:'result',p_text:null}));
    }
    if(session?.work_kind==='result'){
     const result=await finishPractice({session,db,env,model});
     session={...session,status:'completed',result};
    }
    const publicSession={...session};for(const key of ['work_token','work_kind','lease_until'])delete publicSession[key];
    return evidenceJson(200,{session:publicSession,own_agent_id:identity.agent.id});
   }catch{
    if(session?.work_token)checked(await db.rpc('finish_practice_result',{p_id:session.id,p_token:session.work_token,p_result:null}));
    throw new EvidenceError(503,'Practice unavailable.');
   }
  }catch(error){return evidenceFailure(error);}
 });
}
export default createPracticeCallerHandler();
export const config={path:'/api/practice-caller'};
