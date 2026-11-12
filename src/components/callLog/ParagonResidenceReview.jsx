import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
export default function ParagonResidenceReview(){
 const {getToken,user,organization}=useAppAuth();const [result,setResult]=useState(null),[offset,setOffset]=useState(0);
 useEffect(()=>{let stopped=false;setResult(null);const load=async()=>{try{const response=await fetchWithClerk(getToken,`/api/paragon-residence?offset=${offset}`);if(response.status===403){if(!stopped)setResult(null);return;}if(response.ok&&!stopped)setResult(await response.json());}catch{/* Read-only list refreshes independently. */}};void load();const timer=setInterval(load,15000);return()=>{stopped=true;clearInterval(timer);};},[getToken,offset,user?.id,organization?.id]);
 if(!result)return null;
 return <details className="contacts-section"><summary className="contacts-section-head">PARAGON RESIDENCE REVIEW · {result.count}</summary>
  {result.rows.map(row=><div className="contacts-section" key={row.inbound_call_id}><strong>{new Date(row.created_at).toLocaleString()} · {row.review_reason.replaceAll('_',' ')}</strong><div>{row.capture?.zip||'No valid ZIP'} {row.capture?.state||''} · {row.capture?.source||'No residence source'}</div><div className="contacts-muted">Call {row.inbound_call_id}{row.last_error?` · ${row.last_error} · ${row.attempts} retries`:''}</div></div>)}
  <button type="button" className="contacts-mini-btn" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button>
  <button type="button" className="contacts-mini-btn" disabled={offset+50>=result.count} onClick={()=>setOffset(n=>n+50)}>Next</button>
 </details>;
}
