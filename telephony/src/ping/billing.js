// Generic ping billing (spec section 5, session S2). Same Twilio-verified
// arrival and billable seconds as Paragon: the pure verification in
// paragonBilling.js is reused unchanged, and only ping_call_billing* is written.
import { createHash } from 'node:crypto';
import twilio from 'twilio';
import { createLogger, loggedJob } from '../lib/logger.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import { missingBillingMigration, verifiedBillingSnapshot } from '../paragonBilling.js';

const logger = createLogger('telephony', 'pingbilling');
const platformEnabled = () => featureEnabled('PING_PLATFORM_ENABLED');
const EVENT_FIELDS = ['AccountSid', 'CallSid', 'ParentCallSid', 'CallStatus', 'Timestamp', 'SequenceNumber',
  'DialCallSid', 'DialCallStatus', 'DialBridged', 'CallDuration', 'DialCallDuration'];
const timestamp = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;

/** Provider fields only: no audio, transcript, caller phone or browser timing. */
export function billingEventPayload(body) {
  return Object.fromEntries(EVENT_FIELDS.filter(key => body[key] != null).map(key => [key, String(body[key]).slice(0, 200)]));
}

// Runs only behind Twilio signature verification.
export async function enqueuePingBillingCallback(db, config, body, { enabled = platformEnabled } = {}) {
  if (!enabled()) return { status: 'disabled' };
  if (body.AccountSid !== config.twilioAccountSid) throw new Error('Billing callback account mismatch');
  const payload = billingEventPayload(body);
  const key = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const { error } = await db.rpc('enqueue_ping_billing_event', {
    p_parent_sid: body.ParentCallSid || body.CallSid, p_event_key: key, p_payload: payload,
  });
  if (error && !missingBillingMigration(error)) throw new Error('Ping billing callback persistence failed');
  return { status: 'queued' };
}

const defaultFetchParent = config => sid =>
  twilio(config.twilioAccountSid, config.twilioAuthToken, { timeout: 5000, autoRetry: false }).calls(sid).fetch();

/** Twilio's parent dateCreated, not webhook latency, owns the arrival window. */
export async function verifiedPingArrival(config, callSid, fetchParent = defaultFetchParent(config)) {
  const parent = await fetchParent(callSid);
  const arrived = timestamp(parent.dateCreated);
  if (parent.sid !== callSid || parent.accountSid !== config.twilioAccountSid || parent.direction !== 'inbound' ||
    !arrived || Date.parse(arrived) > Date.now() + 5000) throw new Error('Ping arrival could not be verified');
  return arrived;
}

// Signed parent events from both ledgers. Status callbacks are still queued by
// the Paragon path; they are only read here, never written.
async function parentEvents(db, sid) {
  const events = [];
  for (const table of ['ping_call_billing_events', 'paragon_billing_events']) {
    const { data, error } = await db.from(table).select('payload').eq('parent_call_sid', sid)
      .order('received_at', { ascending: false }).limit(100);
    if (error) {
      if (table === 'paragon_billing_events') continue;
      throw new Error('event_read');
    }
    events.push(...(data || []).map(row => row.payload));
  }
  return events;
}

export async function processPingBillingJob({ db, config, job, fetchParent, fetchChildren }) {
  try {
    const parent = await fetchParent(job.parent_call_sid);
    if (parent.sid !== job.parent_call_sid) throw new Error('parent_sid_mismatch');
    const children = await fetchChildren(job.parent_call_sid);
    if (children.length >= 20) throw new Error('child_limit');
    const snapshot = verifiedBillingSnapshot(parent, children, config, await parentEvents(db, job.parent_call_sid));
    const { data, error } = await db.rpc('record_ping_billing_snapshot', {
      p_sid: job.parent_call_sid, p_lease: job.lease_token, p_account: parent.accountSid,
      p_arrived: snapshot.arrived, p_ended: snapshot.ended, p_answered: snapshot.answered, p_talk: snapshot.talk,
      p_evidence: { parent_status: parent.status, parent_source: 'twilio.dateCreated/endTime',
        child_sids: children.map(child => child.sid), verified_at: new Date().toISOString() },
    });
    if (error) throw new Error('snapshot_write');
    return data;
  } catch {
    const delay = Math.min(3600, 5 * 2 ** Math.min(job.attempts, 10));
    const { error } = await db.from('ping_call_billing').update({ error_code: 'provider_verification_retry',
      next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(), lease_token: null, lease_until: null })
      .eq('parent_call_sid', job.parent_call_sid).eq('lease_token', job.lease_token);
    if (error) throw new Error('billing_retry_write');
    return 'retry';
  }
}

export function startPingBillingWorker({ db, config, interval = setInterval, log = logger.error, enabled = platformEnabled,
  client = null } = {}) {
  if (!enabled()) return { tick: async () => {}, stop: () => {} };
  const twilioClient = client || twilio(config.twilioAccountSid, config.twilioAuthToken, { timeout: 8000, autoRetry: false });
  let busy = false;
  const tick = loggedJob('telephony', async () => {
    if (busy) return;
    busy = true;
    try {
      const { data, error } = await db.rpc('claim_ping_billing_jobs', { p_limit: 2 });
      if (error) { if (!missingBillingMigration(error)) log('Ping billing queue unavailable'); return; }
      const results = await Promise.allSettled((data || []).map(job => processPingBillingJob({ db, config, job,
        fetchParent: sid => twilioClient.calls(sid).fetch(),
        fetchChildren: sid => twilioClient.calls.list({ parentCallSid: sid, limit: 20, pageSize: 20 }),
      })));
      if (results.some(result => result.status === 'rejected')) log('Ping billing retry persistence unavailable');
    } finally { busy = false; }
  });
  const timer = interval(() => void tick().catch(() => log('Ping billing worker failed')), 15000);
  timer.unref?.(); void tick().catch(() => log('Ping billing worker failed'));
  return { tick, stop: () => clearInterval(timer) };
}
