// Route harness for the S7 screener suites. PGlite with migrations through 183
// holds the ping, inbound call, screener, usage and agent tables; an in-memory
// double holds the route-only tables (events, replay keys, call attempts,
// contacts). Twilio REST and OpenAI are stubbed: no network. Every scenario
// runs in a rolled back transaction with a fixed clock and deterministic
// inbound call ids, so TwiML is byte comparable across runs. Synthetic
// identities and synthetic caller words only.
import twilio from 'twilio';
import { setFeatures } from './pingDb.js';
import { seedPublisherB, supabaseLike, callSid, B } from './pingS2Db.js';
import { createS7Db, addScript, S7_FEATURES } from './pingS7Db.js';

for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY', 'CLERK_SECRET_KEY', 'AGENT_WS_SIGNING_SECRET']) process.env[name] = 'test';
const { supabase } = await import('../../src/supabase.js');
const { config } = await import('../../src/config.js');
const { twilioVoiceRouter } = await import('../../src/routes/twilioVoice.js');
const { arrivalDeps } = await import('../../src/ping/arrival.js');
const { screenerDeps } = await import('../../src/ping/screener.js');
const { screenerProvider } = await import('../../src/ping/screenerProviders.js');
// SCREENER_GOLDEN_WRITE captures the gating golden from the S6 /twilio/voice,
// where routes/screener.js cannot load; normal runs import it directly.
const { screenerRouter } = process.env.SCREENER_GOLDEN_WRITE === '1'
  ? await import('../../src/routes/screener.js').catch(() => ({ screenerRouter: null }))
  : await import('../../src/routes/screener.js');

export { config, B, callSid };
export const FIXED_NOW = Date.parse('2026-11-17T15:00:00.000Z');
export const CALLER = '+15550007000';
export const SID = callSid(70);
export const ACCOUNT = `AC${'a'.repeat(32)}`;
export const RECORDING = `RE${'1'.repeat(32)}`;
const MEMORY = new Set(['contacts', 'telephony_events', 'evidence_access_log', 'contact_activities', 'contact_lead_intel',
  'telephony_call_attempts', 'telephony_routing_responses', 'telephony_evidence']);

// Synthetic caller words. The hygiene test asserts none of these strings is
// ever stored or logged. Each maps to the stubbed model answer.
export const SPEECH = Object.freeze({
  yes: 'Synthetic yes words zebra seven',
  no: 'Synthetic no words walrus',
  unclear: 'Synthetic mumble words heron',
  reason: 'Synthetic words about my plan review orchid',
  zipSpoken: 'six six two one oh',
  zipModel: 'Synthetic zip words sixty six two ten marigold',
  timeout: 'Synthetic words that stall the model',
  broken: 'Synthetic words that break the model',
});
const MODEL_ANSWERS = new Map([
  [SPEECH.yes, { label: 'yes', confidence: 0.94 }], [SPEECH.no, { label: 'no', confidence: 0.91 }],
  [SPEECH.unclear, { label: 'unclear', confidence: 0.4 }], [SPEECH.reason, { label: 'plan_review', confidence: 0.88 }],
  [SPEECH.zipModel, { zip: '66210', confidence: 0.8 }],
]);

/** OpenAI chat completions stand-in: answers by transcript, records each call. */
export function stubFetch(calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const transcript = body.messages.at(-1).content;
    calls.push({ url, model: body.model, schema: body.response_format.json_schema, transcript });
    if (transcript === SPEECH.timeout) {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (transcript === SPEECH.broken) return { ok: false, status: 500, json: async () => ({}) };
    const answer = MODEL_ANSWERS.get(transcript) || { label: 'unclear', confidence: 0.1 };
    const shaped = body.response_format.json_schema.name === 'screener_zip'
      ? { zip: answer.zip ?? '', confidence: answer.confidence } : answer;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(shaped) } }] }) };
  };
}

/** Twilio REST stand-in for call recordings and call fetches. */
export function stubTwilio(log, { failRecording = false, callStatus = 'in-progress' } = {}) {
  return {
    calls(sid) {
      const recordings = Object.assign(rsid => ({ update: async params => { log.push(['stop', sid, rsid, params]); return {}; } }), {
        create: async params => {
          log.push(['start', sid, params]);
          if (failRecording) throw Object.assign(new Error('provider'), { code: 21220 });
          return { sid: RECORDING, callSid: sid };
        },
      });
      return { recordings, fetch: async () => ({ sid, accountSid: config.twilioAccountSid, status: callStatus }) };
    },
  };
}

