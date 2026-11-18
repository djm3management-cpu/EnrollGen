// /twilio/voice and /twilio/dial-result around the S2 generic arrival hook.
// Golden: with PING_PLATFORM_ENABLED off, and with it on while the only
// matching decision belongs to a legacy-mode Paragon campaign, every scenario
// returns byte for byte the TwiML captured from the pre-S2 code
// (tests/fixtures/ping-voice-golden.json, written with PING_VOICE_GOLDEN_WRITE=1
// before the hook existed). ping_* RPCs run against PGlite with 173 and 174.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import twilio from 'twilio';
import { setFeatures, source as paragonSource } from './helpers/pingDb.js';
import { createS2Db, supabaseLike, seedPublisherB, callSid, B } from './helpers/pingS2Db.js';

for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY', 'CLERK_SECRET_KEY', 'AGENT_WS_SIGNING_SECRET']) process.env[name] = 'test';
const { supabase } = await import('../src/supabase.js');
const { config } = await import('../src/config.js');
const { twilioVoiceRouter } = await import('../src/routes/twilioVoice.js');
const { arrivalDeps } = await import('../src/ping/arrival.js');

const GOLDEN = new URL('./fixtures/ping-voice-golden.json', import.meta.url);
const WRITE = process.env.PING_VOICE_GOLDEN_WRITE === '1';
const FIXED_NOW = Date.parse('2026-11-17T15:00:00.000Z');
const CALLER = '+16097787669';

