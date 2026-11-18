// Screener end to end on PGlite (migration 183 on top of 171 to 182): session
// rows, closed labels without caller words, the recording link, wrong state
// evidence, usage events priced from the tenant plan, and the approved script
// lifecycle with its audit. Synthetic identities and synthetic text only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { migration, setFeatures } from './helpers/pingDb.js';
import { MIGRATIONS_S7, S7_FEATURES, addScript } from './helpers/pingS7Db.js';
import { addCrosswalk } from './helpers/pingS6Db.js';
import { createHarness, scenario, voice, sessionFrom, step, SPEECH, SID, RECORDING, B } from './helpers/screenerHarness.js';

let h;
before(async () => { h = await createHarness(); });
after(async () => h?.pg.close());
const q = async (sql, params) => (await h.pg.query(sql, params)).rows;
const answer = (sessionId, name, attempt, body) => step(`/twilio/screener/${name}/${attempt}`, sessionId, body);

async function screened(t, options = {}) {
  const ids = await scenario(h, t, options);
  const sessionId = sessionFrom((await voice()).body);
  await step('/twilio/screener/start', sessionId);
  return { ...ids, sessionId };
}
async function passAll(sessionId, zip = '66210') {
  await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.yes });
  await answer(sessionId, 'zip', 1, { Digits: zip });
  await answer(sessionId, 'reason', 1, { SpeechResult: SPEECH.reason });
  return answer(sessionId, 'connect', 1, { SpeechResult: SPEECH.yes });
}
const ALLOWED_LABEL = /^(medicare|connect|reason|zip|zip_state|wrong_state|error|(medicare|zip|reason|connect)_(source|confidence|attempts|ms)|model_ms)$/;

test('183 carries the UNAPPLIED header, a transaction, the screener fence, no em dashes and no paragon_* changes', async () => {
  for (const name of MIGRATIONS_S7) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /—/, name);
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION|VIEW|TRIGGER)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /INSERT INTO (public\.)?screener_scripts/i, 'seeds nothing');
  }
  const sql = await migration('183_ping_screener.sql');
  assert.equal(sql.match(/deployment_feature_enabled\('PING_SCREENER_ENABLED'\)/g).length, 8, 'every flow and admin routine');
});

test('screener tables have RLS, no browser grants, and routines are service role only', async () => {
  for (const table of ['screener_scripts', 'screener_sessions', 'screener_script_audit']) {
    assert.equal((await q('SELECT relrowsecurity FROM pg_class WHERE relname=$1', [table]))[0].relrowsecurity, true, table);
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_table_privilege($1,$2,$3) ok', [role, table, 'SELECT']))[0].ok, false, `${role} ${table}`);
    }
    assert.equal((await q('SELECT has_table_privilege($1,$2,$3) ok', ['service_role', table, 'SELECT']))[0].ok, true, table);
  }
  for (const fn of ['screener_begin(text,uuid,uuid,text)', 'screener_state(uuid,text)', 'screener_finish(uuid,text,jsonb)',
    'screener_save_labels(uuid,jsonb)', 'screener_record_zip(uuid,text)', 'screener_set_recording(uuid,text)',
    'approve_screener_script(uuid,text)', 'retire_screener_script(uuid)']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', [role, fn, 'EXECUTE']))[0].ok, false, `${role} ${fn}`);
    }
    assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', ['service_role', fn, 'EXECUTE']))[0].ok, true, fn);
  }
  const [campaign] = await q(`SELECT traffic_type,screener_provider,screener_mode FROM ping_campaigns WHERE id=$1`, [h.campaigns['ma-central']]);
  assert.deepEqual(campaign, { traffic_type: 'inbound', screener_provider: 'scripted', screener_mode: 'off' }, 'defaults');
  assert.deepEqual(await q('SELECT count(*)::int n FROM screener_scripts'), [{ n: 0 }], 'seeds nothing');
});