export async function createHarness() {
  const pg = await createS7Db();
  const campaigns = await seedPublisherB(pg);
  await pg.exec(`ALTER TABLE inbound_calls ADD COLUMN IF NOT EXISTS contact_id uuid,
      ADD COLUMN IF NOT EXISTS vendor_metadata jsonb, ADD COLUMN IF NOT EXISTS caller_classification text;
    CREATE SEQUENCE screener_test_inbound_ids;
    ALTER TABLE inbound_calls ALTER COLUMN id SET DEFAULT
      ('0e000000-0000-4000-8000-'||lpad(nextval('screener_test_inbound_ids')::text,12,'0'))::uuid;
    CREATE TABLE IF NOT EXISTS recording_ingestion_calls(callback jsonb);`);
  // Stand-in for 064 enqueue_recording: keeps the callback so tests can see
  // the screener recording reach the existing ingestion entry point.
  await pg.exec(`CREATE FUNCTION enqueue_recording(p_callback jsonb,p_attempt_id uuid DEFAULT NULL) RETURNS uuid
    LANGUAGE plpgsql AS $$ BEGIN INSERT INTO recording_ingestion_calls VALUES(p_callback); RETURN gen_random_uuid(); END $$;`);
  const pgClient = supabaseLike(pg);
  const h = { pg, campaigns, pgClient, memory: null, rpcs: [], twilioLog: [], modelCalls: [], logs: [] };

  supabase.from = table => (MEMORY.has(table) ? memoryQuery(h, table) : pgClient.from(table));
  supabase.rpc = async (name, args = {}) => {
    h.rpcs.push(name);
    if (name === 'release_call_agent') {
      await pg.query(`UPDATE agent_availability SET active_call_sid=NULL,status=coalesce(resume_status,'available'),
        available=true WHERE active_call_sid=$1 AND ($2::text IS NULL OR agent_id=$2)`, [args.p_call_sid, args.p_agent_id]);
      return { data: true, error: null };
    }
    if (name === 'record_telephony_evidence' || name === 'finish_inbound_call') return { data: null, error: null };
    if (name === 'claim_call_agent' || name === 'claim_customer_call_agent') return { data: [], error: null };
    // Audit and telemetry routines outside the ping schema are not under test.
    const { rows: [known] } = await pg.query(`SELECT to_regproc('public.'||$1) IS NOT NULL AS ok`, [name]);
    if (!known.ok) return { data: null, error: null };
    return pgClient.rpc(name, args);
  };
  arrivalDeps.verifyArrival = async () => new Date(FIXED_NOW).toISOString();
  return h;
}

function memoryQuery(h, table) {
  const tables = h.memory;
  let action = 'select'; let value; let single = false; const filters = [];
  const query = {
    select() { return query; }, insert(v) { action = 'insert'; value = v; return query; },
    update(v) { action = 'update'; value = v; return query; },
    eq(k, v) { filters.push(r => r[k] === v); return query; }, order() { return query; }, limit() { return query; },
    in(k, values) { filters.push(r => values.includes(r[k])); return query; },
    single() { single = true; return query; }, maybeSingle() { single = true; return query; },
    abortSignal() { return query; },
    then(resolve, reject) {
      const run = () => {
        tables[table] ||= [];
        if (action === 'insert') {
          if (table === 'telephony_routing_responses' && tables[table].some(r => r.request_key === value.request_key)) {
            return { error: { code: '23505' } };
          }
          const row = { id: `${table}-${tables[table].length + 1}`, ...value };
          tables[table].push(row); return { data: single ? row : [row], error: null };
        }
        const rows = tables[table].filter(r => filters.every(f => f(r)));
        if (action === 'update') for (const r of rows) Object.assign(r, value);
        return { data: single ? rows[0] || null : rows, error: null };
      };
      return Promise.resolve().then(run).then(resolve, reject);
    },
  };
  return query;
}

const ENV_KEYS = ['PING_PLATFORM_ENABLED', 'PING_SCREENER_ENABLED', 'SCREENER_OPENAI_MODEL', 'OPENAI_API_KEY',
  'PARAGON_ENABLED', 'PARAGON_STATE_ROUTING_ENABLED'];

/**
 * Starts a scenario inside a transaction: an accepted generic decision for
 * the caller on Publisher B's ma-central campaign at FIXED_NOW, reserving
 * agent_x. Options set the screener switches, campaign and script.
 */
