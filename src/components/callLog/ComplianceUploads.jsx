import {useCallback,useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';

export default function ComplianceUploads(){
 const {getToken,user,organization}=useAppAuth();
 const identity=`${user?.id||''}:${organization?.id||''}`;
 const [data,setData]=useState(null),[error,setError]=useState('');
 const [codes,setCodes]=useState({}),[running,setRunning]=useState(false);
 const load=useCallback(async()=>{
  try{
   const response=await fetchWithClerk(getToken,'/.netlify/functions/compliance-uploads');
   if(response.status===403){setData(null);return;}
   const result=await response.json();if(!response.ok)throw Error(result.error);
   if(!Array.isArray(result?.failures)||!Array.isArray(result?.missing)||!Array.isArray(result?.reconciliation))throw Error('Compliance uploads returned an invalid response.');
   if(result.weekly&&!Array.isArray(result.weekly.results))throw Error('Conversely results returned an invalid response.');
   setData({...result,identity});setError('');
  }catch(e){setError(e.message);}
 },[getToken,identity]);
 const activeRun=data?.weekly?.run&&['pending','selecting','delivering'].includes(data.weekly.run.status);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),activeRun?3000:60000);return()=>clearInterval(timer);},[load,activeRun]);
 const runNow=async()=>{
  setRunning(true);setError('');
  try{
   const response=await fetchWithClerk(getToken,'/.netlify/functions/compliance-uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'run_conversely_now'})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Conversely run could not be started.');
   await load();
  }catch(e){setError(e.message);}finally{setRunning(false);}
 };
 const fix=async call=>{
  const code=codes[call];if(!code?.trim())return;
  try{
   const response=await fetchWithClerk(getToken,'/.netlify/functions/compliance-uploads',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({call_id:call,sunfire_code:code})});
   const result=await response.json();if(!response.ok)throw Error(result.error);await load();
  }catch(e){setError(e.message);}
 };
 if(!data||data.identity!==identity)return error?<p className="ops-error" role="alert">{error}</p>:null;
 return <details className="contacts-section">
  <summary className="contacts-section-head">COMPLIANCE UPLOADS · {data.failures.length} errors · {data.missing.length} missing codes</summary>
  <button data-key-role="secondary" className="contacts-mini-btn" onClick={()=>void load()}>Refresh</button>
  {error && <p className="ops-error" role="alert">{error}</p>}
  <h3 className="contacts-section-head">CONVERSELY WEEKLY SUBMISSION</h3>
  <p className="contacts-muted">Automatic: startup and hourly checks for the previous Monday–Sunday week (America/New_York). Run now selects the current week through the request time, at most one submission per agent.</p>
  <button data-key-role="secondary" type="button" className="contacts-mini-btn" disabled={running||activeRun||!data.weekly?.enabled||!data.weekly?.worker_available} onClick={()=>void runNow()}>{running?'Starting…':'Run Conversely now'}</button>
  {!data.weekly?.enabled&&<p className="contacts-muted">Conversely uploads are disabled on the worker.</p>}
  {data.weekly?.enabled&&!data.weekly?.worker_available&&<p className="contacts-muted">Conversely worker is unavailable.</p>}
  {data.weekly?.error&&<p className="ops-error" role="alert">{data.weekly.error}</p>}
  {data.weekly?.run?<>
   <p className="contacts-muted" role="status">Last run: {new Date(data.weekly.run.started_at||data.weekly.run.requested_at).toLocaleString('en-US',{timeZone:'America/New_York',timeZoneName:'short'})} · week of {data.weekly.run.week_start} · {data.weekly.run.trigger} · {data.weekly.run.status}</p>
   {data.weekly.run.last_error&&<p className="ops-error">{data.weekly.run.last_error.replaceAll('_',' ')}</p>}
   <p className="contacts-muted">{(data.weekly.results||[]).filter(row=>row.status==='submitted').length} submitted · {(data.weekly.results||[]).filter(row=>row.status==='skipped').length} skipped · {(data.weekly.results||[]).filter(row=>row.status==='failed').length} failed</p>
   <table className="call-log-table"><thead><tr><th>Agent</th><th>Result</th><th>Reason</th><th>Attempts</th></tr></thead><tbody>
    {(data.weekly.results||[]).map(row=><tr key={row.agent_id}><td>{row.agent_name}</td><td>{row.status}</td><td>{(row.reason||'').replaceAll('_',' ')}</td><td>{row.attempts}/5</td></tr>)}
   </tbody></table>
  </>:<p className="contacts-muted">No Conversely run recorded.</p>}
  <p className="contacts-muted">UHC enrollments missing a SunFire code for more than two hours</p>
  {data.missing.map(row=><div key={row.call_id}>{row.agent_name} · {new Date(row.call_start).toLocaleString()} · {row.call_id} <label>SunFire Confirmation Codes<textarea value={codes[row.call_id] || ''} onChange={event=>setCodes(previous=>({...previous,[row.call_id]:event.target.value}))}/></label><button data-key-role="primary" className="contacts-mini-btn" disabled={!codes[row.call_id]?.trim()} onClick={()=>void fix(row.call_id)}>Save codes</button></div>)}
  <table className="call-log-table"><thead><tr><th>Provider</th><th>Call</th><th>Status</th><th>Attempts</th><th>Error</th></tr></thead>
   <tbody>{data.failures.map(row=><tr key={row.id}><td>{row.provider}</td><td>{row.call_id}</td><td>{row.status}</td><td>{row.attempts}/5</td><td>{row.last_error}</td></tr>)}</tbody></table>
  <p className="contacts-muted">Daily UHC reconciliation · household codes count as separate expected uploads</p>
  <table className="call-log-table"><thead><tr><th>Date (ET)</th><th>Enrollments</th><th>Expected uploads</th><th>Uploaded</th><th>Failed</th><th>Missing codes</th><th>Gap</th></tr></thead>
   <tbody>{data.reconciliation.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.enrollments}</td><td>{row.expected_uploads}</td><td>{row.uploaded}</td><td>{row.failed}</td><td>{row.missing_codes}</td><td>{row.expected_uploads-row.uploaded}</td></tr>)}</tbody></table>
 </details>;
}
