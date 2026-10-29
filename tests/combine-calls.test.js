import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createCombineCallsHandler } from '../netlify/functions/combine-calls.js';
import { createCallLogHandler } from '../netlify/functions/call-log.js';

const pg = new PGlite(), db = evidenceDb(pg);
const sql = (q, args = []) => pg.query(q, args).then(result => result.rows);
const file = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = id(1), OTHER = id(2), AGENT = id(3), CONTACT = id(4), CONTACT2 = id(5);
const auth = { userId: 'user-a', orgId: 'org-a', tokenPayload: { org_role: 'org:member' } };
const admin = { userId: 'admin', orgId: 'org-a', tokenPayload: { org_role: 'org:admin' } };
const handler = createCombineCallsHandler({ authenticate: async request => request.headers.get('x-test-admin') ? admin : auth, getDb: () => db });
async function action(body, { status = 200, asAdmin = false } = {}) {
  const response = await handler(new Request('https://test/combine-calls', {
    method: 'POST', headers: asAdmin ? { 'x-test-admin': '1' } : {}, body: JSON.stringify(body),
  }));
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
const preview = (a, b) => action({ action: 'preview', first_id: a, second_id: b });
async function combine(a, b, extra = {}) {
  const p = await preview(a, b);
  return action({ action: 'combine', first_id: a, second_id: b, expected_primary: p.primary_id, ...extra });
}
async function get(a, mode = '') {
  const response = await handler(new Request(`https://test/combine-calls?call_id=${a}&mode=${mode}`));
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
async function log(params = '') {
  const response = await createCallLogHandler({ authenticate: async () => auth, getDb: () => db })(new Request('https://test/call-log?' + params));
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
let sequence = 100;
async function call({ recording = null, talk = 60, date = '2026-10-20T13:00:00Z', contact = CONTACT, tenant = T, owner = AGENT, inbound = false } = {}) {
  const callId = id(sequence++), session = id(sequence++), attempt = id(sequence++), incoming = inbound ? id(sequence++) : null;
  const sid = 'CA' + callId.replaceAll('-', '');
  await sql(`INSERT INTO call_records(id,tenant_id,agent_id,session_id,contact_id,call_direction,call_start,
    call_duration_seconds,agent_name,call_outcome,transcript_raw,transcript_diarized,twilio_call_sid)
    VALUES($1,$2,$3,$4,$5,$6,$7,999,'Agent A','enrolled','retained transcript','[]',$8)`,
  [callId, tenant, owner, session, contact, inbound ? 'inbound' : 'outbound', date, sid]);
  await sql('INSERT INTO sessions VALUES($1,$2,$3,$4)', [session, owner, tenant, callId]);
  if (inbound) await sql(`INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,call_record_id,contact_id,status,routed_agent_id)
    VALUES($1,$2,$3,$4,$5,'completed','agent_a')`, [incoming, tenant, sid, callId, contact]);
  await sql(`INSERT INTO telephony_call_attempts(id,tenant_id,call_record_id,inbound_call_id,agent_id,direction,status,talk_seconds,created_at,parent_call_sid)
    VALUES($1,$2,$3,$4,'agent_a',$5,'completed',$6,$7,$8)`, [attempt, tenant, callId, incoming, inbound ? 'inbound' : 'outbound', talk, date, sid]);
  if (recording != null) await sql(`INSERT INTO recording_ingestion(tenant_id,account_sid,recording_sid,callback_call_sid,
    parent_call_sid,call_record_id,attempt_id,inbound_call_id,provider_status,recording_duration_seconds,recording_url,copy_status,recording_key)
    VALUES($1,$2,$3,$4,$4,$5,$6,$7,'completed',$8,$9,'pending',$3)`,
  [tenant, 'AC' + 'a'.repeat(32), 'RE' + callId.replaceAll('-', ''), sid, callId, attempt, incoming, recording,
    `https://api.twilio.com/2010-04-01/Accounts/AC${'a'.repeat(32)}/Recordings/RE${callId.replaceAll('-', '')}`]);
  return callId;
}
before(async () => {
  await pg.exec(readFileSync(new URL('./fixtures/recordings-schema.sql', import.meta.url), 'utf8'));
  await pg.exec(`
    CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid,first_name text,last_name text,phone text);
    CREATE TABLE compliance_scorecards(id uuid PRIMARY KEY,tenant_id uuid,overall_score integer,overall_grade text,pass_fail text);
    ALTER TABLE call_records ADD COLUMN contact_id uuid,ADD COLUMN writing_agent text,ADD COLUMN agent_name text,
      ADD COLUMN enrollment_completed boolean,ADD COLUMN call_outcome text,ADD COLUMN compliance_scorecard_id uuid,
      ADD COLUMN transcript_raw text,ADD COLUMN transcript_diarized jsonb,ADD COLUMN agent_notes text,ADD COLUMN compliance_status text;
    ALTER TABLE inbound_calls ADD COLUMN contact_id uuid,ADD COLUMN from_number text;
    ALTER TABLE telephony_call_attempts ADD COLUMN contact_id uuid,ADD COLUMN to_number text,ADD COLUMN status text;
    CREATE TABLE contact_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,contact_id uuid NOT NULL,
      type text CHECK(type IN ('call','note')),ref_id uuid,summary text,occurred_at timestamptz DEFAULT now());
    CREATE VIEW v_daily_activity WITH(security_invoker=true) AS SELECT cr.id FROM public.call_records cr;
    CREATE VIEW v_agent_performance WITH(security_invoker=true) AS SELECT cr.tenant_id,count(*) AS n FROM public.call_records cr GROUP BY cr.tenant_id;
    GRANT SELECT,UPDATE,INSERT ON call_records TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  await sql('INSERT INTO tenants VALUES($1,\'org-a\'),($2,\'org-b\')', [T, OTHER]);
  await sql("INSERT INTO enrolled_agents VALUES($1,$2,'user-a','Agent A',NULL,true)", [AGENT, T]);
  await sql("INSERT INTO tenant_agents(tenant_id,clerk_user_id,agent_slug,is_active) VALUES($1,'user-a','agent_a',true)", [T]);
  await sql("INSERT INTO contacts VALUES($1,$2,'Test','One','123'),($3,$2,'Test','Two','456')", [CONTACT, T, CONTACT2]);
  await pg.exec(file('064_recording_ingestion.sql'));
  await pg.exec(file('066_outbound_call_log.sql'));
  await pg.exec(file('118_combine_calls.sql'));
  // A combine must never touch the fields used by compliance dispatch.
  await pg.exec(`CREATE FUNCTION reject_compliance_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Compliance should not run'; END $$;
    CREATE TRIGGER compliance_dispatch AFTER UPDATE OF call_outcome,transcript_raw,transcript_diarized,call_duration_seconds
      ON call_records FOR EACH ROW EXECUTE FUNCTION reject_compliance_change();`);
});
after(() => pg.close());

test('longer recording wins even when measured talk is shorter; preview is side-effect free', async () => {
  const a = await call({ recording: 40, talk: 150 }), b = await call({ recording: 90, talk: 80 });
  const p = await preview(a, b); assert.equal(p.primary_id, b); assert.equal(p.calls.length, 2);
  assert.equal(p.different_contacts, false);
  assert.ok((await sql('SELECT parent_call_id FROM call_records WHERE id IN ($1,$2)', [a, b])).every(c => c.parent_call_id === null));
  assert.equal((await sql('SELECT count(*)::int n FROM contact_activities'))[0].n, 0);
});
test('recording tie or either missing falls back to measured talk, then earlier date and stable ID', async () => {
  const a = await call({ recording: 40, talk: 50 }), b = await call({ recording: 40, talk: 80 });
  assert.equal((await preview(a, b)).primary_id, b);
  const missing = await call({ talk: 120 }); assert.equal((await preview(b, missing)).primary_id, missing);
  const old = await call({ talk: 120, date: '2026-10-19T12:00:00Z' }); assert.equal((await preview(missing, old)).primary_id, old);
  const missingTalk = await call({ talk: null, date: '2026-10-18T12:00:00Z' });
  const missingBoth = await call({ talk: null }); assert.equal((await preview(missingBoth, missingTalk)).primary_id, missingTalk);
  const same = await call({ talk: null }); assert.equal((await preview(same, missingBoth)).primary_id, missingBoth);
});
test('combine hides child before pagination/search/count and reporting; original media, durations and disposition survive', async () => {
  const a = await call({ recording: 40, talk: 25, inbound: true }), b = await call({ recording: 90, talk: 80 });
  const before = await log(); const original = await sql('SELECT * FROM call_records WHERE id IN ($1,$2) ORDER BY id', [a, b]);
  const result = await combine(a, b); assert.equal(result.primary_id, b);
  const after = await log('limit=500'); assert.equal(after.count, before.count - 1);
  assert.ok(!after.rows.some(row => row.call_record_id === a));
  const primary = after.rows.find(row => row.call_record_id === b);
  assert.equal(primary.duration_seconds, 105); assert.equal(primary.original_talk_seconds, 80); assert.equal(primary.combined_count, 1);
  assert.equal((await log(`record_ids=${a}`)).count, 0);
  assert.equal((await sql('SELECT count(*)::int n FROM v_daily_activity WHERE id=$1', [a]))[0].n, 0);
  assert.equal((await sql('SELECT n FROM v_agent_performance WHERE tenant_id=$1', [T]))[0].n, after.count);
  const saved = await sql('SELECT * FROM call_records WHERE id IN ($1,$2) ORDER BY id', [a, b]);
  const withoutParent = row => { const copy = { ...row }; delete copy.parent_call_id; return copy; };
  assert.deepEqual(saved.map(withoutParent), original.map(withoutParent));
  const children = await get(b); assert.equal(children.rows.length, 1);
  assert.equal(children.rows[0].transcript_raw, 'retained transcript'); assert.equal(children.rows[0].duration_seconds, 25);
  assert.match(children.rows[0].recording_url, /api.twilio.com/);
  assert.equal((await sql('SELECT recording_duration_seconds FROM recording_ingestion WHERE call_record_id=$1', [a]))[0].recording_duration_seconds, 40);
  const audit = (await sql('SELECT * FROM contact_activities WHERE ref_id=$1', [b]))[0];
  assert.equal(audit.actor_clerk_user_id, 'user-a'); assert.equal(audit.call_action_details.child_call_id, a); assert.ok(audit.occurred_at);
  await action({ action: 'uncombine', first_id: b, second_id: a });
  assert.equal((await log()).count, before.count); assert.equal((await log(`record_ids=${a}`)).rows[0].duration_seconds, 25);
  assert.equal((await get(b)).rows.length, 0);
  assert.equal((await sql("SELECT count(*)::int n FROM contact_activities WHERE call_action_details->>'action'='uncombine' AND ref_id=$1", [b]))[0].n, 1);
});
test('re-parent both existing groups without chains, and restore a single child', async () => {
  const a = await call({ recording: 60 }), b = await call({ recording: 20 }), c = await call({ recording: 120 }), d = await call({ recording: 10 });
  await combine(a, b); await combine(c, d); await combine(a, c);
  assert.deepEqual((await sql('SELECT id FROM call_records WHERE parent_call_id=$1 ORDER BY id', [c])).map(r => r.id), [a, b, d].sort());
  assert.equal((await sql('SELECT count(*)::int n FROM call_records child JOIN call_records parent ON parent.id=child.parent_call_id WHERE parent.parent_call_id IS NOT NULL'))[0].n, 0);
  await action({ action: 'uncombine', first_id: c, second_id: a });
  assert.equal((await sql('SELECT parent_call_id FROM call_records WHERE id=$1', [b]))[0].parent_call_id, c);
  assert.equal((await get(c)).rows.length, 2);
});
test('different-contact preview warns and transaction requires explicit true; picker stays on contact', async () => {
  const a = await call({ recording: 20 }), b = await call({ recording: 90, contact: CONTACT2 });
  const p = await preview(a, b); assert.equal(p.different_contacts, true);
  await action({ action: 'combine', first_id: a, second_id: b, expected_primary: b }, { status: 409 });
  assert.equal((await sql('SELECT parent_call_id FROM call_records WHERE id=$1', [a]))[0].parent_call_id, null);
  await combine(a, b, { confirm_different: true });
  assert.equal((await sql('SELECT contact_id FROM call_records WHERE id=$1', [b]))[0].contact_id, CONTACT2);
  const candidates = await get(b, 'candidates');
  assert.ok(candidates.rows.every(row => row.contact_id === CONTACT2 && row.call_record_id !== a && row.call_record_id !== b));
  const audit = await sql('SELECT contact_id FROM contact_activities WHERE ref_id=$1', [b]); assert.equal(audit.length, 2);
});
test('stale primary preview is rejected when recording metadata changes', async () => {
  const a = await call({ recording: 20 }), b = await call({ recording: 90 });
  await sql('UPDATE recording_ingestion SET recording_duration_seconds=120 WHERE call_record_id=$1', [a]);
  await action({ action: 'combine', first_id: a, second_id: b, expected_primary: b }, { status: 409 });
  assert.equal((await sql('SELECT parent_call_id FROM call_records WHERE id=$1', [b]))[0].parent_call_id, null);
});
test('calls without contacts still keep a tenant-scoped action audit', async () => {
  const a = await call({ talk: 90, contact: null }), b = await call({ talk: 20, contact: null });
  const p = await preview(a, b); assert.equal(p.different_contacts, false); assert.equal(p.calls.length, 2);
  await combine(a, b);
  const audit = (await sql('SELECT * FROM contact_activities WHERE ref_id=$1', [a]))[0];
  assert.equal(audit.tenant_id, T); assert.equal(audit.contact_id, null); assert.equal(audit.actor_clerk_user_id, 'user-a');
  assert.equal(audit.call_action_details.action, 'combine');
  await assert.rejects(sql("INSERT INTO contact_activities(tenant_id,type) VALUES($1,'note')", [T]), /call_action_contact_required/);
});
test('cross-tenant, ownership, direct browser writes and RPC execution are denied', async () => {
  const a = await call(), foreign = await call({ tenant: OTHER });
  await action({ action: 'preview', first_id: a, second_id: foreign }, { status: 403 });
  const unowned = await call({ owner: id(999) });
  await action({ action: 'preview', first_id: a, second_id: unowned }, { status: 403 });
  await action({ action: 'preview', first_id: a, second_id: unowned }, { asAdmin: true });
  await pg.exec('SET ROLE authenticated');
  try {
    await assert.rejects(sql('UPDATE call_records SET parent_call_id=$1 WHERE id=$2', [a, unowned]), /combine calls service/);
    await assert.rejects(sql("SELECT combine_call_records($1,'user-a',true,'preview',$2,$3,false,NULL)", [T, a, unowned]), /permission denied/);
    await assert.rejects(sql('SELECT * FROM v_call_log_entries'), /permission denied/);
  } finally { await pg.exec('RESET ROLE'); }
});
test('audit failure rolls the whole combine back, including re-parented children', async () => {
  const a = await call({ recording: 60 }), b = await call({ recording: 20 }), c = await call({ recording: 100 });
  await combine(a, b);
  await pg.exec("ALTER TABLE contact_activities ADD CONSTRAINT fail_audit CHECK (summary <> 'Combined calls') NOT VALID");
  try {
    await action({ action: 'combine', first_id: a, second_id: c, expected_primary: c }, { status: 503 });
    assert.equal((await sql('SELECT parent_call_id FROM call_records WHERE id=$1', [a]))[0].parent_call_id, null);
    assert.equal((await sql('SELECT parent_call_id FROM call_records WHERE id=$1', [b]))[0].parent_call_id, a);
  } finally { await pg.exec('ALTER TABLE contact_activities DROP CONSTRAINT fail_audit'); }
});
test('parent deletion restores child through ON DELETE SET NULL', async () => {
  const a = await call({ talk: 90 }), b = await call({ talk: 20 }); await combine(a, b);
  await sql('DELETE FROM call_records WHERE id=$1', [a]);
  assert.equal((await sql('SELECT parent_call_id FROM call_records WHERE id=$1', [b]))[0].parent_call_id, null);
});
