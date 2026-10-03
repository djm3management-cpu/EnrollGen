import { createHash } from 'node:crypto';
import twilio from 'twilio';
export const missingBillingMigration = error => ['PGRST202', '42P01', '42883'].includes(error?.code);
const terminal = new Set(['completed', 'canceled', 'failed', 'busy', 'no-answer']);
const timestamp = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;

// Runs only behind signature verification. No audio, transcript, caller phone,
// browser timing or recording duration enters the billing event ledger.
export async function enqueueBillingCallback(db, config, body) {
  if (body.AccountSid !== config.twilioAccountSid) throw new Error('Billing callback account mismatch');
  const parent = body.ParentCallSid || body.CallSid;
  const payload = Object.fromEntries(['AccountSid', 'CallSid', 'ParentCallSid', 'CallStatus', 'Timestamp', 'SequenceNumber',
    'DialCallSid', 'DialCallStatus', 'DialBridged', 'CallDuration', 'DialCallDuration'].filter(key => body[key] != null).map(key => [key, String(body[key]).slice(0,200)]));
  const key = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const { error } = await db.rpc('enqueue_paragon_billing_event', { p_parent_sid: parent, p_event_key: key, p_payload: payload });
  if (error && !missingBillingMigration(error)) throw new Error('Billing callback persistence failed');
}

export async function resolveParagonArrival(db, params, arrivedAt) {
  let result = await db.rpc('resolve_recent_paragon_ping_at', { ...params, p_arrived_at: arrivedAt });
  if (missingBillingMigration(result.error)) return { ...await db.rpc('resolve_recent_paragon_ping', params), billingReady:false };
  return { ...result, billingReady:!result.error };
}
export async function verifiedParagonArrival(config, callSid, fetchParent = sid => twilio(config.twilioAccountSid,config.twilioAuthToken,{timeout:5000,autoRetry:false}).calls(sid).fetch()) {
  const parent=await fetchParent(callSid);
  const arrived=timestamp(parent.dateCreated);
  if(parent.sid!==callSid || parent.accountSid!==config.twilioAccountSid || parent.direction!=='inbound' || !arrived || Date.parse(arrived)>Date.now()+5000) throw new Error('Paragon arrival could not be verified');
  return arrived;
}
export async function claimParagonArrival(db, params, arrivedAt) {
  let result = await db.rpc('claim_paragon_call_at', { ...params, p_arrived_at: arrivedAt });
  if (missingBillingMigration(result.error)) result = await db.rpc('claim_paragon_call', params);
  return result;
}

export function verifiedBillingSnapshot(parent, children, config, events = []) {
  if (parent.accountSid !== config.twilioAccountSid || parent.direction !== 'inbound' || !timestamp(parent.dateCreated)) throw new Error('invalid_parent');
  const arrived = timestamp(parent.dateCreated);
  let ended = terminal.has(parent.status) ? timestamp(parent.endTime) : null;
  if (!ended && terminal.has(parent.status)) {
    // Failed/unanswered parent resources can lack endTime. Only a previously
    // signed terminal PARENT event may supply it, never a child completion.
    const event = events.filter(event => event.CallSid === parent.sid && !event.ParentCallSid &&
      event.AccountSid === config.twilioAccountSid && terminal.has(event.CallStatus) && timestamp(event.Timestamp))
      .sort((a,b) => new Date(b.Timestamp)-new Date(a.Timestamp))[0];
    ended = timestamp(event?.Timestamp);
  }
  const connected = [];
  for (const child of children) {
    if (child.accountSid !== config.twilioAccountSid || child.parentCallSid !== parent.sid) throw new Error('invalid_child');
    if (child.status === 'completed') {
      if (!timestamp(child.endTime) || !/^\d+$/.test(String(child.duration))) throw new Error('incomplete_child');
      if (Number(child.duration)>0) connected.push({
        answer: new Date(new Date(child.endTime).getTime()-Number(child.duration)*1000).toISOString(),
        seconds: Number(child.duration),
      });
    }
  }
  const answered = connected.map(child=>child.answer).sort()[0] || null;
  // Keep active calls' talk unknown; do not freeze a provisional child result.
  const talk = ended && children.every(child=>terminal.has(child.status)) ? connected.reduce((n,child)=>n+child.seconds,0) : null;
  if (ended && new Date(ended)<new Date(arrived)) throw new Error('invalid_parent_time');
  if (answered && (new Date(answered)<new Date(arrived) || (ended && new Date(answered)>new Date(ended)))) throw new Error('invalid_answer_time');
  return { arrived, ended, answered, talk };
}

export async function processBillingJob({ db, config, job, fetchParent, fetchChildren }) {
  try {
    const parent = await fetchParent(job.parent_call_sid);
    if (parent.sid !== job.parent_call_sid) throw new Error('parent_sid_mismatch');
    const children = await fetchChildren(job.parent_call_sid);
    if (children.length >= 20) throw new Error('child_limit');
    const { data: events, error } = await db.from('paragon_billing_events').select('payload')
      .eq('parent_call_sid', job.parent_call_sid).order('received_at', { ascending:false }).limit(100);
    if (error) throw new Error('event_read');
    const snapshot = verifiedBillingSnapshot(parent, children, config, (events || []).map(row=>row.payload));
    const { data, error: persistError } = await db.rpc('record_paragon_billing_snapshot', {
      p_sid: job.parent_call_sid, p_lease: job.lease_token, p_account: parent.accountSid,
      p_arrived: snapshot.arrived, p_ended: snapshot.ended, p_answered: snapshot.answered, p_talk: snapshot.talk,
      p_evidence: { parent_status:parent.status, parent_source:'twilio.dateCreated/endTime', child_sids:children.map(child=>child.sid), verified_at:new Date().toISOString() },
    });
    if (persistError) throw new Error('snapshot_write');
    return data;
  } catch {
    const delay = Math.min(3600, 5 * 2 ** Math.min(job.attempts,10));
    const { error } = await db.from('paragon_call_billing').update({ error_code:'provider_verification_retry',
      next_attempt_at:new Date(Date.now()+delay*1000).toISOString(), lease_token:null, lease_until:null })
      .eq('parent_call_sid',job.parent_call_sid).eq('lease_token',job.lease_token);
    if (error) throw new Error('billing_retry_write');
    return 'retry';
  }
}
export function startParagonBillingWorker({ db, config, interval = setInterval, log = console.error }) {
  const client = twilio(config.twilioAccountSid,config.twilioAuthToken,{ timeout:8000,autoRetry:false });
  let busy=false;
  const tick = async () => {
    if (busy) return;
    busy=true;
    try {
      const { data, error } = await db.rpc('claim_paragon_billing_jobs',{ p_limit:2 });
      if (error) { if (!missingBillingMigration(error)) log('Paragon billing queue unavailable'); return; }
      const results=await Promise.allSettled((data || []).map(job=>processBillingJob({db,config,job,
        fetchParent:sid=>client.calls(sid).fetch(),
        fetchChildren:sid=>client.calls.list({parentCallSid:sid,limit:20,pageSize:20}),
      })));
      if(results.some(result=>result.status==='rejected')) log('Paragon billing retry persistence unavailable');
    } finally { busy=false; }
  };
  const timer=interval(()=>void tick().catch(()=>log('Paragon billing worker failed')),15000);
  timer.unref?.(); void tick().catch(()=>log('Paragon billing worker failed'));
  return { tick, stop:()=>clearInterval(timer) };
}
