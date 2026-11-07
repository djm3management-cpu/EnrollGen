import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
import {INTAKE_FIELDS} from '../../lib/enrollmentIntake.js';
import EnrollmentIntake from './EnrollmentIntake';

export default function EnrollmentSummary({callId,contactId}){
 const {getToken}=useAppAuth();
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[editing,setEditing]=useState(null),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let cancelled=false;setRows([]);setError('');
  if(!callId&&!contactId)return;
  const query=callId?`call_id=${encodeURIComponent(callId)}`:`contact_id=${encodeURIComponent(contactId)}`;
  fetchWithClerk(getToken,`/.netlify/functions/enrollment-intakes?${query}`).then(async response=>{
   const body=await response.json();if(!response.ok)throw Error(body.error||'Unable to load enrollment details.');
   if(!cancelled)setRows(body.intakes);
  }).catch(err=>{if(!cancelled)setError(err.message);});
  return()=>{cancelled=true;};
 },[callId,contactId,getToken,revision]);
 return <section className="contacts-section" aria-label="Saved enrollment intakes">
  <h3 className="contacts-section-head">Enrollment details</h3>
  {error&&<p className="ops-error" role="alert">{error}</p>}
  {!rows.length&&!error&&<p className="contacts-muted">No saved enrollment intake.</p>}
  {rows.map(row=><article key={row.id} className="post-call-core-panel">
   <h4>{row.data.firstName} {row.data.lastName} · {row.completed_at?'Completed':'Draft — review and complete'}</h4>
   <dl className="contacts-meta-list">{INTAKE_FIELDS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{row.data[key]||'—'}</dd></div>)}</dl>
   {row.data.legacyStep7&&<details><summary>Previously captured enrollment notes</summary><dl className="contacts-meta-list">{Object.entries(row.data.legacyStep7).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value||'—'}</dd></div>)}</dl></details>}
   <button type="button" className="contacts-mini-btn" onClick={()=>setEditing(row)}>Edit</button>
  </article>)}
  {editing&&<EnrollmentIntake callId={editing.call_id||callId} intakeId={editing.id} onClose={()=>setEditing(null)} onSaved={()=>setRevision(value=>value+1)}/>}
 </section>;
}
