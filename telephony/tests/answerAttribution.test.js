import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY', 'CLERK_SECRET_KEY', 'AGENT_WS_SIGNING_SECRET']) process.env[name] = 'test';
const { buildEvidence } = await import('../src/answerAttribution.js');
const tenant = '00000000-0000-4000-8000-000000000001';
const contact = '00000000-0000-4000-8000-000000000002';
const t0 = '2026-09-23T10:00:00.000Z';
const t1 = '2026-09-23T10:01:00.000Z';
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE contacts(id uuid PRIMARY KEY, tenant_id uuid);
    CREATE TABLE inbound_calls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
      contact_id uuid, twilio_call_sid text UNIQUE, routed_agent_id text,
      status text CONSTRAINT inbound_calls_status_check CHECK(status IN ('ringing','accepted','voicemail','completed')),
      answered_at timestamptz, ended_at timestamptz, duration_seconds integer);
    INSERT INTO tenants VALUES ('${tenant}');
    INSERT INTO contacts VALUES ('${contact}', '${tenant}');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/045_telephony_answer_attribution.sql', import.meta.url), 'utf8'));
});
after(async () => db?.close());
async function reset() {
  await db.exec(`TRUNCATE telephony_call_attempts, inbound_calls;
    UPDATE contacts SET last_connected_agent_id=NULL,last_connected_at=NULL,last_connected_direction=NULL`);
}
async function attempt(sid = 'CAparent', agent = 'agent_a', direction = 'inbound', threshold = 30) {
  let callId = null;
  if (direction === 'inbound') {
    callId = (await db.query(`INSERT INTO inbound_calls(tenant_id,contact_id,twilio_call_sid,routed_agent_id,status)
      VALUES($1,$2,$3,$4,'ringing') ON CONFLICT(twilio_call_sid) DO UPDATE SET routed_agent_id=$4 RETURNING id`,
    [tenant, contact, sid, agent])).rows[0].id;
  }
  return (await db.query(`INSERT INTO telephony_call_attempts(tenant_id,parent_call_sid,inbound_call_id,contact_id,agent_id,direction,min_connected_seconds)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [tenant, sid, callId, contact, agent, direction, threshold])).rows[0].id;
}
async function evidence(id, { sid = 'CAparent', agent = 'agent_a', child = `child-${id}`, source = 'child',
  status = 'in-progress', answer = t0, end = null, duration = null } = {}) {
  return db.query('SELECT record_telephony_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, sid, agent, child, source, status, answer, end, duration]);
}
const row = async () => (await db.query('SELECT * FROM inbound_calls LIMIT 1')).rows[0];
const pointer = async () => (await db.query('SELECT last_connected_agent_id AS agent,last_connected_at AS at,last_connected_direction AS direction FROM contacts WHERE id=$1', [contact])).rows[0];
const finish = (status = 'completed') => db.query('SELECT finish_inbound_call($1,$2,$3,$4)', ['CAparent', status, t1, 60]);

test('inbound agent answer records accepted, agent and contact; hangup records completed', async () => {
  await reset(); const id = await attempt(); await evidence(id);
  assert.equal((await row()).status, 'accepted');
  assert.equal((await row()).answered_agent_id, 'agent_a');
  assert.equal(new Date((await row()).answered_at).toISOString(), t0);
  assert.equal((await pointer()).direction, 'inbound');
  await finish(); assert.equal((await row()).status, 'completed');
});

test('canceled, no-answer, busy, failed and voicemail never create an answer', async () => {
  for (const status of ['canceled', 'no-answer', 'busy', 'failed', 'voicemail']) {
    await reset(); const id = await attempt();
    if (status === 'voicemail') await db.exec("UPDATE inbound_calls SET status='voicemail'");
    else await evidence(id, { status, source: 'dial', duration: 90, end: t1 });
    await finish(status === 'voicemail' ? 'completed' : status);
    assert.equal((await row()).status, status);
    assert.equal((await row()).answered_at, null);
    assert.equal((await pointer()).agent, null);
  }
});

test('completed Dial needs positive duration; answered Dial status alone is not evidence', async () => {
  for (const [status, duration] of [['completed', null], ['completed', 0], ['answered', 60]]) {
    await reset(); const id = await attempt();
    await evidence(id, { source: 'dial', status, duration, end: t1 });
    await finish(); assert.equal((await row()).status, 'no-answer');
    assert.equal((await pointer()).agent, null);
  }
  await reset(); const id = await attempt();
  await evidence(id, { source: 'dial', status: 'completed', duration: 60, end: t1 });
  assert.equal((await row()).status, 'completed');
  assert.equal((await pointer()).agent, 'agent_a');
});

test('inbound completed child alone is not the secondary Dial evidence', async () => {
  await reset(); const id = await attempt();
  await evidence(id, { status: 'completed', duration: 60, end: t1 });
  assert.equal((await pointer()).agent, null);
  await evidence(id); // delayed primary answer after child hangup
  assert.equal((await row()).status, 'completed');
  assert.equal((await pointer()).agent, 'agent_a');
});

test('parent completion before child answer is repaired without reopening the call', async () => {
  await reset(); const id = await attempt(); await finish();
  assert.equal((await row()).status, 'no-answer');
  await evidence(id);
  assert.equal((await row()).status, 'completed');
  assert.equal((await row()).answered_agent_id, 'agent_a');
});

test('duplicate answer and completion callbacks do not change the pointer timestamp', async () => {
  await reset(); const id = await attempt(); await evidence(id);
  await evidence(id, { answer: t1 }); // even a conflicting retry cannot move this call forward
  await evidence(id, { source: 'dial', status: 'completed', duration: 60, end: t1 });
  await evidence(id, { source: 'dial', status: 'completed', duration: 60, end: t1 });
  assert.equal(new Date((await pointer()).at).toISOString(), t0);
  assert.equal((await row()).status, 'completed');
});

test('older call arriving late and equal timestamps never replace a newer pointer', async () => {
  await reset(); const old = await attempt('OLD'); const recent = await attempt('NEW', 'agent_b');
  await evidence(recent, { sid: 'NEW', agent: 'agent_b', answer: t1 });
  await evidence(old, { sid: 'OLD', answer: t0 });
  assert.equal((await pointer()).agent, 'agent_b');
  const equal = await attempt('EQUAL', 'agent_c');
  await evidence(equal, { sid: 'EQUAL', agent: 'agent_c', answer: t1 });
  assert.equal((await pointer()).agent, 'agent_b');
});

test('callback attempt identity wins over mutable routing identity and mismatches are rejected', async () => {
  await reset(); const id = await attempt();
  await db.exec("UPDATE inbound_calls SET routed_agent_id='other_agent'");
  await assert.rejects(evidence(id, { sid: 'WRONG' }), /identity mismatch/);
  await assert.rejects(evidence(id, { agent: 'WRONG' }), /identity mismatch/);
  await evidence(id);
  assert.equal((await row()).answered_agent_id, 'agent_a');
  await assert.rejects(evidence(id, { child: 'OTHER_CHILD' }), /identity mismatch/);
});

test('outbound answer and short calls do not qualify; threshold and longer calls do', async () => {
  for (const duration of [0, 29, 30, 31]) {
    await reset(); const id = await attempt('OUT', 'agent_a', 'outbound');
    await evidence(id, { sid: 'OUT' });
    assert.equal((await pointer()).agent, null);
    await evidence(id, { sid: 'OUT', status: 'completed', duration, end: t1 });
    assert.equal((await pointer()).agent, duration >= 30 ? 'agent_a' : null);
    if (duration >= 30) assert.equal((await pointer()).direction, 'outbound');
  }
});

test('outbound completion can arrive before answer and minimum is saved per attempt', async () => {
  await reset(); const id = await attempt('OUT', 'agent_a', 'outbound', 45);
  await evidence(id, { sid: 'OUT', status: 'completed', duration: 44, end: t1 });
  assert.equal((await pointer()).agent, null);
  await evidence(id, { sid: 'OUT' }); assert.equal((await pointer()).agent, null);
  const next = await attempt('OUT2', 'agent_a', 'outbound', 45);
  await evidence(next, { sid: 'OUT2', source: 'dial', status: 'completed', duration: 45, end: t1 });
  assert.equal((await pointer()).agent, 'agent_a');
  await evidence(next, { sid: 'OUT2', answer: t1 });
  assert.equal(new Date((await pointer()).at).toISOString(), t0);
});

test('outbound negative outcomes with duration do not count; tenant mismatch cannot update contact', async () => {
  for (const status of ['canceled', 'no-answer', 'busy', 'failed']) {
    await reset(); const id = await attempt('OUT', 'agent_a', 'outbound');
    await evidence(id, { sid: 'OUT', status, duration: 60, end: t1 });
    assert.equal((await pointer()).agent, null);
  }
  const { rows } = await db.query('SELECT advance_contact_connection($1,$2,$3,$4,$5) AS changed',
    [contact, '00000000-0000-4000-8000-000000000099', 'agent_a', t0, 'inbound']);
  assert.equal(rows[0].changed, false);
});

test('child evidence uses Twilio event time; Dial fallback verifies child parent and derives answer time', async () => {
  const primary = await buildEvidence({ CallSid: 'child', ParentCallSid: 'parent', CallStatus: 'in-progress', Timestamp: t0 }, 'child');
  assert.equal(primary.p_answered_at, t0);
  const action = { CallSid: 'parent', DialCallSid: 'child', DialCallStatus: 'completed', DialCallDuration: '60' };
  const secondary = await buildEvidence(action, 'dial', async sid => {
    assert.equal(sid, 'child'); return { parentCallSid: 'parent', status: 'completed', endTime: new Date(t1) };
  });
  assert.equal(secondary.p_answered_at, t0);
  const unbridged = await buildEvidence({ ...action, DialBridged: 'false' }, 'dial',
    async () => assert.fail('Unbridged calls must not fetch answer evidence'));
  assert.equal(unbridged.p_answered_at, null);
  assert.equal(unbridged.p_talk_seconds, 0);
  await assert.rejects(buildEvidence(action, 'dial', async () => ({ parentCallSid: 'wrong', status: 'completed', endTime: t1 })), /verified/);
  await assert.rejects(buildEvidence({ CallSid: 'child', ParentCallSid: 'parent', CallStatus: 'in-progress' }, 'child'), /timestamp/);
  await assert.rejects(buildEvidence(action, 'dial', async () => { throw new Error('Twilio unavailable'); }), /unavailable/);
});
