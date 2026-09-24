import test from 'node:test';
import assert from 'node:assert/strict';
import twilio from 'twilio';
for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY', 'CLERK_SECRET_KEY', 'AGENT_WS_SIGNING_SECRET']) process.env[name] = 'test';
const { supabase } = await import('../src/supabase.js');
const { config } = await import('../src/config.js');
const { twilioVoiceRouter } = await import('../src/routes/twilioVoice.js');
const { twilioStatusRouter } = await import('../src/routes/twilioStatus.js');
const { voiceOutboundRouter } = await import('../src/routes/voiceOutbound.js');

function database(agents = ['a', 'b']) {
  const tables = { contacts: [], inbound_calls: [], telephony_events: [], contact_activities: [],
    contact_lead_intel: [], telephony_call_attempts: [], telephony_routing_responses: [] };
  const claims = []; const evidence = []; const releases = []; const finishes = [];
  const reservations = new Map();
  const state = { tables, claims, evidence, releases, finishes, failEvidence: false, failAttempts: false };
  supabase.from = table => {
    let action = 'select'; let value; let single = false; const filters = [];
    const q = {
      select() { return this; }, insert(v) { action = 'insert'; value = v; return this; },
      update(v) { action = 'update'; value = v; return this; },
      eq(k, v) { filters.push(r => r[k] === v); return this; }, order() { return this; }, limit() { return this; },
      single() { single = true; return this; }, maybeSingle() { single = true; return this; },
      then(resolve, reject) {
        const run = () => {
          if (table === 'telephony_call_attempts' && state.failAttempts) return { error: { message: 'write failed' } };
          if (action === 'insert') {
            if (table === 'telephony_routing_responses' && tables[table].some(r => r.request_key === value.request_key)) {
              return { error: { code: '23505' } };
            }
            const r = { id: `${table}-${tables[table].length + 1}`, ...value };
            tables[table].push(r); return { data: single ? r : [r] };
          }
          const rows = tables[table].filter(r => filters.every(f => f(r)));
          if (action === 'update') for (const r of rows) Object.assign(r, value);
          return { data: single ? rows[0] || null : rows };
        };
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return q;
  };
  supabase.rpc = async (name, args) => {
    if (name === 'claim_call_agent') {
      claims.push(args);
      const agent = agents.find(a => (!args.p_agent_id || a === args.p_agent_id) &&
        !args.p_exclude.includes(a) && !reservations.has(a));
      if (agent) reservations.set(agent, args.p_call_sid);
      return { data: agent ? [{ agent_id: agent, agent_name: agent }] : [] };
    }
    if (name === 'release_call_agent') {
      releases.push(args);
      for (const [a, sid] of reservations) if (sid === args.p_call_sid && (!args.p_agent_id || a === args.p_agent_id)) reservations.delete(a);
      return { data: true };
    }
    if (name === 'record_telephony_evidence') {
      if (state.failEvidence) return { error: { message: 'temporary failure' } };
      evidence.push(args); return {};
    }
    if (name === 'finish_inbound_call') { finishes.push(args); return {}; }
    throw new Error(`Unexpected RPC ${name}`);
  };
  return state;
}

async function request(router, path, body, query = {}) {
  const originalUrl = `${path}${Object.keys(query).length ? '?' + new URLSearchParams(query) : ''}`;
  const signature = twilio.getExpectedTwilioSignature(config.twilioAuthToken, config.publicBaseUrl + originalUrl, body);
  const req = { path, originalUrl, body, query, header: () => signature };
  const res = { locals: {}, code: 200, status(code) { this.code = code; return this; },
    type() { return this; }, send(body) { this.body = body; return this; }, end() { return this; } };
  const route = router.stack.find(layer => layer.route?.path === path).route;
  const dispatch = index => route.stack[index].handle(req, res, () => dispatch(index + 1));
  await dispatch(0);
  return res;
}
const incoming = { CallSid: 'PARENT', From: '+16097787669', To: '+16090000000' };
const answer = { ParentCallSid: 'PARENT', CallSid: 'CHILD', CallStatus: 'in-progress', Timestamp: 'Wed, 23 Sep 2026 10:00:00 +0000' };

test('inbound TwiML persists attempt and requests answer/completion; replay never reassigns', async () => {
  const db = database();
  const first = await request(twilioVoiceRouter, '/twilio/voice', incoming);
  assert.match(first.body, /statusCallbackEvent="answered completed"/);
  assert.match(first.body, /answerOnBridge="true"/);
  assert.match(first.body, /timeout="20"/);
  assert.match(first.body, /attemptId=telephony_call_attempts-1/);
  assert.equal(db.tables.telephony_call_attempts[0].agent_id, 'a');
  assert.equal(db.tables.telephony_call_attempts[0].contact_id, db.tables.contacts[0].id);
  const replay = await request(twilioVoiceRouter, '/twilio/voice', incoming);
  assert.equal(replay.body, first.body); assert.equal(db.claims.length, 1);
  assert.equal(db.tables.telephony_call_attempts.length, 1);
});

test('no-answer still excludes first agent and reroutes; exhausted capacity still records voicemail TwiML', async () => {
  const db = database(); await request(twilioVoiceRouter, '/twilio/voice', incoming);
  const query = { inboundCallId: db.tables.inbound_calls[0].id, tried: 'a', agentId: 'a', attemptId: db.tables.telephony_call_attempts[0].id };
  const result = await request(twilioVoiceRouter, '/twilio/dial-result', {
    CallSid: 'PARENT', DialCallSid: 'CHILD', DialCallStatus: 'no-answer', DialCallDuration: '0',
  }, query);
  assert.match(result.body, /<Identity>b<\/Identity>/);
  assert.deepEqual(db.claims[1].p_exclude, ['a']);
  assert.equal(db.tables.telephony_call_attempts.length, 2);
  const overflow = await request(twilioVoiceRouter, '/twilio/dial-result', {
    CallSid: 'PARENT', DialCallSid: 'CHILD2', DialCallStatus: 'busy',
  }, { ...query, tried: 'a,b', agentId: 'b', attemptId: db.tables.telephony_call_attempts[1].id });
  assert.match(overflow.body, /<Record /);
  assert.equal(db.tables.inbound_calls[0].status, 'voicemail');
  const none = database([]);
  assert.match((await request(twilioVoiceRouter, '/twilio/voice', incoming)).body, /<Record /);
  assert.equal(none.tables.telephony_call_attempts.length, 0);
});

test('canceled action hangs up without another claim and finalizes as canceled', async () => {
  const db = database(); await request(twilioVoiceRouter, '/twilio/voice', incoming);
  const result = await request(twilioVoiceRouter, '/twilio/dial-result', {
    CallSid: 'PARENT', DialCallSid: 'CHILD', DialCallStatus: 'canceled',
  }, { tried: 'a', agentId: 'a', attemptId: db.tables.telephony_call_attempts[0].id, inboundCallId: db.tables.inbound_calls[0].id });
  assert.match(result.body, /<Hangup\/>/); assert.equal(db.claims.length, 1);
  assert.equal(db.finishes[0].p_status, 'canceled');
});

test('outbound matches normalized phone, ignores supplied ContactId and persists before dialing', async () => {
  const db = database();
  const res = await request(voiceOutboundRouter, '/api/voice/outbound', {
    CallSid: 'OUT', From: 'client:a', PhoneNumber: '(609) 778-7669', ContactId: 'wrong-contact',
  });
  assert.equal(db.tables.contacts[0].phone, '+16097787669');
  const a = db.tables.telephony_call_attempts[0];
  assert.equal(a.parent_call_sid, 'OUT'); assert.equal(a.agent_id, 'a'); assert.equal(a.direction, 'outbound');
  assert.equal(a.contact_id, db.tables.contacts[0].id); assert.equal(a.to_number, '+16097787669');
  assert.equal(a.min_connected_seconds, 30);
  assert.match(res.body, /statusCallbackEvent="answered completed"/);
  assert.match(res.body, />\+16097787669<\/Number>/);
  assert.equal(db.claims[0].p_agent_id, 'a');
});

test('child answer records evidence without releasing; completion records before call-owned release', async () => {
  const db = database();
  const query = { attemptId: 'attempt', agentId: 'a' };
  assert.equal((await request(twilioStatusRouter, '/twilio/agent-status', answer, query)).code, 204);
  assert.equal(db.evidence[0].p_answered_at, '2026-09-23T10:00:00.000Z');
  assert.equal(db.releases.length, 0);
  await request(twilioStatusRouter, '/twilio/agent-status', { ...answer, CallStatus: 'completed', CallDuration: '45', Timestamp: 'Wed, 23 Sep 2026 10:00:45 +0000' }, query);
  assert.equal(db.evidence.length, 2);
  assert.deepEqual(db.releases[0], { p_call_sid: 'PARENT', p_agent_id: 'a' });
});

test('attribution failure is retryable before replay acquisition; retry does not re-route', async () => {
  const db = database();
  const body = { CallSid: 'PARENT', DialCallSid: 'CHILD', DialCallStatus: 'completed', DialCallDuration: '45', Timestamp: 'Wed, 23 Sep 2026 10:00:45 +0000' };
  const query = { attemptId: 'attempt', agentId: 'a', tried: 'a' };
  db.failEvidence = true;
  const failed = await request(twilioVoiceRouter, '/twilio/dial-result', body, query);
  assert.equal(failed.code, 503); assert.equal(db.tables.telephony_routing_responses.length, 0);
  db.failEvidence = false;
  const first = await request(twilioVoiceRouter, '/twilio/dial-result', body, query);
  const replay = await request(twilioVoiceRouter, '/twilio/dial-result', body, query);
  assert.equal(replay.body, first.body); assert.equal(db.finishes.length, 1);
  assert.equal(db.evidence.length, 2); assert.equal(db.claims.length, 0);
});

test('outbound persistence failure releases reservation and does not dial untracked call', async () => {
  const db = database(); db.failAttempts = true;
  const res = await request(voiceOutboundRouter, '/api/voice/outbound', {
    CallSid: 'OUT', From: 'client:a', PhoneNumber: '6097787669',
  });
  assert.match(res.body, /<Hangup\/>/); assert.doesNotMatch(res.body, /<Dial/);
  assert.equal(db.releases[0].p_call_sid, 'OUT');
});
