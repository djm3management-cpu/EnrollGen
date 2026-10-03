import { paragonReportTotals } from './_paragonControls.js';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const HEADERS = {
  'Cache-Control':'private, no-store, max-age=0',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
export const COLUMNS = ['call_id','received_at','caller_phone','caller_state','duration_seconds','billable','non_billable_reason','disposition_category'];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
export const etDate = date => new Intl.DateTimeFormat('en-CA',{ timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit' }).format(date);
export const etTime = value => new Intl.DateTimeFormat('en-US',{ timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short' }).format(new Date(value));
export const etMidnight = day => {
  const target=Date.parse(`${day}T00:00:00Z`);
  let candidate=target;
  const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++) {
    const parts=Object.fromEntries(format.formatToParts(new Date(candidate)).map(part=>[part.type,part.value]));
    const rendered=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    const correction=target-rendered;
    candidate+=correction;
    if(!correction) break;
  }
  return new Date(candidate).toISOString();
};
export const addDays = (day, count) => new Date(Date.parse(`${day}T12:00:00Z`) + count*86400000).toISOString().slice(0,10);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
export const csvCell = value => {
  const safe = String(value ?? '');
  const neutral = /^[\s]*[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return `"${neutral.replaceAll('"','""')}"`;
};
export const reportCsv = calls => [COLUMNS.join(','),...calls.map(call => COLUMNS.map(column => csvCell(column === 'received_at' ? etTime(call.received_at) : call[column])).join(','))].join('\r\n');
const respond = (body,status=200,contentType='text/html; charset=utf-8') => new Response(body,{status,headers:{...HEADERS,'Content-Type':contentType}});

export const createHandler = (makeDb = (url,key) => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})) => async request => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const hash = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return respond('Service unavailable',503,'text/plain; charset=utf-8');
  const db = makeDb(supabaseUrl,key);
  const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const {data:sourceId,error:authError} = await db.rpc('authorize_paragon_report',{p_hash:hash,p_ip:ip});
  if (authError) return respond('Service unavailable',503,'text/plain; charset=utf-8');
  if (request.method !== 'GET') return respond('Not found',404,'text/plain; charset=utf-8');
  if (!sourceId) return respond('Not found',404,'text/plain; charset=utf-8');

  const today = etDate(new Date());
  const start = url.searchParams.get('start') || addDays(today,-6);
  const end = url.searchParams.get('end') || today;
  if (!validDate(start) || !validDate(end) || start > end || Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`) > 365*86400000)
    return respond('Invalid date range',400,'text/plain; charset=utf-8');
  const params = {p_source_id:sourceId,p_start:etMidnight(start),p_end:etMidnight(addDays(end,1))};
  const calls = [];
  for (let offset=0; offset<100000; offset+=1000) {
    const {data,error} = await db.rpc('paragon_vendor_report',params).range(offset,offset+999);
    if (error) return respond('Report unavailable',503,'text/plain; charset=utf-8');
    calls.push(...data);
    if (data.length < 1000) break;
  }
  const rows = calls.map(call => ({...call,received_at:etTime(call.received_at)}));
  if (url.searchParams.get('format') === 'csv') {
    const csv = reportCsv(calls);
    return new Response(csv,{headers:{...HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="paragon-report.csv"'}});
  }
  let daily;
  try { daily=await paragonReportTotals(db,sourceId,params.p_start,params.p_end,calls); }
  catch { return respond('Billing totals unavailable',503,'text/plain; charset=utf-8'); }
  const tokenQuery = encodeURIComponent(token);
  const csvUrl = `/vendor/paragon?token=${tokenQuery}&start=${start}&end=${end}&format=csv`;
  const dailyRows = daily.sort((a,b) => b.day.localeCompare(a.day)).map(total => `<tr><td>${escapeHtml(total.day)}</td><td>${total.calls}</td><td>${total.billable}</td><td>$${Number(total.amount_due).toFixed(2)}</td></tr>`).join('');
  const reportRows = rows.map(row => `<tr>${COLUMNS.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('');
  return respond(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Paragon call report</title><style>
    :root{color-scheme:dark;font-family:Inter,Arial,sans-serif;background:#080b10;color:#f8fafc}body{margin:0;padding:30px;max-width:1400px;margin-inline:auto}h1,h2{font-size:1.1rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase}h1{font-size:1.5rem}.card{padding:16px;border:1px solid rgba(255,255,255,.11);border-radius:2px;background:linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.017) 1px,transparent 1px),linear-gradient(180deg,rgba(13,13,13,.96),rgba(5,5,5,.96));background-size:18px 18px,18px 18px,100% 100%;margin:16px 0}.muted{color:#8fa4bc;font-size:.85rem}form{display:flex;align-items:end;gap:12px;flex-wrap:wrap}label{display:flex;flex-direction:column;gap:5px;font-size:.8rem}input{background:#151c2b;color:inherit;border:1px solid #334155;border-radius:7px;padding:8px}button,.button{background:#1b344e;color:#f8fafc;border:1px solid #46617a;border-radius:7px;padding:9px 14px;text-decoration:none;font:inherit;cursor:pointer}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.8rem}th,td{border-bottom:1px solid #334155;padding:9px;text-align:left;white-space:nowrap}th{color:#8fa4bc}a{color:#9dd2ff}@media(max-width:600px){body{padding:16px}}
    </style></head><body><header><h1>Paragon call report</h1><p class="muted">Times shown in Eastern Time · Stored contract rate · billable at 90 seconds from arrival</p></header><section class="card"><form method="get" action="/vendor/paragon"><input type="hidden" name="token" value="${escapeHtml(token)}"><label>From <input type="date" name="start" value="${start}" required></label><label>Through <input type="date" name="end" value="${end}" required></label><button type="submit">Apply</button><a class="button" href="${escapeHtml(csvUrl)}">Download CSV</a></form></section><section class="card"><h2>Daily totals</h2><div class="table-wrap"><table><thead><tr><th>Date (ET)</th><th>Calls</th><th>Billable calls</th><th>Amount due</th></tr></thead><tbody>${dailyRows || '<tr><td colspan="4">No calls in this range.</td></tr>'}</tbody></table></div></section><section class="card"><h2>Calls</h2><div class="table-wrap"><table><thead><tr>${COLUMNS.map(column => `<th>${column}</th>`).join('')}</tr></thead><tbody>${reportRows || '<tr><td colspan="8">No calls in this range.</td></tr>'}</tbody></table></div></section></body></html>`);
};

export default createHandler();
