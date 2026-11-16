import {createSupervisorWhisperPhone} from '../lib/supervisorWhisperPhone.js';
import {useEffect,useRef,useState,useId} from 'react';
import {useAppAuth} from '../context/AuthContext';
import {useSessionLock} from '../context/SessionLockContext';
import {fetchWithClerk} from '../lib/clerkFetch.js';
import {FLOOR_STATUSES,sortFloor,floorSeconds,floorDuration,startFloorPolling} from '../lib/supervisorFloor.js';
import {createSupervisorPlayback} from '../lib/supervisorPlayback.js';
const mono={fontFamily:'var(--eg-font-mono)',fontWeight:400,fontSize:11,color:'var(--eg-text-mid)'};
const card={background:'var(--eg-surface-2)',color:'var(--eg-text)',borderRadius:6};
const button={...mono,padding:'7px 10px',border:'1px solid var(--eg-border)',borderRadius:5,background:'transparent',cursor:'pointer'};
export default function SupervisorFloor(){
 const {getToken,user,organization}=useAppAuth(),{locked}=useSessionLock(),id=useId();
 const [data,setData]=useState(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[team,setTeam]=useState(''),[tick,setTick]=useState(0),[listening,setListening]=useState(null),[history,setHistory]=useState(null),[whispering,setWhispering]=useState(null),[coach,setCoach]=useState({muted:true,confirmed:false});
 const player=useRef(null),listenGeneration=useRef(0);
 useEffect(()=>{
  if(locked)return;
  const generationRef=listenGeneration;
  const poll=startFloorPolling({fetchFloor:async(etag,signal)=>{
   const response=await fetchWithClerk(getToken,'/api/supervisor-floor',{signal,headers:etag?{'If-None-Match':etag}:{}});
   if(![200,304].includes(response.status))throw Error(response.status===403?'Supervisor access unavailable.':'Floor unavailable.');
   return {data:response.status===304?null:await response.json(),etag:response.headers.get('etag'),serverTime:response.headers.get('x-server-time'),receivedAt:performance.now()};
  },onData:result=>{setError('');setData(old=>({...result.data||old,serverTime:result.serverTime,receivedAt:result.receivedAt}));},onError:err=>{setData(null);setError(err.message);player.current?.stop();}});
  const visible=()=>{if(document.hidden){poll.pause();listenGeneration.current++;player.current?.stop();player.current=null;setListening(null);setWhispering(null);}else poll.refresh();};
  poll.refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);
  const timer=setInterval(()=>{if(!document.hidden)setTick(performance.now());},1000);
  return()=>{poll.stop();clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);generationRef.current++;player.current?.stop();player.current=null;setListening(null);setWhispering(null);setData(null);setHistory(null);};
 },[getToken,locked,user?.id,organization?.id]);
 const stop=()=>{listenGeneration.current++;player.current?.stop();player.current=null;setListening(null);setWhispering(null);};
 const listen=async row=>{
  stop();const generation=listenGeneration.current;
  try{
   const playback=createSupervisorPlayback({getToken,onEnd:()=>{if(generation===listenGeneration.current)setListening(null);}});player.current=playback;setListening(row.attempt_id);
   const response=await fetchWithClerk(getToken,'/api/supervisor-floor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listen',attempt_id:row.attempt_id})});
   if(generation!==listenGeneration.current)return;
   if(!response.ok)throw Error('Listen unavailable.');
   await playback.connect(await response.json());
  }catch{if(generation===listenGeneration.current){stop();setError('Listen unavailable.');}}
 };
 const whisper=async row=>{
  stop();const generation=listenGeneration.current;
  try{
   const phone=createSupervisorWhisperPhone({getToken,onState:setCoach,onEnd:()=>{if(generation===listenGeneration.current)setWhispering(null);}});player.current=phone;setWhispering(row.attempt_id);setCoach({muted:true,confirmed:false});
   const response=await fetchWithClerk(getToken,'/api/supervisor-floor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'whisper',attempt_id:row.attempt_id})});
   if(generation!==listenGeneration.current)return;
   if(!response.ok)throw Error();await phone.connect(await response.json());
  }catch{if(generation===listenGeneration.current){stop();setError('Whisper unavailable.');}}
 };
 const talk=()=>void player.current?.setMuted(!coach.muted).catch(()=>setError('Whisper unavailable.'));
 const readHistory=async(cursor=null)=>{try{const response=await fetchWithClerk(getToken,'/api/supervisor-floor?'+new URLSearchParams({history:'1',...cursor}));if(!response.ok)throw Error();const page=await response.json();setHistory(old=>({...page,rows:cursor?[...old.rows,...page.rows]:page.rows}));}catch{setError('Listen history unavailable.');}};
 if(locked)return null;
 const rows=data?.rows||[],shown=sortFloor(rows.filter(r=>(!status||r.status===status)&&(!team||r.team===team))),counts=Object.keys(FLOOR_STATUSES).map(s=>[s,rows.filter(r=>r.status===s).length]);
 const seconds=time=>floorSeconds(time,data?.serverTime,data?.receivedAt,Math.max(tick,data?.receivedAt||0));
 const longest=sortFloor(rows.filter(r=>['on_call','on_hold'].includes(r.status)))[0];
 return <section style={{padding:16,color:'var(--eg-text)'}} aria-labelledby={id}>
  <header style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><h2 id={id} style={{fontSize:17,fontWeight:400,margin:0}}>Floor</h2>{listening&&<button style={button} onClick={stop}>Stop listening</button>}{whispering&&<><button style={button} onClick={talk} disabled={!coach.confirmed}>{coach.muted?'Talk':'Mute'}</button><button style={button} onClick={stop}>Stop whisper</button></>}{data?.admin&&(data.listen||data.whisper)&&<button style={button} onClick={()=>readHistory()}>Listen history</button>}</header>
  <div style={{...mono,display:'flex',gap:16,flexWrap:'wrap',padding:'14px 0'}}>{counts.map(([s,n])=><span key={s}>{FLOOR_STATUSES[s]} {n}</span>)}<span>Longest call {longest?floorDuration(seconds(longest.connected_at)):'--'}</span></div>
  <div style={{display:'flex',gap:10,paddingBottom:14}}><select aria-label="Status" value={status} onChange={e=>setStatus(e.target.value)} style={button}><option value="">All statuses</option>{Object.entries(FLOOR_STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{data?.admin&&<select aria-label="Team" value={team} onChange={e=>setTeam(e.target.value)} style={button}><option value="">All teams</option>{[...new Set(rows.map(r=>r.team).filter(Boolean))].sort().map(t=><option key={t}>{t}</option>)}</select>}</div>
  {error&&<p role="alert" style={mono}>{error}</p>}{!data&&!error&&<span style={mono}>Loading</span>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>{shown.map(row=><article key={row.agent_id} className="agent-dash-panel" style={card}>
   <div style={{display:'flex',alignItems:'center',gap:8}}><span aria-hidden="true" style={{width:6,height:6,borderRadius:'50%',background:row.status==='offline'?'var(--eg-text-faint)':row.status==='available'?'var(--eg-green)':'var(--eg-amber)'}}/><span style={{fontFamily:'var(--eg-font-body)',fontWeight:500,fontSize:13}}>{row.name}</span></div>
   <p style={mono}>{FLOOR_STATUSES[row.status]} · {floorDuration(seconds(row.since))}</p>
   {row.connected_at&&<div style={{...mono,fontSize:28,fontWeight:500,color:seconds(row.connected_at)<900?'var(--eg-green)':seconds(row.connected_at)<1200?'var(--eg-amber)':seconds(row.connected_at)<1800?'var(--eg-accent)':'var(--eg-red)'}}>{floorDuration(seconds(row.connected_at))}</div>}
   {row.direction&&<p style={mono}>{[row.direction,row.call_type,row.product_type].filter(Boolean).join(' · ')}</p>}
   {row.flags?.length>0&&<p style={{...mono,color:'var(--eg-amber)'}}>{row.flags.map(f=>`${f.count} ${f.category==='hard_stop_prohibited_claim'?'Prohibited claim':f.category==='hard_stop_missing_prerequisite'?'Missing prerequisite':'Other'}`).join(' · ')}</p>}
   {data.listen&&['on_call','on_hold'].includes(row.status)&&<button style={button} disabled={!row.listen_available||listening===row.attempt_id} onClick={()=>listen(row)}>{listening===row.attempt_id?'Listening':row.listen_available?'Listen':'Listen unavailable'}</button>}
   {data.whisper&&row.whisper_available&&<button style={button} disabled={whispering===row.attempt_id} onClick={()=>whisper(row)}>{whispering===row.attempt_id?'Whispering':'Whisper'}</button>}
  </article>)}</div>
  {history&&<section style={{marginTop:18}}><header style={{display:'flex',gap:14,alignItems:'center'}}><h3 style={{fontWeight:400,fontSize:15}}>Listen history</h3><button style={button} onClick={()=>setHistory(null)}>Close</button></header><div style={{overflowX:'auto'}}><table style={{...mono,width:'100%',textAlign:'left'}}><thead><tr>{['Supervisor','Agent','Call','Start','Duration','Mode','Talk time'].map(h=><th key={h} style={{fontWeight:500,padding:8}}>{h}</th>)}</tr></thead><tbody>{history.rows.map(r=><tr key={r.id}>{[r.supervisor,r.agent,r.call_id||'--',new Date(r.started_at).toLocaleString(),r.ended_at?floorDuration(r.duration_seconds):'Active',r.mode||'listen',floorDuration(Number(r.talk_seconds||0))].map((v,i)=><td key={i} style={{padding:8}}>{v}</td>)}</tr>)}</tbody></table></div>{history.next&&<button style={button} onClick={()=>readHistory(history.next)}>Load more</button>}</section>}
 </section>;
}