let pg; let pgClient;
before(async () => {
  pg = await createS2Db();
  pgClient = supabaseLike(pg);
  await seedPublisherB(pg);
  // The Paragon source owns the shared number; a generic-engine decision for
  // its legacy campaign would match this caller if the campaign were generic.
  await pg.query('UPDATE lead_sources SET twilio_number=$2 WHERE id=$1', [paragonSource, config.twilioPhoneNumber]);
  await pg.query(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,received_at,caller_phone,caller_state,
      vendor_call_id,available,reason,agent_id,engine)
    SELECT tenant_id,source_id,id,$2::timestamptz-interval '10 seconds',$3,'KS',NULL,true,'accepted_full','agent_a','generic'
    FROM ping_campaigns WHERE source_id=$1`, [paragonSource, new Date(FIXED_NOW).toISOString(), CALLER]);
});
after(async () => pg?.close());

const saved = { env: { ...process.env }, config: { ...config } };
function restore() {
  for (const key of ['PARAGON_ENABLED', 'PARAGON_STATE_ROUTING_ENABLED', 'PING_PLATFORM_ENABLED']) {
    if (saved.env[key] === undefined) delete process.env[key]; else process.env[key] = saved.env[key];
  }
  Object.assign(config, saved.config);
}

/** In-memory Supabase double for route tables; ping_* RPCs go to PGlite. */
function database({ agents = ['a', 'b'], paragon = null } = {}) {
  const tables = { contacts: [], inbound_calls: [], telephony_events: [], contact_activities: [], contact_lead_intel: [],
    telephony_call_attempts: [], telephony_routing_responses: [], telephony_evidence: [],
    lead_sources: [{ id: 'paragon-source', tenant_id: config.defaultTenantId, name: 'Paragon Media', type: 'publisher', active: true }] };
  const reservations = new Map();
  const state = { tables, rpcs: [], reservations };
  supabase.from = table => {
    let action = 'select'; let value; let single = false; const filters = [];
    const query = {
      select() { return query; }, insert(v) { action = 'insert'; value = v; return query; },
      update(v) { action = 'update'; value = v; return query; },
      eq(k, v) { filters.push(r => r[k] === v); return query; }, order() { return query; }, limit() { return query; },
      in(k, values) { filters.push(r => values.includes(r[k])); return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        const run = () => {
          tables[table] ||= [];
          if (action === 'insert') {
            if (table === 'telephony_routing_responses' && tables[table].some(r => r.request_key === value.request_key)) return { error: { code: '23505' } };
            const row = { id: `${table}-${tables[table].length + 1}`, duplicate_flag: false, ...value };
            tables[table].push(row); return { data: single ? row : [row] };
          }
          const rows = tables[table].filter(r => filters.every(f => f(r)));
          if (action === 'update') for (const r of rows) Object.assign(r, value);
          return { data: single ? rows[0] || null : rows };
        };
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return query;
  };
  supabase.rpc = async (name, args) => {
    state.rpcs.push(name);
    if (name.startsWith('ping_') || name === 'enqueue_ping_billing_event') return pgClient.rpc(name, args);
    if (name === 'enqueue_paragon_billing_event' || name === 'resolve_recent_paragon_ping_at') return { data: null, error: { code: 'PGRST202' } };
    if (name === 'resolve_recent_paragon_ping') return { data: [paragon?.ping || { matched: false }] };
    if (name === 'claim_paragon_call_at' || name === 'claim_paragon_call') {
      const agent = paragon?.agent;
      if (agent) reservations.set(agent, args.p_call_sid);
      return { data: agent ? [{ agent_id: agent, agent_name: agent, caller_state: 'KS', claim_path: 'reserved', vendor_call_id: 'v-1' }] : [] };
    }
    if (name === 'claim_call_agent' || name === 'claim_customer_call_agent') {
      const free = agents.filter(a => !args.p_exclude.includes(a) && !reservations.has(a));
      if (free[0]) reservations.set(free[0], args.p_call_sid);
      return { data: free[0] ? [{ agent_id: free[0], agent_name: free[0] }] : [] };
    }
    if (name === 'release_call_agent') {
      for (const [a, sid] of reservations) if (sid === args.p_call_sid && (!args.p_agent_id || a === args.p_agent_id)) reservations.delete(a);
      return { data: true };
    }
    if (name === 'record_telephony_evidence' || name === 'finish_inbound_call') return {};
    throw new Error(`Unexpected RPC ${name}`);
  };
  return state;
}

async function request(path, body, query = {}) {
  body = { AccountSid: config.twilioAccountSid, ...body };
  const originalUrl = `${path}${Object.keys(query).length ? '?' + new URLSearchParams(query) : ''}`;
  const signature = twilio.getExpectedTwilioSignature(config.twilioAuthToken, config.publicBaseUrl + originalUrl, body);
  const req = { path, originalUrl, body, query, header: () => signature };
  const res = { locals: {}, code: 200, status(code) { this.code = code; return this; },
    type() { return this; }, send(payload) { this.body = payload; return this; }, end() { return this; } };
  const route = twilioVoiceRouter.stack.find(layer => layer.route?.path === path).route;
  const dispatch = index => route.stack[index].handle(req, res, () => dispatch(index + 1));
  await dispatch(0);
  return res;
}

const PARAGON_PING = { matched: true, available: true, caller_state: 'KS', vendor_call_id: 'v-1', reason: 'accepted_full' };
const shared = () => ({ CallSid: 'PARENT', From: CALLER, To: config.twilioPhoneNumber });
const dialFailed = (inboundCallId, extra = {}) => [{ CallSid: 'PARENT', DialCallStatus: 'no-answer', ...extra },
  { inboundCallId, tried: 'a', attemptId: 'telephony_call_attempts-1', agentId: 'a' }];

// Each scenario returns the TwiML of its final request.
const SCENARIOS = {
  'voice: direct caller dials an agent': async () => (await request('/twilio/voice', { CallSid: 'PARENT', From: CALLER, To: '+16090000000' })).body,
  'voice: no agent goes to voicemail': async () => { database({ agents: [] });
    return (await request('/twilio/voice', { CallSid: 'PARENT', From: CALLER, To: '+16090000000' })).body; },
  'voice: matched Paragon call dials the claimed agent': async () => { database({ paragon: { ping: PARAGON_PING, agent: 'b' } });
    return (await request('/twilio/voice', shared())).body; },
  'voice: matched Paragon call without an agent fast rejects': async () => { database({ paragon: { ping: PARAGON_PING, agent: null } });
    return (await request('/twilio/voice', shared())).body; },
  'dial-result: unanswered direct call rolls to the next agent': async () => {
    await request('/twilio/voice', { CallSid: 'PARENT', From: CALLER, To: '+16090000000' });
    return (await request('/twilio/dial-result', ...dialFailed('inbound_calls-1'))).body;
  },
  'dial-result: unanswered Paragon call fast rejects': async () => { database({ paragon: { ping: PARAGON_PING, agent: 'a' } });
    await request('/twilio/voice', shared());
    return (await request('/twilio/dial-result', ...dialFailed('inbound_calls-1'))).body;
  },
  'dial-result: completed call hangs up': async () => {
    await request('/twilio/voice', { CallSid: 'PARENT', From: CALLER, To: '+16090000000' });
    return (await request('/twilio/dial-result', ...dialFailed('inbound_calls-1', { DialCallStatus: 'completed' }))).body;
  },
};

async function runScenarios(mode) {
  const outputs = {};
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    restore();
    process.env.PARAGON_ENABLED = 'true'; process.env.PARAGON_STATE_ROUTING_ENABLED = 'true';
    Object.assign(config, { paragonEnabled: true, paragonStateRoutingEnabled: true, stickyRoutingEnabled: false });
    process.env.PING_PLATFORM_ENABLED = mode === 'flag_off' ? 'false' : 'true';
    await setFeatures(pg, mode === 'flag_off' ? {} : { PING_PLATFORM_ENABLED: true });
    const state = database();
    mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
    try { outputs[name] = await scenario(state); } finally { mock.timers.reset(); restore(); }
  }
  return outputs;
}

test('generic hook golden: flag off returns the pre-S2 TwiML byte for byte', async () => {
  const outputs = await runScenarios('flag_off');
  for (const xml of Object.values(outputs)) assert.match(xml, /^<\?xml/);
  if (WRITE) writeFileSync(GOLDEN, JSON.stringify(outputs, null, 2) + '\n');
  assert.deepEqual(outputs, JSON.parse(readFileSync(GOLDEN, 'utf8')));
});

test('generic hook golden: flag on with only a legacy-mode Paragon campaign returns the pre-S2 TwiML', async () => {
  const [{ n }] = (await pg.query(`SELECT count(*)::int n FROM ping_resolve_arrival($1,NULL,'PARENT',$2,$3)
    WHERE matched`, [CALLER, config.twilioPhoneNumber, new Date(FIXED_NOW).toISOString()])).rows;
  assert.equal(n, 0, 'precondition: unmatched while flags are off in PGlite');
  await setFeatures(pg);
  await pg.exec('BEGIN');
  try {
    // Control: the same decision would match if the campaign were generic.
    await pg.query(`UPDATE ping_campaigns SET engine_mode='generic' WHERE source_id=$1`, [paragonSource]);
    const [control] = (await pg.query('SELECT * FROM ping_resolve_arrival($1,NULL,$2,$3,$4)',
      [CALLER, 'PARENT', config.twilioPhoneNumber, new Date(FIXED_NOW).toISOString()])).rows;
    assert.equal(control.matched, true);
  } finally { await pg.exec('ROLLBACK'); }
  const outputs = await runScenarios('flag_on_legacy');
  assert.deepEqual(outputs, JSON.parse(readFileSync(GOLDEN, 'utf8')));
});

// Generic path: Test Publisher B's number, real clock, Twilio arrival verified
// by a stand-in for the REST lookup.
const GENERIC_CALLER = '+15550006000';
async function genericScenario(t, { flag = true, busy = false } = {}) {
  restore();
  Object.assign(config, { paragonEnabled: true, paragonStateRoutingEnabled: true, stickyRoutingEnabled: false });
  process.env.PARAGON_ENABLED = 'true'; process.env.PARAGON_STATE_ROUTING_ENABLED = 'true';
  process.env.PING_PLATFORM_ENABLED = flag ? 'true' : 'false';
  await setFeatures(pg);
  const verify = arrivalDeps.verifyArrival;
  arrivalDeps.verifyArrival = async () => new Date().toISOString();
  await pg.exec('BEGIN');
  t.after(async () => { arrivalDeps.verifyArrival = verify; restore(); await pg.exec('ROLLBACK'); });
  const decision = (await pg.query(`SELECT ping_decide($1,'ma-central',$2,'generic') d`,
    [B.hash, { phone: GENERIC_CALLER, state: 'KS', routing_enabled: true }])).rows[0].d;
  assert.equal(decision.reason, 'accepted_full');
  if (busy) await pg.query(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id=ANY($1)`, [B.agents]);
  const state = database();
  const sid = callSid(7);
  const voice = await request('/twilio/voice', { CallSid: sid, From: GENERIC_CALLER, To: B.number });
  return { state, sid, voice, decision };
}

