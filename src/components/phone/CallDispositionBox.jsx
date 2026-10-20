import {useCallback,useEffect,useRef,useState} from 'react';
import {X,ChevronDown} from 'lucide-react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
import {CALL_OUTCOME_OPTIONS} from '../../lib/postCallPipeline.js';
import {mayShowCallDisposition,phoneHasInProgressCall} from '../../lib/callDisposition.js';
import {setActivePostCallMetadata} from '../../hooks/useSessionTracker';

// This belongs to the phone, outside the script/session provider. It neither
// navigates the app nor closes/replaces a live SDK call. X only collapses it.
export default function CallDispositionBox({phone,onVisibleChange}) {
 const {getToken}=useAppAuth();
 const [task,setTask]=useState(null),[serverInProgress,setServerInProgress]=useState(false);
 const [collapsed,setCollapsed]=useState(false),[outcome,setOutcome]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const phoneRef=useRef(phone);phoneRef.current=phone;
 const automaticAttempts=useRef(new Set());
 const live=phoneHasInProgressCall(phone);
 const save=useCallback(async(current,value,automatic=false)=>{
  if(phoneHasInProgressCall(phoneRef.current))return;
  setSaving(true);setError('');
  try{
   const response=await fetchWithClerk(getToken,'/.netlify/functions/call-disposition',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({call_sid:current.call_sid,call_outcome:value,automatic}),
   });
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Disposition could not be saved.');
   setActivePostCallMetadata({closed:true},result.session_id);
   window.dispatchEvent(new CustomEvent('call-disposition-saved',{detail:result}));
   setTask(previous=>previous?.call_sid===current.call_sid?null:previous);
  }catch(err){setError(err.message);}finally{setSaving(false);}
 },[getToken]);
 useEffect(()=>{
  if(live)return;
  let stopped=false,pending=false;
  const poll=async()=>{
   if(pending || phoneHasInProgressCall(phoneRef.current))return;
   pending=true;
   try{
    const response=await fetchWithClerk(getToken,'/.netlify/functions/call-disposition');
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Disposition lookup failed.');
    if(stopped || phoneHasInProgressCall(phoneRef.current))return;
    setServerInProgress(Boolean(result.in_progress));
    setTask(previous=>previous?.call_sid===result.disposition?.call_sid?previous:result.disposition);
   }catch{ /* A lookup failure must not interrupt or navigate a call. */ }
   finally{pending=false;}
  };
  void poll();const timer=setInterval(()=>void poll(),5000);
  return()=>{stopped=true;clearInterval(timer);};
 },[getToken,live]);
 useEffect(()=>{setOutcome('');setCollapsed(false);setError('');},[task?.call_sid]);
 const visible=mayShowCallDisposition(phone,serverInProgress,task);
 useEffect(()=>{onVisibleChange?.(visible);},[visible,onVisibleChange]);
 useEffect(()=>{
  if(!visible || task.connected_seconds>=15 || automaticAttempts.current.has(task.call_sid))return;
  automaticAttempts.current.add(task.call_sid);
  setOutcome('short_call_hangup');
  void save(task,'short_call_hangup',true);
 },[visible,task,save]);
 if(!visible)return null;
 return <div className="phone-disposition" role="region" aria-label="Call disposition">
  {collapsed ? <button type="button" className="phone-expanded__save-note" onClick={()=>setCollapsed(false)}>
   Disposition pending <ChevronDown size={14}/>
  </button> : <>
   <div className="phone-expanded__header">
    <strong>Call disposition</strong>
    <button type="button" className="top-bar-settings-button" aria-label="Collapse disposition" title="Collapse" onClick={()=>setCollapsed(true)}><X size={16}/></button>
   </div>
   <label htmlFor="dialer-disposition">What happened?</label>
   <select id="dialer-disposition" className="ma-script-direction-select" value={outcome} disabled={saving} onChange={event=>setOutcome(event.target.value)}>
    <option value="">Choose disposition</option>
    {CALL_OUTCOME_OPTIONS.map(group=><optgroup key={group.group} label={group.group}>
     {group.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </optgroup>)}
   </select>
   {error && <div role="alert" className="call-persistence-error">{error}</div>}
   <button type="button" className="phone-expanded__save-note" disabled={saving||!outcome} onClick={()=>void save(task,outcome)}>{saving?'Saving…':'Save disposition'}</button>
  </>}
 </div>;
}
