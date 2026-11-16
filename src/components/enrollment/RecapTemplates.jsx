import {useEffect,useRef,useState} from 'react';
import {useAppAuth} from '../../context/AuthContext';
import {fetchWithClerk} from '../../lib/clerkFetch.js';
import {RECAP_FIELDS,RECAP_SAMPLE,renderRecap,recapTemplates} from '../../lib/clientRecap.js';
export default function RecapTemplates(){
 const {getToken}=useAppAuth(),input=useRef(null);
 const [templates,setTemplates]=useState(null),[channel,setChannel]=useState('sms'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let cancelled=false;fetchWithClerk(getToken,'/.netlify/functions/tenant-settings?section=client_recap').then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error);if(!cancelled)setTemplates(body.templates);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[getToken,revision]);
 const update=body=>setTemplates(t=>({...t,[channel]:{...t[channel],body}}));
 let preview='';try{if(templates)preview=renderRecap(templates[channel],RECAP_SAMPLE,channel);}catch(e){preview=e.message;}
 async function save(){setBusy(true);setError('');try{recapTemplates(templates);const r=await fetchWithClerk(getToken,'/.netlify/functions/tenant-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_recap_templates:templates})});if(!r.ok)throw Error((await r.json()).error);setRevision(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section aria-label="Recap templates" style={{fontWeight:400,marginBlock:24}}>
  <h3 style={{fontWeight:500}}>Recap templates</h3>
  {error&&<p className="ops-error" role="alert">{error}</p>}
  {templates&&<>
   <label>Channel <select value={channel} onChange={e=>setChannel(e.target.value)}><option value="sms">Text</option><option value="pdf">PDF</option></select></label>
   <span>Version {templates[channel].version}</span>
   <div>{RECAP_FIELDS.map(field=><button className="contacts-mini-btn" type="button" key={field} disabled={channel==='sms'&&field==='confirmationNumber'} onClick={()=>{const body=templates[channel].body,start=input.current?.selectionStart??body.length,end=input.current?.selectionEnd??start;update(body.slice(0,start)+'{{'+field+'}}'+body.slice(end));}}>{field}</button>)}</div>
   <textarea aria-label="Template body" ref={input} value={templates[channel].body} maxLength={1800} rows={6} onChange={e=>update(e.target.value)}/>
   <p style={{whiteSpace:'pre-wrap'}} aria-label="Synthetic recap preview">{preview}</p>
   <button type="button" className="contacts-mini-btn" disabled={busy} onClick={save}>Save recap templates</button>
  </>}
 </section>;
}
