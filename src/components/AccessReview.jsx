import {useState} from 'react';
import {fetchWithClerk} from '../lib/clerkFetch';
export default function AccessReview({getToken}){
 const [record,setRecord]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function request(options){const response=await fetchWithClerk(getToken,'/api/access-review'+(options?'':'?format=json'),options);const data=await response.json();if(!response.ok)throw Error(data.error||'Access review unavailable');return data;}
 async function generate(){setBusy(true);setMessage('');try{setRecord(await request());}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function signoff(){setBusy(true);try{setRecord(await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signoff',attest:true,reviewId:record.id})}));setMessage('Review signed off.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function exportReport(format){setBusy(true);try{
  // Export the same stored report being reviewed, so sign-off and exports share an identity.
  const response=await fetchWithClerk(getToken,`/api/access-review?format=${format}&reviewId=${record.id}`);
  if(!response.ok)throw Error('Export unavailable');const blob=await response.blob(),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`staff-access-review-${record.id}.${format==='html'?'html':'csv'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <section className="tenant-settings-card tenant-settings-card-wide">
  <div className="tenant-settings-section-title">Staff access review</div>
  <p>Review staff access and exceptions every quarter and after staffing or authority changes.</p>
  <div className="tenant-settings-inline"><button type="button" className="eg-key billing-button" onClick={generate} disabled={busy}>Generate review</button>
   {record&&<><button type="button" className="eg-key billing-button" disabled={busy} onClick={()=>exportReport('csv')}>CSV</button><button type="button" className="eg-key billing-button" disabled={busy} onClick={()=>exportReport('html')}>Printable page</button></>}
  </div>
  {record&&<><p>{record.report.staff.length} staff · {record.exception_count} exceptions · {new Date(record.generated_at).toLocaleString()}</p>
   <table><thead><tr><th>Name</th><th>Active</th><th>Authority</th><th>Last activity</th></tr></thead><tbody>{record.report.staff.map((s,i)=><tr key={s.roster_id||i}><td>{s.display_name||s.subject}</td><td>{s.active?'Active':'Inactive'}</td><td>{s.protected_authority}</td><td>{s.last_activity||'Not recorded'}</td></tr>)}</tbody></table>
   {record.report.exceptions.map((e,i)=><p key={i}>{e.type}: {e.roster_id||'Deployment'}</p>)}
   {record.reviewed_at?<p>Signed by {record.reviewed_by} on {new Date(record.reviewed_at).toLocaleString()}</p>:<button type="button" className="eg-key billing-button" disabled={busy} onClick={signoff}>I attest this access review is complete</button>}
  </>}
  {message&&<div className="billing-alert" role="status">{message}</div>}
 </section>;
}
