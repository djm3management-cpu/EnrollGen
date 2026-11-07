import {scoringFailureMessage} from '../../lib/scoringStatus.js';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {evidenceRequest} from '../../lib/evidenceApi.js';
import {formatCallDateTime} from '../../lib/callPresentation';
import {redactSensitiveText} from '../../lib/redaction';
import {complianceItemStatus,complianceViewModel} from '../../lib/complianceScore.js';
import {evaluateRules} from '../../compliance/rules/evaluate.js';
import CallTranscriptPlayer from '../callLog/CallTranscriptPlayer.jsx';
export const COMPLIANCE_WARNING_THRESHOLD=80;
const duration=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
const money=value=>value==null?'Unavailable':`$${Number(value).toFixed(4)}`;
const filters=['fail','partial','review','pass','na'];
export default function ComplianceReviewModal({callRecordId,onClose,displayDurationSeconds}){
 const {getToken}=useAppAuth();
 const [theme,setTheme]=useState('terminal');
 const [data,setData]=useState(null),[error,setError]=useState(''),[version,setVersion]=useState(''),[filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[seek,setSeek]=useState(null),[preview,setPreview]=useState(null);
 const load=useCallback(async()=>{
  try{const token=await getToken();const params=new URLSearchParams({call_id:callRecordId,...(version?{version_id:version}:{})});
   const r=await fetch(`/.netlify/functions/compliance-review?${params}`,{headers:{Authorization:`Bearer ${token}`}});const body=await r.json();if(!r.ok)throw Error(body.error||'Scorecard load failed');setData(body);setError('');
  }catch(e){setError(e.message);}
 },[getToken,callRecordId,version]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!['scoring','queued','transcript_pending'].includes(data?.call?.compliance_status)&&!data?.active_pass?.id)return;const timer=setInterval(load,5000);return()=>clearInterval(timer);},[data?.call?.compliance_status,data?.active_pass?.id,load]);
 const jump=useCallback(item=>{if(item.evidence_timestamp_ms!=null)setSeek({seconds:item.evidence_timestamp_ms/1000,nonce:Date.now()});},[]);
 const card=data?.scorecard,coverage=data?.coverage;
 const failure=scoringFailureMessage(data?.call);
 const view=complianceViewModel({scorecard:card,items:data?.items,coverage,filter});
 const incomplete=view.incomplete;
 const items=data?.items||[];
 const groups=view.groups;
 const computed=useMemo(()=>data?evaluateRules(data.call):null,[data]);
 const action=async name=>{
  setBusy(true);setError('');
  try{
   const estimate=await evidenceRequest(getToken,'compliance-review',{call_id:callRecordId,action:'preview'});
   if(name==='evaluate'){
    const result=await evidenceRequest(getToken,'compliance-review',{call_id:callRecordId,action:'evaluate',confirm:true,dry_run:false,request_id:crypto.randomUUID()});setPreview(result.dry_run?result:null);await load();return;
   }
   const cost=name==='fill'?estimate.gap_cost_usd:estimate.estimated_cost_usd;
   if(cost==null)throw Error('Contracted pricing is not configured');
   const details=name==='fill'?`${estimate.gap_minutes.toFixed(2)} minutes, ${money(cost)}`:`${estimate.estimated_input_tokens} input tokens, up to ${estimate.maximum_output_tokens} output tokens, ${money(cost)}`;
   if(!window.confirm(`${name==='fill'?'Fill transcript gaps':'Rescore call'}: ${details}?`))return;
   await evidenceRequest(getToken,'compliance-review',{call_id:callRecordId,action:name,confirm:true,approved_cost_usd:estimate.estimated_cost_usd,approved_gap_cost_usd:estimate.gap_cost_usd,approved_gap_minutes:estimate.gap_minutes,request_id:crypto.randomUUID()});await load();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const decide=async(item,decision)=>{
  setBusy(true);try{await evidenceRequest(getToken,'compliance-review',{call_id:callRecordId,action:'review',confirm:true,dry_run:false,item_id:item.id,decision,note:window.prompt('Note')||'',request_id:crypto.randomUUID()});await load();}catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const autoFails=items.filter(i=>i.auto_fail_triggered);
 return <div className="compliance-review-overlay" onClick={onClose}><div className={`compliance-review-modal compliance-overhaul${theme==='terminal'?' dark':' compliance-light'}`}  onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Compliance review">
  <header className="compliance-review-head"><h2>COMPLIANCE REVIEW</h2><button className="contacts-mini-btn" onClick={()=>setTheme(theme==='terminal'?'light':'terminal')}>{theme==='terminal'?'Light':'Terminal'}</button><button className="contacts-mini-btn" onClick={onClose}>Close</button></header>
  {error&&<div className="ops-error" role="alert">{error}</div>}
  {failure&&<div className="ops-error" role="alert">Scoring failed: {failure} The transcript is retained.</div>}
  {!data&&!error&&<div>Loading</div>}
  {data&&<>
   <div className="compliance-overhaul-toolbar">
    <span className="compliance-overhaul-score">{incomplete?'INCOMPLETE':card?view.score==null?'N/A':`${Math.round(view.score)}% ${card.overall_grade}`:'Pending'}</span>
    <span className="compliance-overhaul-badge">{incomplete?'SCORING INCOMPLETE':card?.auto_fail_triggered?'AUTO-FAIL':card?.pass_fail||'PENDING'}</span>
    {view.reviewRequired&&<span className="compliance-overhaul-badge">REVIEW REQUIRED</span>}<span>{card?.rules_version||'Legacy'}</span><span>{card?.created_at?formatCallDateTime(card.created_at):''}</span>
    <span>{card?.scoring_duration_ms==null?'':duration(card.scoring_duration_ms)}</span>
    <span>{card?.request_attempts==null?'':`${card.request_attempts} attempts`}</span><span>{card?.tokens_used==null?'':`${card.tokens_used.toLocaleString()} tokens`}</span><span>{card?.estimated_cost_usd==null?'':money(card.estimated_cost_usd)}</span>
    <select aria-label="Scorecard version" value={version||card?.id||''} onChange={e=>setVersion(e.target.value)}>{data.versions.map((v,i)=><option key={v.id} value={v.id}>Version {data.versions.length-i} · {formatCallDateTime(v.created_at)}</option>)}</select>
    {data.admin&&<><button className="contacts-mini-btn" disabled={busy||!!data.active_pass} onClick={()=>action('evaluate')}>Re-evaluate</button><button className="contacts-mini-btn" disabled={busy||incomplete||data.eligibility?.status==='na'||(data.call.compliance_status==='scoring'||!!data.active_pass)} onClick={()=>action('rescore')}>Rescore</button>{incomplete&&<button className="contacts-mini-btn" disabled={busy} onClick={()=>action('fill')}>Fill transcript gaps</button>}</>}
   </div>
   <dl className="compliance-review-meta"><div><dt>Agent</dt><dd>{data.call.agent_name||'Unknown'}</dd></div><div><dt>Consumer</dt><dd>{data.call.beneficiary_name||'Unknown'}</dd></div><div><dt>Talk</dt><dd>{duration((displayDurationSeconds??data.call.call_duration_seconds)*1000)}</dd></div><div><dt>Source</dt><dd>{data.source||'Unknown'}</dd></div></dl>
   <div className={`compliance-overhaul-coverage${coverage.complete?'':' is-incomplete'}`}><span>Transcript {duration(coverage.endMs)} of {duration(coverage.durationMs)} · {(coverage.ratio*100).toFixed(1)}%</span><progress max="1" value={coverage.ratio}/></div>
   {incomplete&&<div className="ops-error" role="alert">{coverage.complete?(card?.risk_flags?.[0]||data.call.metadata?.scoring_error||'Scoring could not finish'):`Transcript coverage ${(coverage.ratio*100).toFixed(1)}%`}</div>}
   {!incomplete&&autoFails.length>0&&<section><h3>AUTO-FAIL</h3>{autoFails.map(i=><button className="compliance-overhaul-evidence" key={i.id} onClick={()=>{setFilter('all');requestAnimationFrame(()=>document.getElementById(`rule-${i.id}`)?.scrollIntoView({block:'center'}));jump(i);}}>{i.question_text}<q>{redactSensitiveText(i.evidence_text||'Evidence unavailable')}</q><span>{i.evidence_timestamp_ms==null?'Timestamp unavailable':duration(i.evidence_timestamp_ms)}</span></button>)}</section>}
   {items.some(i=>i.result==='review')&&<section><h3>REVIEW</h3>{items.filter(i=>i.result==='review').map(i=><div key={i.id} className="compliance-overhaul-review"><button className="compliance-overhaul-evidence" onClick={()=>jump(i)}>{i.question_text}<q>{redactSensitiveText(i.evidence_text||'Evidence unavailable')}</q><span>{i.evidence_timestamp_ms==null?'Timestamp unavailable':duration(i.evidence_timestamp_ms)} · {Math.round((i.confidence||0)*100)}%</span></button>{data.admin&&<><button className="contacts-mini-btn" disabled={busy||!!data.active_pass||!i.evidence_text||i.evidence_timestamp_ms==null} onClick={()=>decide(i,'confirm')}>Confirm violation</button><button className="contacts-mini-btn" disabled={busy||!!data.active_pass} onClick={()=>decide(i,'dismiss')}>Dismiss</button></>}</div>)}</section>}
   <nav className="compliance-overhaul-timeline" aria-label="Compliance timeline">{Object.entries(computed?.timeline||{}).map(([name,line])=><button key={name} disabled={!line} onClick={()=>jump({evidence_timestamp_ms:line?.start_ms})}>{({recording:'Recording',tpmo:'TPMO',firstBenefit:'First benefit',soa:'SOA',needsAssessment:'Needs assessment',planPresentation:'Plan presentation',pecl:'PECL',consent:'Consent',enrollment:'Enrollment'})[name]||name} · {line?duration(line.start_ms):'Missing'}</button>)}</nav>
   <div className="compliance-overhaul-categories">{Object.entries(card?.category_scores||{}).map(([name,c])=><div key={name}><span>{name.replaceAll('_',' ')} {c.earned}/{c.possible}</span><progress max={c.possible||1} value={c.earned}/></div>)}</div>
   <div className="compliance-overhaul-filters"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All</button>{filters.map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='na'?'N/A':f}</button>)}</div>
   {preview&&<div role="status">Dry run · {preview.status} · {preview.items.filter(i=>i.result==='fail').length} findings</div>}
   <div className="compliance-overhaul-items">{Object.entries(groups).map(([category,rows])=><section key={category}><h3>{category.replaceAll('_',' ')}</h3>{rows.map(i=><article id={`rule-${i.id}`} key={i.id} className="compliance-overhaul-item"><div><span>{i.question_text}</span><span className="compliance-overhaul-badge">{complianceItemStatus(i).label}</span><span>{i.points_earned}/{i.points_possible}</span><span>{i.decided_by||'Legacy'}</span></div><p>{redactSensitiveText(i.evidence_text||i.missing_reason||i.notes||'Evidence unavailable')}</p>{i.evidence_timestamp_ms!=null&&<button onClick={()=>jump(i)}>{duration(i.evidence_timestamp_ms)}</button>}</article>)}</section>)}</div>
   {items.length===0&&card&&card.scoring_state!=='na'&&<div className="ops-error">Scorecard items unavailable</div>}
   <CallTranscriptPlayer row={{...data.call,call_record_id:callRecordId,duration_seconds:data.call.call_duration_seconds}} detail={data.call} seekRequest={seek}/>
  </>}
 </div></div>;
}
