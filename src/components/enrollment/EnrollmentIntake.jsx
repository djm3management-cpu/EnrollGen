import {useContactsList,contactDisplayName} from '../../hooks/useContacts';
import {useCurrentAgent} from '../../hooks/useCurrentAgent';
import {notifyFollowUpsUpdated} from '../../lib/followUps';
import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
import OpportunityDialog from '../opportunities/OpportunityDialog';
import {INTAKE_FIELDS,CARRIERS,WRITING_AGENTS,fieldVisible,normalizeIntake,intakeErrors,formatPhone,formatMbi,formatPremium,followUpDate,planAutofill} from '../../lib/enrollmentIntake.js';

export default function EnrollmentIntake({callId,onClose,onSaved}){
 const {getToken}=useAppAuth();
 const {agentUuid}=useCurrentAgent();
 const {contacts,loading:contactsLoading,error:contactsError}=useContactsList('',agentUuid,true);
 const [contactSearch,setContactSearch]=useState('');
 const [record,setRecord]=useState(null),[data,setData]=useState(null),[records,setRecords]=useState([]),[prefill,setPrefill]=useState(null),[contactId,setContactId]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState({}),[sync,setSync]=useState(null);
 const [search,setSearch]=useState(''),[plans,setPlans]=useState([]),[planStatus,setPlanStatus]=useState('');
 const request=async(suffix='',options)=>{
  const response=await fetchWithClerk(getToken,`/.netlify/functions/enrollment-intakes?call_id=${encodeURIComponent(callId)}${suffix}`,options);
  const result=await response.json();if(!response.ok)throw Error(result.error||'Intake request failed.');return result;
 };
 useEffect(()=>{
  let cancelled=false;
  request().then(result=>{
   if(cancelled)return;
   setRecords(result.intakes);setPrefill(normalizeIntake(result.prefill));setContactId(result.contact_id||'');
   const first=result.intakes[0];setRecord(first?.id||null);setData(first?.data||normalizeIntake(result.prefill));setSync(first?.sync||null);
  }).catch(err=>{if(!cancelled)setError(err.message);});
  return()=>{cancelled=true;};
 // Fetch belongs to this call and signed-in agent.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[callId,getToken]);
 useEffect(()=>{
  let cancelled=false;setPlans([]);
  if(!data?.newCarrier||!data?.state){setPlanStatus('Choose New Carrier and State to search PY2027 plans.');return;}
  setPlanStatus('Searching PY2027 plans…');
  const timer=setTimeout(()=>{
   request(`&plans=1&state=${encodeURIComponent(data.state)}&carrier=${encodeURIComponent(data.newCarrier)}&q=${encodeURIComponent(search)}`)
    .then(result=>{if(!cancelled){setPlans(result.plans);setPlanStatus(result.plans.length?`${result.plans.length} plans found. All plan fields remain editable.`:'No matching plans. Enter plan details manually.');}})
    .catch(()=>{if(!cancelled)setPlanStatus('Plan search unavailable. Enter plan details manually.');});
  },300);
  return()=>{cancelled=true;clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data?.newCarrier,data?.state,search,getToken,callId]);
 const change=(key,value)=>{
  if(key==='phone')value=formatPhone(value);
  if(key==='mbi')value=formatMbi(value);
  if(key==='state')value=value.toUpperCase().slice(0,2);
  setData(previous=>({...previous,[key]:value,...(key==='effectiveDate'?{sixtyDayDate:followUpDate(value)}:{}),...(key==='medicaid'&&value==='No'?{medicaidNum:''}:{}),...(key==='hra'&&value==='No'?{hraDate:''}:{})}));
  setErrors(previous=>{const next={...previous};delete next[key];return next;});
 };
 const save=async event=>{
  event.preventDefault();const normalized=normalizeIntake(data),invalid=intakeErrors(normalized);setData(normalized);setErrors(invalid);
  if(Object.keys(invalid).length){setError(`Complete or correct: ${Object.values(invalid).join(', ')}`);return;}
  setBusy(true);setError('');
  try{
   await request('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:record,contact_id:contactId,data:normalized})});
   notifyFollowUpsUpdated();
   window.dispatchEvent(new Event('crm-calls-updated'));
   onSaved?.();onClose();
  }catch(err){setError(err.message);}finally{setBusy(false);}
 };
 return <OpportunityDialog title="Medicare Enrollment Intake" busy={busy} onClose={onClose}>
  {error&&<div role="alert" className="ops-error">{error}</div>}
  {!data&&!error&&<p role="status">Loading intake…</p>}
  {data&&<form onSubmit={save} noValidate className="enrollment-intake">
   <p className="contacts-muted">Required fields are marked *. Save a completed intake before saving an MA enrollment disposition.</p>
   {records.length>0&&<label className="contacts-edit-field"><span>Enrollment / household member</span><select className="contacts-edit-input" disabled={busy} value={record||''} onChange={event=>{
    const next=records.find(row=>row.id===event.target.value);setRecord(next?.id||null);setData(next?.data||{...prefill,firstName:'',lastName:'',dob:'',mbi:'',sunfireCode:''});setContactId(next?.contact_id||contactId);setSync(next?.sync||null);setErrors({});setError('');
   }}><option value="">Add another enrollment</option>{records.map(row=><option key={row.id} value={row.id}>{row.data.firstName} {row.data.lastName} · {row.data.planName}</option>)}</select></label>}
   {sync&&<p role="status" className="contacts-muted">GHL sync: {sync.status==='uploaded'?'Synced':sync.status} · attempts {sync.attempts}{sync.status==='failed'?' — delivery needs attention':''}</p>}
   <label className="contacts-edit-field"><span>Search contacts</span><input className="contacts-edit-input" value={contactSearch} onChange={event=>setContactSearch(event.target.value)} placeholder="Search contact name…"/></label>
   <label className="contacts-edit-field"><span>Linked contact *</span><select className="contacts-edit-input" value={contactId} disabled={busy} required onChange={event=>{
    const next=contacts.find(contact=>contact.id===event.target.value);setContactId(event.target.value);
    if(next)setData(previous=>normalizeIntake({...previous,firstName:next.first_name||'',lastName:next.last_name||'',dob:next.dob||'',phone:next.phone||'',email:next.email||'',state:next.state||'',zip:next.zip||'',mbi:next.mbi_full||'',prevCarrier:next.current_carrier||''}));
   }}><option value="">{contactsLoading?'Loading contacts…':'Choose contact'}</option>
    {contactId&&!contacts.some(contact=>contact.id===contactId)&&<option value={contactId}>Current linked contact</option>}
    {contacts.filter(contact=>contact.id===contactId||contactDisplayName(contact).toLowerCase().includes(contactSearch.toLowerCase())).map(contact=><option value={contact.id} key={contact.id}>{contactDisplayName(contact)}</option>)}
   </select></label>
   {contactsError&&<p className="ops-error" role="alert">{contactsError}</p>}
   {['Client','Plan','IDs','Agency / Agent','SunFire Confirmation'].map((section,index)=>{
    const ranges=[[0,10],[10,19],[19,24],[24,28],[28,29]],fields=INTAKE_FIELDS.slice(...ranges[index]);
    return <section className="contacts-section" key={section}><h3 className="contacts-section-head">{section}</h3>
     {section==='Plan'&&<div className="post-call-core-panel"><label className="contacts-edit-field"><span>Search PY2027 plans</span><input className="contacts-edit-input" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search plan name…" disabled={!data.newCarrier||!data.state||busy}/></label>
      <p className="contacts-muted" role="status">{planStatus}</p>
      <label className="contacts-edit-field"><span>Available plans</span><select className="contacts-edit-input" value="" disabled={busy||!plans.length} onChange={event=>{const plan=plans.find(p=>String(p.id)===event.target.value);if(plan)setData(previous=>({...previous,...planAutofill(plan)}));}}><option value="">Select a plan or enter details manually</option>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.plan_name} · {plan.contract_id}-{plan.plan_id}-{plan.segment_id} · {plan.monthly_premium==null?'Premium unavailable':formatPremium(plan.monthly_premium)}</option>)}</select></label></div>}
     <div className="enrollment-intake-grid">{fields.filter(([key])=>fieldVisible(key,data)).map(([key,label,type,required])=>{
      const options=type==='yesno'?['No','Yes']:type==='carrier'?CARRIERS:type==='agent'?WRITING_AGENTS:null;
      const props={id:`intake-${key}`,className:'contacts-edit-input',value:data[key]||'',disabled:busy,'aria-invalid':Boolean(errors[key]),required:required||(key==='sunfireCode'&&data.newCarrier==='UnitedHealthcare'),onChange:event=>change(key,event.target.value)};
      return <label className="contacts-edit-field" key={key} htmlFor={props.id}><span>{label}{props.required?' *':''}</span>{options?<select {...props}>{type!=='yesno'&&<option value="">Choose…</option>}{options.map(option=><option key={option}>{option}</option>)}</select>:<input {...props} type={type} maxLength={key==='state'?2:500} onBlur={key==='premium'?()=>change(key,formatPremium(data[key])):undefined}/>}{errors[key]&&<small className="ops-error">{errors[key]}</small>}</label>;
     })}</div>
    </section>;
   })}
   <button data-key-role="secondary" type="submit" className="contacts-mini-btn" disabled={busy||!contactId}>{busy?'Saving…':'Save completed intake'}</button>
  </form>}
 </OpportunityDialog>;
}
