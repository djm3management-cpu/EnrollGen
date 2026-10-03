import { EvidenceError } from './_evidenceAccess.js';
export const isMissing067 = error => ['PGRST202','42883','42P01'].includes(error?.code);
export function validateParagonControls(body) {
 const hours=body.staffed_hours;
 if (!hours || hours.timezone!=='America/New_York' || !hours.days) throw new EvidenceError(400,'Invalid staffed hours.');
 for (const day of ['mon','tue','wed','thu','fri','sat','sun']) {
  const item=hours.days[day];
  if (!item || typeof item.enabled!=='boolean') throw new EvidenceError(400,'Choose enabled days.');
  if (item.enabled && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start || '') ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end || '') || item.start>=item.end)) throw new EvidenceError(400,'Opening time must precede closing time.');
 }
 const cap=body.daily_cap==='' || body.daily_cap===null ? null : body.daily_cap;
 if ((cap!==null && (!Number.isInteger(cap) || cap<=0)) || !['soft','hard'].includes(body.cap_mode) ||
   !Number.isFinite(body.rate) || body.rate<=0 || body.rate>99999999.99 || Number(body.rate.toFixed(2))!==body.rate) throw new EvidenceError(400,'Invalid cap, mode or rate.');
 return {hours,cap,mode:body.cap_mode,rate:body.rate};
}
export async function paragonReportTotals(db, sourceId, start, end, calls) {
 const {data,error}=await db.rpc('paragon_report_totals',{p_source:sourceId,p_start:start,p_end:end});
 if (!error) return data || [];
 if (!isMissing067(error)) throw new Error('Billing totals unavailable');
 // Temporary pre-migration adapter only; 067 replaces it with stored rates.
 const daily=new Map();
 for (const call of calls) {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(call.received_at));
  const total=daily.get(day) || {day,calls:0,billable:0,amount_due:0};
  total.calls++;if(call.billable==='yes'){total.billable++;total.amount_due+=28;}daily.set(day,total);
 }
 return [...daily.values()];
}
