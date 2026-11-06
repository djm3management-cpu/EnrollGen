// No provider clients or mutation methods. All network requests are GETs.
import { writeFile } from 'node:fs/promises';
const base=process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY;
if(!base||!key)throw Error('Supabase URL and secret key required');
async function read(table,filters={}) {
 const rows=[];
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({select:'*',...filters,limit:'500',offset:String(offset),order:filters.order||'id.asc'});
  console.log(`GET ${table}?${query}`);
  const r=await fetch(`${base}/rest/v1/${table}?${query}`,{headers:{apikey:key}});
  const d=await r.json();if(!r.ok)throw Error(`${table}: ${JSON.stringify(d)}`);
  rows.push(...d);if(d.length<500)return rows;
 }
}
const calls=await read('call_records',{call_start:'gte.2026-10-01T00:00:00Z'});
const templates=await read('scoring_templates',{is_active:'eq.true'});
const templateItems=await read('scoring_template_items');
const intents=await read('compliance_intents');
const cards=await read('compliance_scorecards',{created_at:'gte.2026-10-01T00:00:00Z'});
const items=await read('scorecard_items');
const agents=await read('enrolled_agents');
const contacts=await read('contacts');
const attempts=await read('telephony_call_attempts');
const data={calls,templates,templateItems,intents,cards,items,agents,contacts,attempts};
if(process.argv.includes('--execute'))throw Error('This tool is read-only; no execute mode exists');
if(process.argv.includes('--include-history')){data.historicalCalls=await read('call_records');data.historicalCards=await read('compliance_scorecards');}
for(const table of ['availability_agent_subjects','recording_agent_subjects'])data[table]=await read(table,{order:'tenant_id.asc'});
if(process.argv.includes('--decrypt-names')){
 const linked=new Set((data.historicalCalls||data.calls).map(c=>c.contact_id));
 for(const contact of contacts.filter(c=>linked.has(c.id)))for(const field of ['first_name','last_name'])if(contact.pii_encrypted?.[field]){
  console.log(`READ ONLY RPC SELECT public.decrypt_pii_value($1::jsonb); $1=snapshot.contacts[${contact.id}].pii_encrypted.${field}`);
  const r=await fetch(`${base}/rest/v1/rpc/decrypt_pii_value`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_encrypted:contact.pii_encrypted[field]})});
  if(!r.ok)throw Error('Read-only name decryption failed');contact[field]=await r.json();
 }
}
const at=process.argv.indexOf('--snapshot');const path=at>=0?process.argv[at+1]:'/tmp/enrollgen-compliance-audit.json';
await writeFile(path,JSON.stringify(data),{mode:0o600});
console.log(JSON.stringify({snapshot:path,calls:calls.length,cards:cards.length,items:items.length}));
