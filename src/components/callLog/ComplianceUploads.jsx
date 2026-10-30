import {useCallback,useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';

export default function ComplianceUploads(){
 const {getToken}=useAppAuth();
 const [data,setData]=useState(null),[error,setError]=useState('');
 const [codes,setCodes]=useState({});
 const load=useCallback(async()=>{
  try{
   const response=await fetchWithClerk(getToken,'/.netlify/functions/compliance-uploads');
   if(response.status===403){setData(null);return;}
   const result=await response.json();if(!response.ok)throw Error(result.error);
   setData(result);setError('');
  }catch(e){setError(e.message);}
 },[getToken]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),60000);return()=>clearInterval(timer);},[load]);
 const fix=async call=>{
  const code=codes[call];if(!code?.trim())return;
  try{
   const response=await fetchWithClerk(getToken,'/.netlify/functions/compliance-uploads',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({call_id:call,sunfire_code:code})});
   const result=await response.json();if(!response.ok)throw Error(result.error);await load();
  }catch(e){setError(e.message);}
 };
 if(!data)return error?<p className="ops-error" role="alert">{error}</p>:null;
 return <details className="contacts-section">
  <summary className="contacts-section-head">COMPLIANCE UPLOADS · {data.failures.length} errors · {data.missing.length} missing codes</summary>
  <button className="contacts-mini-btn" onClick={()=>void load()}>Refresh</button>
  {error && <p className="ops-error" role="alert">{error}</p>}
  <p className="contacts-muted">UHC enrollments missing a SunFire code for more than two hours</p>
  {data.missing.map(row=><div key={row.call_id}>{row.agent_name} · {new Date(row.call_start).toLocaleString()} · {row.call_id} <label>SunFire Confirmation Codes<textarea value={codes[row.call_id] || ''} onChange={event=>setCodes(previous=>({...previous,[row.call_id]:event.target.value}))}/></label><button className="contacts-mini-btn" disabled={!codes[row.call_id]?.trim()} onClick={()=>void fix(row.call_id)}>Save codes</button></div>)}
  <table className="call-log-table"><thead><tr><th>Provider</th><th>Call</th><th>Status</th><th>Attempts</th><th>Error</th></tr></thead>
   <tbody>{data.failures.map(row=><tr key={row.id}><td>{row.provider}</td><td>{row.call_id}</td><td>{row.status}</td><td>{row.attempts}/5</td><td>{row.last_error}</td></tr>)}</tbody></table>
  <p className="contacts-muted">Daily UHC reconciliation · household codes count as separate expected uploads</p>
  <table className="call-log-table"><thead><tr><th>Date (ET)</th><th>Enrollments</th><th>Expected uploads</th><th>Uploaded</th><th>Failed</th><th>Missing codes</th><th>Gap</th></tr></thead>
   <tbody>{data.reconciliation.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.enrollments}</td><td>{row.expected_uploads}</td><td>{row.uploaded}</td><td>{row.failed}</td><td>{row.missing_codes}</td><td>{row.expected_uploads-row.uploaded}</td></tr>)}</tbody></table>
 </details>;
}
