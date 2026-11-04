import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
export default function PostCallProcessing({callId}) {
 const {getToken}=useAppAuth();const [job,setJob]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const endpoint=`/api/post-call-admin?call_record_id=${encodeURIComponent(callId)}`;
 useEffect(()=>{let stopped=false;const load=async()=>{try{const response=await fetchWithClerk(getToken,endpoint);if(response.ok&&!stopped)setJob(await response.json());}catch{/* Next poll recovers. */}};void load();const timer=setInterval(load,5000);return()=>{stopped=true;clearInterval(timer);};},[getToken,endpoint]);
 const retry=async()=>{setBusy(true);setError('');try{const response=await fetchWithClerk(getToken,endpoint,{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Retry unavailable.');setJob(previous=>({...previous,status:'pending',last_error:null}));}catch(error){setError(error.message);}finally{setBusy(false);}};
 if(!job)return null;
 return <div className="contacts-section"><span>Processing: {job.status || 'pending'}</span>{job.can_retry&&job.last_error&&<p className="ops-error">{job.last_error}</p>}{job.can_retry&&job.status==='failed'&&<button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>void retry()}>{busy?'Queuing…':'Retry processing'}</button>}{error&&<p className="ops-error" role="alert">{error}</p>}</div>;
}
