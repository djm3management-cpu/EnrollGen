import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
import {OPTIONAL_CALL_FIELDS} from '../../lib/callRecordDetails.js';
import {normalizeDateInput} from '../../lib/dateInput.js';
export default function CallRecordDetailsEditor({callRecordId,onSaved}){
 const {getToken}=useAppAuth();
 const [record,setRecord]=useState(null),[draft,setDraft]=useState({}),[editing,setEditing]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const endpoint=`/api/call-record-details?call_record_id=${encodeURIComponent(callRecordId)}`;
 useEffect(()=>{
  let stopped=false;setRecord(null);setError('');setEditing(false);
  void fetchWithClerk(getToken,endpoint).then(async response=>{
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load call details.');
   if(!stopped)setRecord(result.record);
  }).catch(error=>{if(!stopped)setError(error.message);});
  return()=>{stopped=true;};
 },[getToken,endpoint]);
 const save=async()=>{
  setSaving(true);setError('');
  try{
   const response=await fetchWithClerk(getToken,endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save details.');
   setRecord(result.record);setEditing(false);onSaved?.();
  }catch(error){setError(error.message);}finally{setSaving(false);}
 };
 return <div className="contacts-section">
  <div className="contacts-section-head">OPTIONAL CALL DETAILS</div>
  {error && <p className="ops-error" role="alert">{error}</p>}
  {!editing ? <button type="button" className="contacts-mini-btn" disabled={!record} onClick={()=>{setDraft({});setEditing(true);}}>Edit notes and details</button> : <>
   <p className="contacts-muted">All fields are optional. These edits do not rerun scoring.</p>
   <div className="grid post-call-wrap-grid">{OPTIONAL_CALL_FIELDS.map(([key,label,type])=>{
    const value=Object.hasOwn(draft,key)?draft[key]:record?.[key];
    const props={value:(type==='date'?normalizeDateInput(value):value)||'',disabled:saving,onChange:event=>setDraft(previous=>({...previous,[key]:event.target.value}))};
    return <label key={key}>{label}{type==='textarea'?<textarea {...props} rows={3}/>:<input {...props} type={type||'text'}/>}</label>;
   })}</div>
   <div className="call-log-expand-actions"><button type="button" className="contacts-mini-btn" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save details'}</button>
   <button type="button" className="contacts-mini-btn" disabled={saving} onClick={()=>setEditing(false)}>Cancel</button></div>
  </>}
 </div>;
}