test('a generic match claims the reserved agent, books billing and dials it like today', async t => {
  const { state, sid, voice, decision } = await genericScenario(t);
  assert.match(voice.body, /<Client [^>]*><Identity>agent_x<\/Identity>/);
  assert.match(voice.body, /<Parameter name="paragon" value="false"\/>/);
  assert.match(voice.body, /<Dial [^>]*answerOnBridge="true"/);
  const [call] = state.tables.inbound_calls;
  assert.deepEqual([call.tenant_id, call.lead_source_id, call.status, call.routed_agent_id, call.source_kind, call.caller_state],
    [B.tenant, B.source, 'ringing', 'agent_x', 'publisher', 'KS']);
  assert.equal(call.contact_id, null, 'no cross-tenant contact link');
  assert.deepEqual([call.vendor_metadata.ping_generic_matched, call.vendor_metadata.ping_decision_id], [true, decision.decision_id]);
  const routed = state.tables.telephony_events.find(e => e.event === 'routing_agent_selected');
  assert.deepEqual([routed.tenant_id, routed.payload.routing_method, routed.payload.agent_id], [B.tenant, 'ping_reserved', 'agent_x']);
  assert.ok(!state.rpcs.some(name => /paragon|claim_call_agent|claim_customer_call_agent/.test(name)), state.rpcs.join());
  const [billing] = (await pg.query('SELECT * FROM ping_call_billing WHERE parent_call_sid=$1', [sid])).rows;
  assert.deepEqual([billing.decision_id, Number(billing.rate)], [decision.decision_id, 35]);
  assert.equal((await pg.query('SELECT count(*)::int n FROM ping_call_billing_events WHERE parent_call_sid=$1', [sid])).rows[0].n, 1);
  assert.equal((await pg.query(`SELECT active_call_sid FROM agent_availability WHERE agent_id='agent_x'`)).rows[0].active_call_sid, sid);
});

