import {deploymentFeatures} from './deploymentFeatures.js';
export const SERVICE_ACCESS=Object.freeze([
 ['Netlify functions','service_role','Evidence authorization, scoped mutations, admin audit, model/job admission'],
 ['Telephony server','service_role','Call routing, presence, recording/transcript ingestion and media capabilities'],
 ['Integrations worker','service_role','Delivery queues, scheduled jobs and alert evaluation'],
 ['Operator commands','service_role / database owner','Provisioning, retention, backup and restore (explicit local connection)'],
]);
export function buildAccessReview(data,{env={},now=new Date(),maxAdmins=3}={}){
 if(!Number.isInteger(maxAdmins)||maxAdmins<1||maxAdmins>100)throw Error('Invalid admin threshold');
 const exceptions=[],staff=[];
 const exception=(type,id)=>exceptions.push({type,roster_id:id||null});
 for(const r of data.roster){
  const enrolled=data.enrolled.filter(e=>e.subject&&e.subject===r.subject),a=data.authorities.find(a=>a.subject&&a.subject===r.subject);
  const authority=enrolled.some(e=>e.role==='principal')?'admin':a?.authority||'agent';
  const active=r.active===true&&enrolled.length===1&&enrolled[0].active===true;
  const row={roster_id:r.id,subject:r.subject,display_name:r.name,active,role:enrolled[0]?.role||r.role||'agent',protected_authority:authority,
   manager_team_scope:a?.team||[],provisioned_at:r.provisioned_at||enrolled[0]?.created_at||null,last_activity:r.last_activity||null,last_access_change:r.last_access_change||null};
  staff.push(row);
  if(!active&&authority!=='agent')exception('inactive_authority',r.id);
  if(active&&(!r.last_activity||new Date(r.last_activity).getTime()<new Date(now).getTime()-90*86400000))exception('inactive_90_days',r.id);
  if(r.subject&&(data.roster.filter(x=>x.subject===r.subject).length>1||enrolled.length>1))exception('duplicate_subject_binding',r.id);
 }
 for(const a of data.authorities)if(!data.roster.some(r=>r.subject===a.subject)){
  exception('authority_without_roster',null);
  if(!data.enrolled.some(e=>e.subject===a.subject))staff.push({roster_id:null,subject:a.subject,display_name:null,active:false,role:null,protected_authority:a.authority,manager_team_scope:a.team||[],provisioned_at:null,last_activity:null,last_access_change:null});
 }
 for(const e of data.enrolled)if(!data.roster.some(r=>r.subject===e.subject)){
  staff.push({roster_id:null,subject:e.subject,display_name:null,active:false,role:e.role,protected_authority:e.role==='principal'?'admin':'agent',manager_team_scope:[],provisioned_at:e.created_at,last_activity:null,last_access_change:null});
  if(e.role==='principal')exception('authority_without_roster',null);
 }
 const admins=new Set(staff.filter(r=>r.protected_authority==='admin').map(r=>r.subject));
 for(const a of data.authorities)if(a.authority==='admin')admins.add(a.subject);
 if(admins.size>maxAdmins)exception('too_many_admins',null);
 const features=deploymentFeatures(env);
 return {generated_at:new Date(now).toISOString(),max_admins:maxAdmins,staff,exceptions,
  service_access:SERVICE_ACCESS.map(([component,role,purpose])=>({component,role,purpose})),
  outside_services:[
   {service:'Clerk',enabled:true,switch:'Required authentication'},
   {service:'Supabase database and storage',enabled:true,switch:'Required platform'},
   {service:'Twilio',enabled:true,switch:'Core telephony; provider-copy deletion has independent opt-in'},
   {service:'Deepgram',enabled:true,switch:'Live telephony transcription'},
   {service:'OpenAI',enabled:true,switch:'Core coaching; SCORING_ENABLED gates paid scoring'},
   ...Object.entries(features).filter(([key])=>/GHL|IX_|CONVERSELY|STRIPE|EMAIL|PARAGON|SCORING|TRANSCRIPT/.test(key)).map(([key,enabled])=>({service:key,enabled,switch:key}))
  ]};
}
const cell=value=>'"'+String(value??'').replace(/^(\s*[=+@-]|[\t\r])/,"'$&").replaceAll('"','""')+'"';
export function accessReviewCsv(report,record={}){
 const metadata=[['Review ID',record.id],['Generated at',record.generated_at||report.generated_at],['Reviewed by',record.reviewed_by],['Reviewed at',record.reviewed_at],['Exception count',report.exceptions.length],[]];
 const rows=[['Staff access'],['roster_id','subject','display_name','active','role','protected_authority','manager_team_scope','provisioned_at','last_activity','last_access_change']];
 for(const r of report.staff)rows.push(rows[1].map(k=>Array.isArray(r[k])?r[k].join(';'):r[k]));
 rows.push([],['Service access'],['component','role','purpose']);for(const r of report.service_access)rows.push([r.component,r.role,r.purpose]);
 rows.push([],['Outside services'],['service','enabled','switch']);for(const r of report.outside_services)rows.push([r.service,r.enabled,r.switch]);
 rows.push([],['Exceptions'],['type','roster_id']);for(const e of report.exceptions)rows.push([e.type,e.roster_id]);
 return [...metadata,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accessReviewHtml(record,origin=''){
 const table=rows=>'<table><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const r=record.report;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Staff access review</title><link rel="stylesheet" href="${escape(origin)}/styles.css"></head><body><main class="panel"><h1>Staff access review</h1><p>Review ${escape(record.id)} · ${escape(record.generated_at)} · ${r.exceptions.length} exceptions</p><p>Reviewer: ${escape(record.reviewed_by||'Awaiting sign-off')} · ${escape(record.reviewed_at||'')}</p><h2>Staff</h2>${table([['Roster','Name','Active','Role','Authority','Team','Provisioned','Last activity','Last access change'],...r.staff.map(s=>[s.roster_id,s.display_name,s.active,s.role,s.protected_authority,s.manager_team_scope.join(', '),s.provisioned_at,s.last_activity,s.last_access_change])])}<h2>Service access</h2>${table(r.service_access.map(s=>[s.component,s.role,s.purpose]))}<h2>Outside services</h2>${table(r.outside_services.map(s=>[s.service,s.enabled,s.switch]))}<h2>Exceptions</h2>${table(r.exceptions.map(e=>[e.type,e.roster_id]))}<p>Print using your browser. Sign off with POST /api/access-review and this review ID after completing review.</p></main></body></html>`;
}
