import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {practiceFeatures} from '../../src/lib/practiceCaller.js';
import {getEvidenceServiceClient,checked,evidenceJson,evidenceFailure} from './_evidenceAccess.js';
import {finishPractice} from '../lib/practice/work.js';
export function createPracticeSweep({getDb=getEvidenceServiceClient,env=process.env,model}={}){
 return async()=>{
  if(!practiceFeatures(env).PRACTICE_CALLER_ENABLED)return evidenceJson(404,{error:'Not found.'});
  try{const db=getDb(),sessions=checked(await db.rpc('sweep_practice_sessions'));let completed=0;
   for(const session of sessions)try{await finishPractice({session,db,env,model});completed++;}catch{/* Durable incomplete state, no unbounded provider retries. */}
   return evidenceJson(200,{completed});
  }catch(error){return evidenceFailure(error);}
 };
}
// Netlify's scheduled-function config owns invocation, as on the existing jobs.
// The task returns counts only; SQL claims only due work under a bounded lease.
export default serverRequest('practice-sweep',createPracticeSweep());
export const config={schedule:'* * * * *'};