test('dial-result fast rejects a generic matched call on dial failure', async t => {
  const { state, sid } = await genericScenario(t);
  const before = state.rpcs.length;
  const result = await request('/twilio/dial-result', { CallSid: sid, DialCallStatus: 'no-answer' },
    { inboundCallId: 'inbound_calls-1', tried: 'agent_x', attemptId: 'telephony_call_attempts-1', agentId: 'agent_x' });
  assert.equal(result.body, '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>');
  assert.equal(state.tables.inbound_calls[0].status, 'rejected');
  assert.ok(state.tables.telephony_events.some(e => e.event === 'ping_fast_reject' && e.payload.reason === 'dial_failed'));
  assert.ok(!state.rpcs.slice(before).some(name => /claim_call_agent|claim_customer_call_agent/.test(name)), 'no reroute');
});

test('a generic match with no free eligible agent fast rejects with busy', async t => {
  const { state, voice } = await genericScenario(t, { busy: true });
  assert.equal(voice.body, '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>');
  const [call] = state.tables.inbound_calls;
  assert.deepEqual([call.status, call.routed_agent_id, call.vendor_metadata.ping_generic_matched], ['rejected', null, true]);
  const reject = state.tables.telephony_events.find(e => e.event === 'ping_fast_reject');
  assert.equal(reject.payload.reason, 'all_eligible_busy');
});

test('with PING_PLATFORM_ENABLED off the same generic decision falls through untouched', async t => {
  const { state, voice } = await genericScenario(t, { flag: false });
  assert.match(voice.body, /<Identity>a<\/Identity>/, 'existing round robin path');
  assert.ok(!state.rpcs.some(name => name.startsWith('ping_')), state.rpcs.join());
  assert.equal(state.tables.inbound_calls[0].vendor_metadata.ping_generic_matched, undefined);
});
