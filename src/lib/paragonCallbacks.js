import {evidenceRequest} from './evidenceApi.js';
export const PARAGON_CALLBACK_LABEL='Paragon callback: out-of-state';
export const PARAGON_CALLBACK_PATH='/crm/followups?source=paragon';
export async function loadParagonCallbacks(getToken){
 const tasks=[];
 for(let offset=0;;offset+=500){
  const result=await evidenceRequest(getToken,`paragon-zip-confirm?offset=${offset}&limit=500`);
  if(!Array.isArray(result?.tasks))throw Error('Callback tasks returned an invalid response.');
  tasks.push(...result.tasks);if(result.tasks.length<500)break;
 }
 return tasks.map(task=>({...task,id:`paragon:${task.id}`,source:'paragon',agent_id:task.assigned_agent_id,status:'open',reason:PARAGON_CALLBACK_LABEL,due_at:task.due_at||task.created_at}));
}
export function updateParagonCallback(getToken,id,action,dueAt){
 if(!['complete','reschedule'].includes(action))throw Error('Invalid callback action.');
 if(action==='reschedule'&&(!dueAt||!Number.isFinite(Date.parse(dueAt))))throw Error('A valid due date is required.');
 return evidenceRequest(getToken,'paragon-zip-confirm',{task_id:id.replace(/^paragon:/,''),action,...(action==='reschedule'?{due_at:new Date(dueAt).toISOString()}:{})});
}