test('a passed session records tenant, campaign, script, call, agent, timing, labels and the recording SID', async t => {
  const { sessionId, campaign, scriptId } = await screened(t);
  await passAll(sessionId);
  const [s] = await q('SELECT * FROM screener_sessions WHERE id=$1', [sessionId]);
  const [call] = await q('SELECT id FROM inbound_calls WHERE twilio_call_sid=$1', [SID]);
  assert.deepEqual([s.tenant_id, s.campaign_id, s.script_id, s.inbound_call_id, s.twilio_call_sid, s.agent_id, s.provider],
    [B.tenant, campaign, scriptId, call.id, SID, 'agent_x', 'scripted']);
  assert.equal(s.outcome, 'passed');
  assert.equal(s.recording_sid, RECORDING);
  assert.ok(s.ended_at >= s.started_at);
  assert.ok(Number.isInteger(s.seconds) && s.seconds >= 0);
  assert.deepEqual([s.labels.medicare, s.labels.zip, s.labels.reason, s.labels.connect], ['yes', '66210', 'plan_review', 'yes']);
  for (const key of Object.keys(s.labels)) assert.match(key, ALLOWED_LABEL);
  assert.ok(!JSON.stringify(s).includes('Synthetic'), 'no caller words');
});

test('labels reject free text at every entry point', async t => {
  const { sessionId } = await screened(t);
  for (const labels of [{ medicare: SPEECH.yes }, { reason: 'my plan review' }, { zip: 'six six two one oh' },
    { transcript: SPEECH.reason }, { medicare_ms: 1.5 }, { medicare_confidence: 2 }, { error: 'boom' }]) {
    await h.pg.exec('SAVEPOINT labels');
    await assert.rejects(h.pg.query('SELECT screener_save_labels($1,$2)', [sessionId, labels]), /Invalid screener labels/, JSON.stringify(labels));
    await h.pg.exec('ROLLBACK TO SAVEPOINT labels');
    await assert.rejects(h.pg.query('UPDATE screener_sessions SET labels=$2 WHERE id=$1', [sessionId, labels]), /check constraint/);
    await h.pg.exec('ROLLBACK TO SAVEPOINT labels');
  }
  assert.deepEqual(await q('SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND data_type=$2 ORDER BY 1',
    ['screener_sessions', 'text']), [{ column_name: 'agent_id' }, { column_name: 'outcome' }, { column_name: 'provider' },
    { column_name: 'recording_sid' }, { column_name: 'twilio_call_sid' }], 'no free text column');
});

test('a ZIP in another state marks wrong_state evidence on the call and auto flags the generic return; routing is unchanged', async t => {
  const { sessionId } = await screened(t);
  await addCrosswalk(h.pg, [['64101', '29095', 'MO', 1], ['66210', '20091', 'KS', 1]]);
  const pass = await passAll(sessionId, '64101');
  assert.match(pass.body, /<Identity>agent_x<\/Identity>/, 'still dials the claimed agent');
  const [call] = await q('SELECT wrong_state,confirmed_zip,confirmed_state,caller_state,routed_agent_id FROM inbound_calls WHERE twilio_call_sid=$1', [SID]);
  assert.deepEqual(call, { wrong_state: true, confirmed_zip: '64101', confirmed_state: 'MO', caller_state: 'KS', routed_agent_id: 'agent_x' });
  const [s] = await q('SELECT labels FROM screener_sessions WHERE id=$1', [sessionId]);
  assert.deepEqual([s.labels.zip, s.labels.zip_state, s.labels.wrong_state], ['64101', 'MO', true]);
  // The existing 174 trigger books the return once the billing row links the call.
  await q('UPDATE ping_call_billing b SET inbound_call_id=i.id FROM inbound_calls i WHERE i.twilio_call_sid=b.parent_call_sid AND b.parent_call_sid=$1', [SID]);
  assert.equal(await q('SELECT ping_flag_returns($1) n', [SID]).then(r => r[0].n), 1);
  assert.deepEqual(await q('SELECT reason FROM ping_returns WHERE billing_parent_call_sid=$1', [SID]), [{ reason: 'wrong_state' }]);
});

