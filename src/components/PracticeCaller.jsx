import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {useAppAuth} from '../context/AuthContext';
import {useSessionLock} from '../context/SessionLockContext';
import {useTenantConfig} from '../hooks/useTenantConfig';
import {evidenceRequest} from '../lib/evidenceApi';
import {DIFFICULTIES} from '../lib/practiceCaller';
const PracticeVoice=lazy(()=>import('./PracticeVoice'));
const time=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
export default function PracticeCaller(){
 const {features={}}=useTenantConfig(),{locked}=useSessionLock(),{user,organization}=useAppAuth();
 if(!features.PRACTICE_CALLER_ENABLED||locked)return null;
 return <PracticeView key={(user?.id||'')+':'+(organization?.id||'')} voice={features.PRACTICE_VOICE_ENABLED===true}/>;
}
function PracticeView({voice}){
 const {getToken,user,organization}=useAppAuth();
 const [data,setData]=useState(null),[session,setSession]=useState(null),[scenario,setScenario]=useState('current-plan'),[difficulty,setDifficulty]=useState('standard'),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const version=useRef(0);
 const invalidate=useCallback(()=>{version.current++;},[]);
 const load=useCallback(async next=>{
  const current=version.current;
  try{const result=await evidenceRequest(getToken,'practice-caller'+(next?'?'+new URLSearchParams(next):''));if(current===version.current)setData(old=>next?{...result,sessions:[...old.sessions,...result.sessions]}:result);}
  catch{if(current===version.current)setError('Practice unavailable.');}
 },[getToken]);
 useEffect(()=>{void load();return invalidate;},[load,invalidate,user?.id,organization?.id]);
 const act=async(body)=>{
  const current=version.current;setBusy(true);setError('');
  try{const result=await evidenceRequest(getToken,'practice-caller',body);if(current===version.current){setSession(result.session);setDraft('');if(result.session.status==='completed')void load();}}
  catch{if(current===version.current){setError('Practice unavailable.');void load();}}
  finally{if(current===version.current)setBusy(false);}
 };
 // The database owns the deadline. A visible view asks it to close at expiry;
 // the scheduled sweep covers closed tabs and crashes without browser authority.
 useEffect(()=>{
  if(!session||session.status!=='active')return;
  const id=setTimeout(()=>void act({action:'end',id:session.id}),Math.max(0,Date.parse(session.expires_at)-Date.now()+100));
  return()=>clearTimeout(id);
  // Session id/deadline, not draft text, controls this timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[session?.id,session?.status,session?.expires_at]);
 const open=async id=>{const current=version.current;setBusy(true);setError('');try{const result=await evidenceRequest(getToken,'practice-caller?id='+id);if(current===version.current){setSession(result.session);setScenario(result.session.scenario_id);setDifficulty(result.session.difficulty);}}catch{setError('Practice unavailable.');}finally{setBusy(false);}};
 const active=session?.status==='active',own=!session||session.agent_id===data?.own_agent_id;
 return <section aria-label="Practice" aria-busy={busy} style={{fontWeight:400,minWidth:0,color:'var(--eg-text)',overflowWrap:'anywhere'}}>
  <h3 style={{fontWeight:500}}>Practice</h3>
  <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
   <label>Scenario <select value={scenario} disabled={active||busy} onChange={e=>setScenario(e.target.value)}>{data?.scenarios.map(s=><option key={s.id} value={s.id}>{s.product} · {s.title}</option>)}</select></label>
   <label>Difficulty <select value={difficulty} disabled={active||busy} onChange={e=>setDifficulty(e.target.value)}>{DIFFICULTIES.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
   {!active&&<button type="button" className="contacts-mini-btn" disabled={busy||!data} onClick={()=>act({action:'start',scenario_id:scenario,difficulty})}>Start</button>}
   {active&&own&&<button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>act({action:'end',id:session.id})}>End</button>}
  </div>
  {error&&<p className="ops-error" role="alert">{error}</p>}
  {session&&<>
   <p>{session.status}{session.end_reason?' · '+session.end_reason.replaceAll('_',' '):''} · {session.turn_count}/{session.turn_limit}</p>
   <div role="log" aria-label="Practice transcript" style={{maxHeight:400,overflowY:'auto'}}>{session.transcript.map((l,i)=><div key={i} style={{paddingBlock:8}}>
    <span style={{fontFamily:'var(--eg-font-mono)',fontSize:8,color:l.speaker==='agent'?'var(--eg-accent)':'var(--eg-blue-text)',textTransform:'uppercase'}}>{l.speaker==='agent'?'Agent':'Client'}</span>{' '}
    <span style={{fontFamily:'var(--eg-font-mono)',fontSize:8,color:'var(--eg-text-faint)'}}>{time(l.start_ms)}</span>
    <p style={{fontSize:11.5,fontWeight:400,color:'var(--eg-text-mid)',lineHeight:1.55,whiteSpace:'pre-wrap',marginBlock:4}}>{l.text}</p>
   </div>)}</div>
   {active&&own&&<form onSubmit={e=>{e.preventDefault();if(draft.trim()&&!busy)void act({action:'turn',id:session.id,text:draft});}}>
    <label>Agent <textarea aria-label="Agent reply" maxLength={1000} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} /></label>
    <button className="contacts-mini-btn" disabled={busy||!draft.trim()}>Send</button>
   </form>}
   {voice&&own&&<Suspense fallback={null}><PracticeVoice key={session.id} disabled={busy||!active} reply={session.transcript.at(-1)} onText={text=>setDraft(old=>(old+' '+text).trim().slice(0,1000))}/></Suspense>}
   {session.collected?.length>0&&<p>Collected: {session.collected.join(', ')}</p>}
   {session.result&&<>
    <h4 style={{fontWeight:500}}>Score {session.result.score??'N/A'}</h4>
    <p>{session.result.scorecard.pass_fail}</p>
    {session.result.scorecard.scorecard_items.map((item,i)=><article key={i} style={{marginBlock:16}}><p>{item.result} · {item.question_text}</p>{item.evidence_timestamp_ms!=null&&<p>{time(item.evidence_timestamp_ms)} · {item.evidence_text}</p>}{item.notes&&<p>{item.notes}</p>}</article>)}
    <h4 style={{fontWeight:500}}>Coaching</h4><p>{session.result.coaching.did_well}</p>
    {session.result.coaching.objections.map((o,i)=><article key={i} style={{marginBlock:16}}><p>{time(o.start_ms)} · {o.description}</p><p>{o.agent_response}</p><p>{o.stronger_answer}</p></article>)}
   </>}
   {!active&&own&&<button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>act({action:'start',scenario_id:session.scenario_id,difficulty:session.difficulty})}>Try again</button>}
  </>}
  {data?.authority!=='agent'&&data?.summaries.map(s=><article key={s.agent_id} style={{marginBlock:24}}><h4 style={{fontWeight:500}}>{s.name}</h4><p>{s.sessions_completed} completed · Average {s.average_score??'N/A'} · Trend {s.trend??'--'}</p>{s.most_missed_rules.map(r=><p key={r.rule}>{r.rule} · {r.missed}</p>)}</article>)}
  <h4 style={{fontWeight:500}}>Sessions</h4>
  {data?.sessions.map(s=><p key={s.id}><button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>open(s.id)}>{data.scenarios.find(x=>x.id===s.scenario_id)?.title} · {s.status} · {s.score??'--'}</button></p>)}
  {data?.next&&<button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>load(data.next)}>Load more</button>}
 </section>;
}
