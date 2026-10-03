import { paragonReportTotals } from './_paragonControls.js';
import { createClient } from '@supabase/supabase-js';
import { addDays, etDate, etMidnight, reportCsv } from './paragon-vendor-report.js';

export const createDailyHandler = ({now = () => new Date(),fetchImpl = fetch,makeDb = (url,key) => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})} = {}) => async () => {
  const current = now();
  const localHour = Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(current));
  if (localHour !== 18) return new Response('Outside 6 PM ET window');
  const day = etDate(current);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response('Database unavailable',{status:503});
  const db = makeDb(url,key);
  const {data:source,error:sourceError} = await db.from('lead_sources').select('id')
    .eq('name','Paragon Media').eq('type','publisher').eq('active',true).maybeSingle();
  if (sourceError || !source) return new Response('Paragon source unavailable',{status:503});
  const params = {p_source_id:source.id,p_start:etMidnight(day),p_end:etMidnight(addDays(day,1))};
  const calls = [];
  for (let offset=0; offset<100000; offset+=1000) {
    const {data,error} = await db.rpc('paragon_vendor_report',params).range(offset,offset+999);
    if (error) return new Response('Report unavailable',{status:503});
    calls.push(...data);
    if (data.length < 1000) break;
  }
  let totals;
  try { totals=await paragonReportTotals(db,source.id,params.p_start,params.p_end,calls); }
  catch { return new Response('Billing totals unavailable',{status:503}); }
  const amount=totals.reduce((sum,day)=>sum+Number(day.amount_due),0);
  const {data:logId,error:claimError} = await db.rpc('claim_paragon_report_email',{p_date:day,p_call_count:calls.length});
  if (claimError) return new Response('Send log unavailable',{status:503});
  if (!logId) return new Response('Already processed');
  if (calls.length === 0) return new Response('No Paragon calls');
  let status = 'failed';
  let messageId = null;
  let errorCode = null;
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('resend_not_configured');
    const csv = reportCsv(calls);
    const response = await fetchImpl('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`paragon-daily-${day}`},
      body:JSON.stringify({
        from:'reports@newgenhealthsolutions.com',reply_to:'mike@newgenhealthsolutions.com',
        to:['dispo@paragonmedia.io'],
        subject:`Paragon daily dispositions — ${day} ET`,
        text:`Attached: ${calls.length} Paragon calls received on ${day} Eastern Time. Expected amount: $${amount.toFixed(2)} using stored contract rates.`,
        attachments:[{filename:`paragon-dispositions-${day}.csv`,content:Buffer.from(csv,'utf8').toString('base64')}],
      }),signal:AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(`resend_${response.status}`);
    status = 'sent';
    messageId = result.id;
  } catch (error) {
    errorCode = String(error.message || 'send_failed').slice(0,100);
    console.error('[paragon-daily-email] Send failed:',errorCode);
  }
  const {error:finishError} = await db.rpc('finish_paragon_report_email',{
    p_log_id:logId,p_status:status,p_message_id:messageId,p_error_code:errorCode,
  });
  if (finishError) return new Response('Send log update failed',{status:503});
  return new Response(status === 'sent' ? 'Sent' : 'Send failed',{status:status === 'sent' ? 200 : 503});
};

export default createDailyHandler();
export const config = {schedule:'0,15,30 22,23 * * *'};