test('an in state ZIP leaves the call untouched', async t => {
  const { sessionId } = await screened(t);
  await addCrosswalk(h.pg, [['66210', '20091', 'KS', 1]]);
  await passAll(sessionId, '66210');
  const [call] = await q('SELECT wrong_state,confirmed_zip FROM inbound_calls WHERE twilio_call_sid=$1', [SID]);
  assert.deepEqual(call, { wrong_state: false, confirmed_zip: null });
});

test('usage: screener minutes per started minute for every session, a qualified result for passes, priced from the plan', async t => {
  const { sessionId, campaign } = await screened(t);
  await q(`INSERT INTO platform_price_plans(tenant_id,per_screener_minute,per_screened_qualified,effective_at)
    VALUES($1,0.25,4,now()-interval '1 day')`, [B.tenant]);
  await passAll(sessionId);
  const passed = await q(`SELECT kind,quantity::float,unit_price::float,tenant_id,source_id,campaign_id,ref_id
    FROM platform_usage_events ORDER BY kind`);
  assert.deepEqual(passed.map(e => [e.kind, e.quantity, e.unit_price, e.tenant_id, e.source_id, e.campaign_id, e.ref_id]), [
    ['screened_qualified', 1, 4, B.tenant, B.source, campaign, `screener:${sessionId}`],
    ['screener_minute', 1, 0.25, B.tenant, B.source, campaign, `screener:${sessionId}`]]);
  // Closing again changes nothing and appends nothing.
  const [again] = await q(`SELECT screener_finish($1,'failed_declined','{}') r`, [sessionId]);
  assert.deepEqual([again.r.outcome, again.r.first], ['passed', false]);
  assert.equal((await q('SELECT count(*)::int n FROM platform_usage_events'))[0].n, 2);
});

test('usage: a 125 second failed session is three screener minutes and no qualified result', async t => {
  const { sessionId } = await screened(t);
  await q(`INSERT INTO platform_price_plans(tenant_id,per_screener_minute,effective_at) VALUES($1,0.5,now()-interval '1 day')`, [B.tenant]);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  await q(`UPDATE screener_sessions SET started_at=clock_timestamp()-interval '125 seconds' WHERE id=$1`, [sessionId]);
  await q(`SELECT screener_finish($1,'failed_declined','{}')`, [sessionId]);
  const [s] = await q('SELECT outcome,seconds FROM screener_sessions WHERE id=$1', [sessionId]);
  assert.equal(s.outcome, 'failed_declined');
  assert.ok(s.seconds >= 125 && s.seconds < 180, String(s.seconds));
  assert.deepEqual(await q('SELECT kind,quantity::float,unit_price::float FROM platform_usage_events'),
    [{ kind: 'screener_minute', quantity: 3, unit_price: 0.5 }]);
});

test('usage: abandoned and failed open sessions are metered too; no plan prices zero', async t => {
  const { sessionId } = await screened(t);
  await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.timeout });
  assert.deepEqual(await q('SELECT kind,quantity::float,unit_price::float FROM platform_usage_events'),
    [{ kind: 'screener_minute', quantity: 1, unit_price: 0 }]);
});

