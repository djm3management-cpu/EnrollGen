import {useCallback,useEffect,useRef,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {useTenantConfig} from '../../hooks/useTenantConfig';
import {evidenceRequest} from '../../lib/evidenceApi';
import {getEvidenceSupabase} from '../../lib/evidenceSupabase';
import {RecordingCell} from '../callLog/CallRowParts';
import {OBJECTION_CATEGORIES} from '../../lib/postCallCoaching';
import {formatCallDateTime} from '../../lib/callPresentation';
import {redactSensitiveText} from '../../lib/redaction';
const label=s=>s.replaceAll('_',' ');
const time=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
function TranscriptMoment({note,objection}){
 const {getToken}=useAppAuth(),[lines,setLines]=useState(null),[error,setError]=useState('');
 const open=async()=>{setError('');try{
  // Always use the existing audited evidence transport, including team RLS.
  const db=getEvidenceSupabase(getToken);
  const {data,error:failure}=await db.from('call_records').select('transcript_diarized,transcript_raw').eq('id',note.call_id).maybeSingle();
  if(failure||!data)throw Error();
  const selected=(data.transcript_diarized||[]).filter(l=>l.end_ms>=objection.start_ms&&l.start_ms<=objection.end_ms);
  if(selected.length)setLines(selected);
  else if(note.transcript_id){const result=await db.from('call_transcripts').select('transcript_text').eq('id',note.transcript_id).maybeSingle();if(result.error||!result.data)throw Error();setLines([{text:result.data.transcript_text}]);}
  else setLines([{text:data.transcript_raw||'Unavailable'}]);
 }catch{setError('Transcript unavailable.');}};
 return <div>
  <button type="button" className="contacts-mini-btn" onClick={open}>Transcript {time(objection.start_ms)}–{time(objection.end_ms)}</button>
  {lines&&<><button type="button" className="contacts-mini-btn" onClick={()=>setLines(null)}>Close transcript</button>{lines.map((l,i)=><p key={i}>{l.speaker?`${l.speaker}: `:''}{redactSensitiveText(l.text)}</p>)}</>}
  {error&&<p className="ops-error" role="alert">{error}</p>}
 </div>;
}
function CoachingNote({note,agentName,authority,ownAgentId,onChange}){
 const {getToken}=useAppAuth(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const act=async action=>{setBusy(true);setError('');try{await evidenceRequest(getToken,'post-call-coaching',{action,call_id:note.call_id});await onChange();}catch{setError('Coaching update unavailable.');}finally{setBusy(false);}};
 return <article style={{marginBlock:24,fontWeight:400,overflowWrap:'anywhere'}}>
  <p><time dateTime={note.generated_at}>{formatCallDateTime(note.generated_at)}</time>{agentName?` · ${agentName}`:''} · {label(note.status)} · {note.reviewed_at?'Reviewed':'Unreviewed'}</p>
  {note.objections.map((o,i)=><section key={i} style={{marginBlock:20}}>
   <h4 style={{fontWeight:500}}>{label(o.category)}</h4><p>{o.description}</p>
   <TranscriptMoment note={note} objection={o} />
   <p>Agent response: {o.agent_response}</p><p>Next time: {o.stronger_answer}</p>
  </section>)}
  {note.did_well&&<p>Did well: {note.did_well}</p>}
  {note.reason&&<p>{label(note.reason)}</p>}
  {note.objections.length>0&&<RecordingCell row={{call_record_id:note.call_id,recording_available:true}} />}
  {note.agent_id===ownAgentId&&!note.reviewed_at&&['generated','nothing_to_coach'].includes(note.status)&&<button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>act('review')}>Mark as reviewed</button>}
  {authority==='admin'&&<button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>act('regenerate')}>Regenerate</button>}
  {error&&<p className="ops-error" role="alert">{error}</p>}
 </article>;
}
export default function PostCallCoaching({callId=null}){
 const {features={}}=useTenantConfig();
 if(!features.POST_CALL_COACHING_ENABLED)return null;
 return <CoachingView key={callId||'recent'} callId={callId} />;
}
function CoachingView({callId}){
 const {getToken}=useAppAuth(),[data,setData]=useState(null),[category,setCategory]=useState(''),[agent,setAgent]=useState(''),[days,setDays]=useState('30'),[error,setError]=useState(''),[loading,setLoading]=useState(false),[period,setPeriod]=useState(()=>new Date().toISOString());
 const version=useRef(0);
 const load=useCallback(async cursor=>{const current=++version.current;setLoading(true);setError('');try{
  const params=new URLSearchParams(callId?{call_id:callId,from:'2000-01-01T00:00:00.000Z'}:{from:new Date(Date.parse(period)-Number(days)*86400000).toISOString(),to:period,...(category?{category}:{}),...(agent?{agent_id:agent}:{})});
  if(cursor)params.set('cursor',cursor);
  const result=await evidenceRequest(getToken,`post-call-coaching?${params}`);
  if(current===version.current)setData(old=>cursor?{...result,notes:[...(old?.notes||[]),...result.notes]}:result);
 }catch{if(current===version.current)setError('Coaching unavailable.');}finally{if(current===version.current)setLoading(false);}},[getToken,callId,category,agent,days,period]);
 useEffect(()=>{setData(null);void load();return()=>{version.current++;};},[load]);
 return <section aria-label="Coaching" aria-busy={loading} style={{fontWeight:400,minWidth:0}}>
  <h3 style={{fontWeight:500}}>Coaching</h3>
  {!callId&&<div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
   <label>Objection <select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All</option>{OBJECTION_CATEGORIES.map(c=><option key={c} value={c}>{label(c)}</option>)}</select></label>
   {data?.authority!=='agent'&&data&&<><label>Agent <select value={agent} onChange={e=>setAgent(e.target.value)}><option value="">All</option>{data.agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Period <select value={days} onChange={e=>setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label></>}
   <button type="button" className="contacts-mini-btn" disabled={loading} onClick={()=>setPeriod(new Date().toISOString())}>Refresh</button>
  </div>}
  {!callId&&data&&data.authority!=='agent'&&<dl className="contacts-meta-list">{OBJECTION_CATEGORIES.map(c=><div key={c}><dt>{label(c)}</dt><dd>{data.counts[c]||0}</dd></div>)}</dl>}
  {loading&&!data&&<p className="contacts-muted">Loading...</p>}
  {error&&<p className="ops-error" role="alert">{error} <button type="button" className="contacts-mini-btn" onClick={()=>load()}>Retry</button></p>}
  {data?.notes.map(note=><CoachingNote key={note.id} note={note} agentName={data.agents.find(a=>a.id===note.agent_id)?.name} authority={data.authority} ownAgentId={data.own_agent_id} onChange={()=>load()} />)}
  {data&&!data.notes.length&&<p className="contacts-muted">No coaching</p>}
  {data?.next&&<button type="button" className="contacts-mini-btn" disabled={loading} onClick={()=>load(data.next)}>Load more</button>}
 </section>;
}
