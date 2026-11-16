import {useEffect,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {useTenantConfig} from '../../hooks/useTenantConfig';
import {evidenceRequest} from '../../lib/evidenceApi';
import {RESHOP_REASONS,RESHOP_OUTCOMES,RESHOP_GROUPS,permissionLabel} from '../../lib/reshopList';
const planId=p=>[p?.contract_id,p?.plan_id,p?.segment_id].filter(Boolean).join('-')||'Not recorded';
function ReshopRow({row,onOpenContact,onChanged}){
 const {getToken}=useAppAuth(),[outcome,setOutcome]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[prompt,setPrompt]=useState(false);
 const act=async action=>{
  setBusy(true);setError('');try{
   const result=await evidenceRequest(getToken,'reshop-list',{id:row.id,action,...(action==='review'?{outcome}:{})});
   setPrompt(result.use_do_not_call_control===true);await onChanged();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 };
 return <tr>
  <td><button type="button" className="contacts-mini-btn" onClick={()=>onOpenContact(row.contact_id)}>{row.client||'Open contact'}</button><div>{permissionLabel(row.permission)}</div></td>
  <td><div className="mono">{planId(row.current)}</div><div>{row.carrier} · {row.year||'--'} · {row.coverage}</div>{!row.county_confirmed&&<div>County not confirmed</div>}</td>
  <td>{row.successors.length?row.successors.map(s=><div key={planId(s)}><span className="mono">{planId(s)}</span><div>{s.plan_type||'--'} · {s.monthly_premium==null?'--':`$${Number(s.monthly_premium).toFixed(2)}`} · {s.overall_star_rating==null?'Stars not recorded':`${s.overall_star_rating} stars`}</div></div>):'--'}</td>
  <td>{row.reasons.map(code=><div key={code}>{RESHOP_REASONS[code]}</div>)}{row.premium_increase>0&&<div className="mono">+${Number(row.premium_increase).toFixed(2)}</div>}</td>
  <td>{row.agent}</td>
  <td>{row.review.outcome?<><div>{RESHOP_OUTCOMES[row.review.outcome]}</div><div className="mono">{row.review.actor} · {new Date(row.review.time).toLocaleString()}</div></>:'Unreviewed'}
   {(prompt||row.review.outcome==='asked_not_to_be_contacted')&&<button type="button" className="contacts-mini-btn" onClick={()=>onOpenContact(row.contact_id)}>Use contact do-not-call control</button>}
  </td>
  <td><button type="button" data-key-role="secondary" className="contacts-mini-btn" disabled={busy||!row.reasons.length||!!row.review.task_id} onClick={()=>act('task')}>{row.review.task_id?'Task added':'Add task'}</button>
   {!row.review.outcome&&<><select aria-label={`Review outcome for ${row.client||row.id}`} value={outcome} disabled={busy} onChange={e=>setOutcome(e.target.value)}><option value="">Outcome</option>{Object.entries(RESHOP_OUTCOMES).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select><button type="button" className="contacts-mini-btn" disabled={busy||!outcome} onClick={()=>act('review')}>Mark reviewed</button></>}
   {error&&<div className="ops-error" role="alert">{error}</div>}
  </td>
 </tr>;
}
export default function ReshopList({onOpenContact}){
 const {features={}}=useTenantConfig();
 return features.RESHOP_LIST_ENABLED?<ReshopWorkspace onOpenContact={onOpenContact}/>:null;
}
function ReshopWorkspace({onOpenContact}){
 const {getToken}=useAppAuth(),[filters,setFilters]=useState({}),[offset,setOffset]=useState(0),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[renewing,setRenewing]=useState(false);
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  evidenceRequest(getToken,`reshop-list?${new URLSearchParams({...filters,offset,limit:100})}`).then(result=>{if(active)setData(result);}).catch(e=>{if(active){setData(null);setError(e.message);}}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[getToken,filters,offset,revision]);
 const change=(key,value)=>{setFilters(f=>{const next={...f};if(value)next[key]=value;else delete next[key];return next;});setOffset(0);};
 const filter=(key,label,options)=><select aria-label={label} value={filters[key]||''} onChange={e=>change(key,e.target.value)}><option value="">{label}</option>{options.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select>;
 const table=rows=><div className="contacts-table-wrap"><table className="contacts-table" style={{fontWeight:400}}><thead><tr>{['Client','Current plan','Successor plan','Reasons','Writing agent','Review state','Actions'].map(label=><th style={{fontWeight:500}} key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><ReshopRow key={row.id} row={row} onOpenContact={onOpenContact} onChanged={()=>setRevision(v=>v+1)}/>)}</tbody></table></div>;
 return <section className="call-log-tab" aria-label="Re-shop list" aria-busy={busy} style={{fontWeight:400,minWidth:0}}>
  <div className="ops-command-line" style={{fontWeight:500}}><span>Re-shop</span><span>{data?.total||0} clients</span></div>
  <div className="call-log-filters">{Object.entries(RESHOP_REASONS).map(([code,label])=><button type="button" className="contacts-mini-btn" key={code} aria-pressed={filters.reason===code} onClick={()=>change('reason',filters.reason===code?'':code)}>{label} {data?.counts[code]||0}</button>)}</div>
  <div className="call-log-filters">
   {filter('reason','All reasons',Object.entries(RESHOP_REASONS))}
   {filter('agent','All agents',(data?.options.agents||[]).map(a=>[a.id,a.name]))}
   {filter('carrier','All carriers',(data?.options.carriers||[]).filter(Boolean).map(c=>[c,c]))}
   {filter('state','All states',(data?.options.states||[]).filter(Boolean).map(s=>[s,s]))}
   {filter('review','All review states',[['unreviewed','Unreviewed'],...Object.entries(RESHOP_OUTCOMES)])}
   <button type="button" className="contacts-mini-btn" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh</button>
  </div>
  {error&&<div className="ops-error" role="alert">{error}</div>}
  {Object.entries(RESHOP_GROUPS).map(([code,label])=>{
   const rows=data?.rows.filter(r=>r.group===code)||[];if(!rows.length)return null;
   return code==='renewing'?<details key={code} open={renewing} onToggle={e=>setRenewing(e.currentTarget.open)}><summary>{label} ({rows.length})</summary>{table(rows)}</details>:<section key={code}><h3 style={{fontWeight:500}}>{label} ({rows.length})</h3>{table(rows)}</section>;
  })}
  {data&&!data.total&&<p className="contacts-muted">No clients</p>}
  <div className="call-log-filters"><button type="button" className="contacts-mini-btn" disabled={busy||!offset} onClick={()=>setOffset(v=>Math.max(0,v-100))}>Previous</button><span>{data?.total?`${offset+1}–${Math.min(offset+100,data.total)} of ${data.total}`:'0'}</span><button type="button" className="contacts-mini-btn" disabled={busy||!data||offset+100>=data.total} onClick={()=>setOffset(v=>v+100)}>Next</button></div>
 </section>;
}