test('at most one approved script per campaign, and approved text never changes', async t => {
  const { campaign, scriptId } = await screened(t);
  await h.pg.exec('SAVEPOINT one');
  const draft = await addScript(h.pg, { tenant: B.tenant, campaign, version: 2 });
  await assert.rejects(h.pg.query(`UPDATE screener_scripts SET status='approved',approved_by='x',approved_at=now() WHERE id=$1`, [draft]),
    /screener_scripts_one_approved/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT one');
  await assert.rejects(h.pg.query(`UPDATE screener_scripts SET pass_line='Synthetic changed line.' WHERE id=$1`, [scriptId]),
    /Approved screener script text is immutable/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT one');
  await assert.rejects(addScript(h.pg, { tenant: '0e000000-0000-4000-8000-0000000000a1', campaign, version: 3 }),
    /tenant mismatch/, 'a script belongs to its campaign tenant');
  await h.pg.exec('ROLLBACK TO SAVEPOINT one');
  await assert.rejects(addScript(h.pg, { tenant: B.tenant, campaign, version: 1 }), /duplicate key/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT one');
});

test('approve supersedes the prior approved script, retire retires, and every change is audited append only', async t => {
  const { campaign, scriptId } = await screened(t);
  const v2 = await addScript(h.pg, { tenant: B.tenant, campaign, version: 2, pass_line: 'Synthetic version two line.' });
  await q(`SELECT approve_screener_script($1,'owner@test')`, [v2]);
  assert.deepEqual(await q('SELECT version,status,approved_by FROM screener_scripts WHERE campaign_id=$1 ORDER BY version', [campaign]),
    [{ version: 1, status: 'retired', approved_by: 'owner@test' }, { version: 2, status: 'approved', approved_by: 'owner@test' }]);
  await q('SELECT retire_screener_script($1)', [v2]);
  assert.deepEqual(await q(`SELECT count(*)::int n FROM screener_scripts WHERE campaign_id=$1 AND status='approved'`, [campaign]), [{ n: 0 }]);
  const audit = await q(`SELECT script_id,version,action,actor FROM screener_script_audit WHERE campaign_id=$1`, [campaign]);
  const order = ['approved', 'superseded', 'retired'];
  audit.sort((x, y) => x.version - y.version || order.indexOf(x.action) - order.indexOf(y.action));
  assert.deepEqual(audit, [
    { script_id: scriptId, version: 1, action: 'approved', actor: 'owner@test' },
    { script_id: scriptId, version: 1, action: 'superseded', actor: 'owner@test' },
    { script_id: v2, version: 2, action: 'approved', actor: 'owner@test' },
    { script_id: v2, version: 2, action: 'retired', actor: 'service_role' }]);
  await h.pg.exec('SAVEPOINT audit');
  await assert.rejects(h.pg.query(`UPDATE screener_script_audit SET actor='someone'`), /append only/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT audit');
  await assert.rejects(h.pg.query('DELETE FROM screener_script_audit'), /append only/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT audit');
  await assert.rejects(h.pg.query(`SELECT approve_screener_script($1,'owner@test')`, [scriptId]), /Only a draft/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT audit');
  await assert.rejects(h.pg.query(`SELECT approve_screener_script($1,'  ')`, [v2]), /Approver required/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT audit');
  // With no approved script the next call is not screened.
  const begun = await q(`SELECT screener_begin($1,i.id,$2,'agent_x') r FROM inbound_calls i WHERE i.twilio_call_sid=$1`, [SID, campaign]);
  assert.deepEqual(begun[0].r, { status: 'skipped', reason: 'no_approved_script' });
});

test('with PING_SCREENER_ENABLED off every routine is fenced', async t => {
  const { campaign, scriptId, sessionId } = await screened(t);
  await setFeatures(h.pg, { ...S7_FEATURES, PING_SCREENER_ENABLED: false });
  const [call] = await q('SELECT id FROM inbound_calls WHERE twilio_call_sid=$1', [SID]);
  assert.deepEqual((await q(`SELECT screener_begin($1,$2,$3,'agent_x') r`, [SID, call.id, campaign]))[0].r, { status: 'disabled' });
  assert.equal((await q('SELECT screener_state($1,$2) r', [sessionId, SID]))[0].r, null);
  assert.equal((await q(`SELECT screener_finish($1,'passed','{}') r`, [sessionId]))[0].r, null);
  assert.equal((await q(`SELECT screener_save_labels($1,'{"medicare":"yes"}') r`, [sessionId]))[0].r, false);
  assert.equal((await q(`SELECT screener_record_zip($1,'66210') r`, [sessionId]))[0].r, null);
  assert.equal((await q(`SELECT screener_set_recording($1,$2) r`, [sessionId, RECORDING]))[0].r, false);
  await h.pg.exec('SAVEPOINT fence');
  await assert.rejects(h.pg.query(`SELECT approve_screener_script($1,'owner@test')`, [scriptId]), /disabled/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT fence');
  await assert.rejects(h.pg.query('SELECT retire_screener_script($1)', [scriptId]), /disabled/);
  await h.pg.exec('ROLLBACK TO SAVEPOINT fence');
  assert.deepEqual(await q('SELECT count(*)::int n FROM platform_usage_events'), [{ n: 0 }]);
});
