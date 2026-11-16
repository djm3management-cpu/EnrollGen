import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {useTenantConfig} from '../../hooks/useTenantConfig';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
export default function ClientRecap(props){
 const {features}=useTenantConfig();
 return features.CLIENT_RECAP_ENABLED?<RecapPanel {...props}/>:null;
}
export function RecapPanel({enrollmentId,enrollmentRevision}){
 const {getToken}=useAppAuth();
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[channel,setChannel]=useState('pdf'),[approved,setApproved]=useState(false),[resend,setResend]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!open)return;let cancelled=false;setData(null);setApproved(false);setResend(false);setError('');
  fetchWithClerk(getToken,'/api/client-recap?enrollment_id='+encodeURIComponent(enrollmentId)).then(async r=>{const body=await r.json();if(!cancelled&&Array.isArray(body.history))setData(body);if(!r.ok)throw Error(body.error);}).catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;};
 },[open,enrollmentId,enrollmentRevision,getToken,revision]);
 const prior=data?.history?.some(r=>r.channel===channel),chosen=data?.channels?.[channel];
 async function confirm(){
  setBusy(true);setError('');
  try{
   const response=await fetchWithClerk(getToken,'/api/client-recap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollment_id:enrollmentId,action:channel==='pdf'?'download':'send',channel,approved,sha256:chosen.sha256,revision:data.revision,resend})});
   if(!response.ok){const body=await response.json();throw Error(body.error);}
   if(channel==='pdf'){
    const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='enrollment-recap.pdf';a.click();URL.revokeObjectURL(url);
   }
   setApproved(false);setResend(false);setRevision(r=>r+1);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section aria-label="Client recap" style={{fontWeight:400}}>
  <button type="button" className="contacts-mini-btn" onClick={()=>setOpen(v=>!v)}>Recap</button>
  {open&&<>
   {error&&<p className="ops-error" role="alert">{error}</p>}
   {data?.can_send&&<>
    <label>Channel <select value={channel} onChange={e=>{setChannel(e.target.value);setApproved(false);setResend(false);}}><option value="sms" disabled={Boolean(data.channels.sms.reason)}>Text</option><option value="pdf" disabled={Boolean(data.channels.pdf.reason)}>PDF</option><option disabled>Email</option></select></label>
    {data.channels.sms.reason&&<p role="status">{data.channels.sms.reason}</p>}
    {chosen?.reason?<p role="status">{chosen.reason}</p>:<p style={{whiteSpace:'pre-wrap'}}>{chosen?.text}</p>}
    {prior&&data.admin&&<label><input type="checkbox" checked={resend} onChange={e=>{setResend(e.target.checked);setApproved(false);}}/>Resend</label>}
    <label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>Approve this recap</label>
    <button type="button" className="contacts-mini-btn" disabled={busy||!approved||Boolean(chosen?.reason)||prior&&!(data.admin&&resend)} onClick={confirm}>{channel==='pdf'?'Download PDF':'Send text'}</button>
   </>}
   <ul>{data?.history?.map(r=><li key={r.id}>{r.channel==='sms'?'Text':'PDF'} · {r.status} · {r.approved_by} · {new Date(r.approved_at).toLocaleString()}{r.out_of_date?' · Out of date':''}</li>)}</ul>
  </>}
 </section>;
}
