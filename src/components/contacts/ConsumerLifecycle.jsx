import {useCallback,useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {useTenantConfig} from '../../hooks/useTenantConfig';
import {evidenceRequest} from '../../lib/evidenceApi';
import {fetchWithClerk} from '../../lib/clerkFetch';
import {getEvidenceSupabase} from '../../lib/evidenceSupabase';
import {RecordingCell} from '../callLog/CallRowParts';
import {formatCallDateTime} from '../../lib/callPresentation';

function EvidenceLink({item,callId,contactId,target}){
 const {getToken}=useAppAuth();const [text,setText]=useState(null),[error,setError]=useState('');
 const open=async()=>{
  try{
   const table=item.table==='call_transcripts'?'call_transcripts':item.table==='call_records'?'call_records':null;
   if(!table){const result=await evidenceRequest(getToken,`consumer-lifecycle?${new URLSearchParams({contact_id:contactId,evidence:item.table+':'+item.id})}`);setText(result.events.map(e=>JSON.stringify({time:e.time,status:e.status,staff:e.staff,details:e.details},null,2)).join('\n')||'Unavailable');return;}
   const {data,error:failure}=await getEvidenceSupabase(getToken).from(table).select(table==='call_transcripts'?'transcript_text':'transcript_raw').eq('id',item.id).maybeSingle();
   if(failure)throw failure;setText(data?.transcript_text||data?.transcript_raw||'Unavailable');
  }catch{setError('Evidence unavailable.');}
 };
 if(item.table==='recording_ingestion'&&(callId||target?.inboundCallId||target?.attemptId))return <RecordingCell recordingId={item.id} row={{call_record_id:callId,inbound_call_id:target?.inboundCallId,attempt_id:target?.attemptId,recording_available:true}} />;
 return <span>
  <button type="button" data-key-role="secondary" className="contacts-mini-btn" onClick={open}>{item.table==='call_transcripts'?'Transcript':item.table==='call_records'?'Call evidence':item.table.replaceAll('_',' ')} {item.id}</button>
  {error&&<span className="ops-error" role="alert">{error}</span>}
  {text!==null&&<><button type="button" className="contacts-mini-btn" onClick={()=>setText(null)}>Close</button><p style={{whiteSpace:'pre-wrap',fontWeight:400}}>{text}</p></>}
 </span>;
}
export default function ConsumerLifecycle({contactId}){
 const {features={}}=useTenantConfig();
 if(!features.CONSUMER_LIFECYCLE_ENABLED)return null;
 return <LifecycleFile key={contactId} contactId={contactId} />;
}
function LifecycleFile({contactId}){
 const {getToken}=useAppAuth();const [data,setData]=useState(null),[type,setType]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false);
 const loadAccess=async()=>{setLoading(true);try{const result=await evidenceRequest(getToken,`consumer-lifecycle?${new URLSearchParams({contact_id:contactId,access_cursor:data.nextAccess})}`);setData(old=>({...old,accesses:[...old.accesses,...result.accesses],nextAccess:result.nextAccess}));}catch(e){setError(e.message);}finally{setLoading(false);}};
 const load=useCallback(async(cursor=null)=>{
  setLoading(true);setError('');try{
   const params=new URLSearchParams({contact_id:contactId,...(type?{type}:{}),...(cursor?{cursor}:{})});
   const result=await evidenceRequest(getToken,`consumer-lifecycle?${params}`);
   setData(old=>cursor?{...result,events:[...(old?.events||[]),...result.events]}:result);
  }catch(e){setError(e.message);}finally{setLoading(false);}
 },[contactId,type,getToken]);
 useEffect(()=>{let active=true;setData(null);setLoading(true);setError('');
  const params=new URLSearchParams({contact_id:contactId,...(type?{type}:{})});
  evidenceRequest(getToken,`consumer-lifecycle?${params}`).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[contactId,type,getToken]);
 const exportPacket=async()=>{setExporting(true);setError('');try{
  const response=await fetchWithClerk(getToken,`/api/consumer-lifecycle?contact_id=${encodeURIComponent(contactId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'export'})});
  if(!response.ok){const body=await response.json();throw Error(body.error||'Export unavailable.');}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='consumer-audit-packet.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){setError(e.message);}finally{setExporting(false);}};
 return <section aria-label="Consumer lifecycle" aria-busy={loading} style={{fontWeight:400,minWidth:0,overflowWrap:'anywhere'}}>
  <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap',marginBottom:20}}>
   <label>Event type <select value={type} onChange={e=>setType(e.target.value)}><option value="">All</option>{(data?.types||[]).map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
   {data?.admin&&<button type="button" className="contacts-mini-btn" data-key-role="secondary" onClick={exportPacket} disabled={exporting}>{exporting?'Exporting...':'Export audit packet'}</button>}
  </div>
  {error&&<p className="ops-error" role="alert">{error} <button type="button" className="contacts-mini-btn" onClick={()=>load()}>Retry</button></p>}
  {loading&&!data&&<p className="contacts-muted">Loading...</p>}
  <ol style={{listStyle:'none',padding:0}}>{data?.events.map(event=><li key={event.key} style={{marginBottom:24}}>
   <time className="mono" dateTime={event.time}>{formatCallDateTime(event.time)}</time> · {event.type.replaceAll('_',' ')} · {event.status}
   <p>{event.summary} · {event.staff||'--'}</p>
   <dl className="contacts-meta-list">{Object.entries(event.details).filter(([k,v])=>v!==null&&!['sha256','stored','callId','inboundCallId','attemptId','sourceTable','resourceId'].includes(k)).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
   {event.evidence.map(item=><EvidenceLink contactId={contactId} key={item.table+item.id} item={item} callId={event.details.callId} target={event.details} />)}
  </li>)}</ol>
  {data?.next&&<button type="button" className="contacts-mini-btn" data-key-role="secondary" disabled={loading} onClick={()=>load(data.next)}>Load more</button>}
  {!!data&&data.events.length===0&&<p className="contacts-muted">No events</p>}
  <h3 style={{fontWeight:500}}>Completeness</h3>
  {data?.checks.map(group=><section key={group.enrollmentId}><p className="mono">{group.enrollmentId}</p><dl className="contacts-meta-list">{group.checks.map(check=><div key={check.name}><dt>{check.name}</dt><dd>{check.status}{check.evidence.map(item=><EvidenceLink contactId={contactId} key={item.table+item.id} item={item} />)}</dd></div>)}</dl></section>)}
  {data?.admin&&<><h3 style={{fontWeight:500}}>Access history</h3><ol style={{listStyle:'none',padding:0}}>{data.accesses.map(a=><li key={a.id}>{formatCallDateTime(a.occurred_at)} · {a.actor_id} · {a.action} · {a.result}</li>)}</ol>{data.nextAccess&&<button type="button" className="contacts-mini-btn" disabled={loading} onClick={loadAccess}>Load earlier access</button>}</>}
 </section>;
}
