import {useAdminReviewAccess} from '../../hooks/useAdminReviewAccess.js';
import {COMPLIANCE_UPLOADS_ENDPOINT,complianceUploadsUrl} from '../../lib/adminReviewApi.js';
import {useCallback,useEffect,useRef,useState} from 'react';
import EnrollmentIntake from '../enrollment/EnrollmentIntake';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';

export default function ComplianceUploads(){
 const {getToken}=useAppAuth();
 const {identity,canReview}=useAdminReviewAccess();
 const scope=useRef(null);
 if(scope.current?.identity!==identity||scope.current?.canReview!==canReview)scope.current={identity,canReview,denied:false};
 const [rowFilter,setRowFilter]=useState('all'),[retrying,setRetrying]=useState(null);
 const [data,setData]=useState(null),[error,setError]=useState('');
 const [intakeCall,setIntakeCall]=useState(null),[running,setRunning]=useState(false);
 const load=useCallback(async()=>{
  const requestScope=scope.current;
  if(!canReview||requestScope.denied)return;
  try{
   const response=await fetchWithClerk(getToken,complianceUploadsUrl(rowFilter));
   if(scope.current!==requestScope)return;
   if([401,403].includes(response.status)){requestScope.denied=true;setData(null);setError('');return;}
   const result=await response.json();if(!response.ok)throw Error(result.error);
   if(!Array.isArray(result?.failures)||!Array.isArray(result?.missing)||!Array.isArray(result?.reconciliation))throw Error('Compliance uploads returned an invalid response.');
   if(result.weekly&&!Array.isArray(result.weekly.results))throw Error('Conversely results returned an invalid response.');
   if(scope.current===requestScope){setData({...result,identity});setError('');}
  }catch(e){if(scope.current===requestScope)setError(e.message);}
 },[getToken,identity,rowFilter,canReview]);
 const activeRun=data?.weekly?.run&&['pending','selecting','delivering'].includes(data.weekly.run.status);
 useEffect(()=>{if(!canReview)return;void load();const timer=setInterval(()=>void load(),activeRun?3000:60000);return()=>clearInterval(timer);},[load,activeRun,canReview]);
 const runNow=async()=>{
  setRunning(true);setError('');
  try{
   const response=await fetchWithClerk(getToken,COMPLIANCE_UPLOADS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'run_conversely_now'})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Conversely run could not be started.');
   await load();
  }catch(e){setError(e.message);}finally{setRunning(false);}
 };
 const retry=async id=>{
  setRetrying(id);setError('');
  try{
   const response=await fetchWithClerk(getToken,COMPLIANCE_UPLOADS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'retry_ix_upload',id})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Retry failed.');await load();
  }catch(e){setError(e.message);}finally{setRetrying(null);}
 };
 if(!canReview)return null;
 if(!data||data.identity!==identity)return error?<p className="ops-error" role="alert">{error}</p>:null;
 return <details className="contacts-section">
  <summary className="contacts-section-head">COMPLIANCE UPLOADS · IX {data.ix_environment} · {data.failures.filter(row=>row.last_error).length} errors · {data.missing.length} missing codes</summary>
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
  <p className="contacts-muted">UHC enrollments with an invalid SunFire code or a missing code for more than two hours</p>
  {data.missing.map(row=><div key={row.call_id}>{row.agent_name} · {new Date(row.call_start).toLocaleString()} · {row.call_id} <button data-key-role="primary" className="contacts-mini-btn" onClick={()=>setIntakeCall(row.call_id)}>Edit enrollment / SunFire code</button></div>)}
  {intakeCall&&<EnrollmentIntake callId={intakeCall} onClose={()=>setIntakeCall(null)} onSaved={()=>{setIntakeCall(null);void load();}}/>}
  <label className="contacts-edit-field"><span>Enrollment type</span><select className="contacts-edit-input" value={rowFilter} onChange={event=>setRowFilter(event.target.value)}><option value="all">All enrollments</option><option value="test">Test enrollments</option><option value="real">Real enrollments</option></select></label>
  <table className="call-log-table"><thead><tr><th>Provider</th><th>Call</th><th>Status</th><th>Attempts</th><th>Error</th><th>Enrollment</th><th>Action</th></tr></thead>
   <tbody>{data.failures.filter(row=>rowFilter==='all'||Boolean(row.is_test_enrollment)===(rowFilter==='test')).map(row=><tr key={row.id}><td>{row.provider}</td><td>{row.call_id}</td><td>{row.status}</td><td>{row.attempts}/5</td><td>{row.last_error}{row.provider_message&&<span> · {row.provider_message}</span>}</td><td>{row.is_test_enrollment?'Test':'Real'}</td><td>{data.admin&&row.provider==='UHC IX'&&['needs_attention','failed'].includes(row.status)&&!row.finalized_at&&<button type="button" data-key-role="secondary" className="contacts-mini-btn" disabled={retrying!==null} onClick={()=>void retry(row.id)}>{retrying===row.id?'Retrying…':'Retry'}</button>}</td></tr>)}</tbody></table>
  <p className="contacts-muted">Daily UHC reconciliation · household codes count as separate expected uploads</p>
  <table className="call-log-table"><thead><tr><th>Date (ET)</th><th>Enrollments</th><th>Expected uploads</th><th>Uploaded</th><th>Failed</th><th>Missing codes</th><th>Gap</th></tr></thead>
   <tbody>{data.reconciliation.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.enrollments}</td><td>{row.expected_uploads}</td><td>{row.uploaded}</td><td>{row.failed}</td><td>{row.missing_codes}</td><td>{row.expected_uploads-row.uploaded}</td></tr>)}</tbody></table>
 </details>;
}