export async function scenario(h, t, { screener = true, model = 'gpt-test-small', key = 'sk-test-synthetic',
  mode = 'always', traffic = 'inbound', approved = true, provider = 'scripted', disclaimer = null,
  failRecording = false, callStatus = 'in-progress', timeoutMs = 50, mockDate = true, accountSid = null } = {}) {
  const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  const savedConfig = { ...config };
  const savedDeps = { ...screenerDeps };
  Object.assign(config, { paragonEnabled: true, paragonStateRoutingEnabled: true, stickyRoutingEnabled: false });
  if (accountSid) config.twilioAccountSid = accountSid;
  process.env.PARAGON_ENABLED = 'true'; process.env.PARAGON_STATE_ROUTING_ENABLED = 'true';
  process.env.PING_PLATFORM_ENABLED = 'true';
  process.env.PING_SCREENER_ENABLED = screener ? 'true' : 'false';
  if (model) process.env.SCREENER_OPENAI_MODEL = model; else delete process.env.SCREENER_OPENAI_MODEL;
  if (key) process.env.OPENAI_API_KEY = key; else delete process.env.OPENAI_API_KEY;
  h.memory = {}; h.rpcs = []; h.twilioLog = []; h.modelCalls = [];
  screenerDeps.provider = kind => screenerProvider(kind, { env: process.env, fetchImpl: stubFetch(h.modelCalls), timeoutMs });
  screenerDeps.twilio = () => stubTwilio(h.twilioLog, { failRecording, callStatus });
  screenerDeps.now = () => FIXED_NOW;
  const { pg } = h;
  await pg.exec('BEGIN');
  t.after(async () => {
    await pg.exec('ROLLBACK');
    for (const [k, v] of Object.entries(savedEnv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    Object.assign(config, savedConfig);
    Object.assign(screenerDeps, savedDeps);
    if (mockDate) t.mock.timers.reset();
  });
  await setFeatures(pg, S7_FEATURES);
  await pg.query(`SELECT setval('screener_test_inbound_ids',1,false)`);
  const campaign = h.campaigns['ma-central'];
  await pg.query('UPDATE ping_campaigns SET screener_mode=$2,traffic_type=$3,screener_provider=$4 WHERE id=$1',
    [campaign, mode, traffic, provider]);
  const scriptId = await addScript(pg, { tenant: B.tenant, campaign, disclaimer });
  if (approved) await pg.query(`SELECT approve_screener_script($1,'owner@test')`, [scriptId]);
  if (!screener) await setFeatures(pg, { ...S7_FEATURES, PING_SCREENER_ENABLED: false });
  const at = new Date(FIXED_NOW).toISOString();
  const { rows: [decision] } = await pg.query(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,received_at,
      caller_phone,caller_state,available,reason,agent_id,engine)
    VALUES($1,$2,$3,$4::timestamptz-interval '10 seconds',$5,'KS',true,'accepted_full','agent_x','generic') RETURNING id`,
  [B.tenant, B.source, campaign, at, CALLER]);
  await pg.query(`INSERT INTO ping_reservations(tenant_id,campaign_id,reservation_key,caller_state,agent_id,expires_at)
    VALUES($1,$2,$3,'KS','agent_x',$4::timestamptz+interval '30 seconds')`, [B.tenant, campaign, `phone:${CALLER}`, at]);
  if (mockDate) t.mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
  return { campaign, scriptId, decisionId: decision.id };
}

/** Signs and dispatches one webhook through the router that owns the path. */
export async function request(path, body, query = {}) {
  body = { AccountSid: config.twilioAccountSid, ...body };
  const originalUrl = `${path}${Object.keys(query).length ? '?' + new URLSearchParams(query) : ''}`;
  const signature = twilio.getExpectedTwilioSignature(config.twilioAuthToken, config.publicBaseUrl + originalUrl, body);
  const req = { path, originalUrl, body, query, header: () => signature };
  const res = { locals: {}, code: 200, status(code) { this.code = code; return this; },
    type() { return this; }, send(payload) { this.body = payload; return this; }, end() { return this; } };
  const routers = [twilioVoiceRouter, screenerRouter].filter(Boolean);
  const layer = routers.flatMap(router => router.stack).find(l => l.route?.path === path);
  if (!layer) throw new Error(`No route ${path}`);
  const dispatch = index => layer.route.stack[index].handle(req, res, () => dispatch(index + 1));
  await dispatch(0);
  return res;
}

export const voice = () => request('/twilio/voice', { CallSid: SID, From: CALLER, To: B.number });
export const sessionFrom = xml => xml.match(/sessionId=([0-9a-f-]{36})/)?.[1] || null;
export const step = (path, sessionId, body = {}) => request(path, { CallSid: SID, ...body }, { sessionId });
export const xmlText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
