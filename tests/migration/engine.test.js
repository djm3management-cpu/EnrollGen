// Copy engine behaviour on two synthetic PGlite databases: PII re-encryption,
// idempotency, reject ledger and resume after an injected failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Copier, InjectedFailure } from '../../scripts/migration/live-to-fresh/lib/engine.js';
import { ensureLedger, getProgress } from '../../scripts/migration/live-to-fresh/lib/ledger.js';
import { PiiCodec } from '../../scripts/migration/live-to-fresh/lib/pii.js';
import { tableSpec } from '../../scripts/migration/live-to-fresh/lib/plan.js';
import { oldDatabase, newDatabase, seedContacts, contactId, activityId, OLD_KEY, OLD_KEY_ID, TENANT, tableDigest } from './helpers.js';

const sha = v => (v == null ? null : createHash('sha256').update(String(v)).digest('hex'));

async function setup({ contacts = 7, batchSize = 3, failAfterBatches = null } = {}) {
  const oldDb = await oldDatabase(), newDb = await newDatabase();
  await seedContacts(oldDb, contacts);
  await ensureLedger(newDb);
  const codec = new PiiCodec({ oldDb, newDb, oldKey: OLD_KEY, cryptoSchema: 'public' });
  const copier = await Copier.create({ oldDb, newDb, batchSize, failAfterBatches });
  const ctx = { codec, oldDb, newDb, anchors: copier.anchors, rosterClerkIds: new Set() };
  return { oldDb, newDb, codec, copier, ctx };
}

test('contacts are re-encrypted with the NEW key, plaintext stays NULL, blind indexes are recomputed', async () => {
  const { oldDb, newDb, copier, ctx } = await setup();
  const r = await copier.copyTable(tableSpec('contacts', ctx), ctx);
  assert.equal(r.inserted, 7); assert.equal(r.rejected, 0);

  const plain = await newDb.query(`SELECT count(*)::int AS n FROM contacts WHERE coalesce(first_name,last_name,phone,email,address) IS NOT NULL OR dob IS NOT NULL`);
  assert.equal(plain.rows[0].n, 0);
  const keys = await newDb.query(`SELECT DISTINCT e.value->>'k' AS k FROM contacts, jsonb_each(pii_encrypted) e`);
  assert.deepEqual(keys.rows.map(x => x.k), ['b0000000-0000-4000-8000-0000000000bb']);
  assert.ok(!keys.rows.some(x => x.k === OLD_KEY_ID));

  // Every field decrypts in NEW (NEW key) to the same SHA-256 as in OLD (OLD key).
  const q = `SELECT c.id::text AS id, e.key AS f, decrypt_pii_value(e.value) AS p FROM contacts c, jsonb_each(c.pii_encrypted) e ORDER BY 1,2`;
  const o = (await oldDb.query(q)).rows.map(x => `${x.id}/${x.f}/${sha(x.p)}`);
  const n = (await newDb.query(q)).rows.map(x => `${x.id}/${x.f}/${sha(x.p)}`);
  assert.ok(o.length >= 7 * 3);
  assert.deepEqual(n, o);
  assert.ok(o.some(x => x.includes('/mbi_full/')), 'envelope-only fields survive');

  // Blind indexes are NEW-key values, equal to a fresh recomputation and different from OLD.
  const bi = await newDb.query(`SELECT count(*)::int AS n FROM contacts WHERE phone_hash = pii_blind_index(normalize_phone_e164(decrypt_pii_value(pii_encrypted->'phone')))`);
  assert.equal(bi.rows[0].n, 7);
  const oldHashes = new Set((await oldDb.query(`SELECT phone_hash FROM contacts`)).rows.map(x => x.phone_hash));
  assert.ok((await newDb.query(`SELECT phone_hash FROM contacts`)).rows.every(x => !oldHashes.has(x.phone_hash)));

  // Retention anchor follows created_at, as NEW's trigger would.
  const ret = await newDb.query(`SELECT count(*)::int AS n FROM contacts WHERE retention_started_at = created_at AND retention_last_activity_at = created_at`);
  assert.equal(ret.rows[0].n, 7);
});

test('a wrong OLD key never writes plaintext or partial rows; rows land in the reject ledger', async () => {
  const oldDb = await oldDatabase(), newDb = await newDatabase();
  await seedContacts(oldDb, 3); await ensureLedger(newDb);
  const codec = new PiiCodec({ oldDb, newDb, oldKey: 'wrong-key', cryptoSchema: 'public' });
  const copier = await Copier.create({ oldDb, newDb, batchSize: 10 });
  const ctx = { codec, oldDb, newDb, anchors: copier.anchors };
  const r = await copier.copyTable(tableSpec('contacts', ctx), ctx);
  assert.equal(r.inserted, 0); assert.equal(r.rejected, 3);
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM contacts`)).rows[0].n, 0);
  const reasons = (await newDb.query(`SELECT DISTINCT reason FROM migration_ledger.rejects`)).rows.map(x => x.reason);
  assert.deepEqual(reasons, ['prepare_failed:PII_decryption_failed_in_OLD']);
});

test('a second run against the same NEW changes nothing', async () => {
  const { newDb, oldDb, codec, ctx } = await setup({ contacts: 5 });
  const c1 = await Copier.create({ oldDb, newDb, batchSize: 2 });
  await c1.copyTable(tableSpec('contacts', ctx), ctx);
  const before = await tableDigest(newDb, 'contacts');
  // Fresh copier, reset progress: the second pass must re-read every row and insert none.
  await newDb.query(`DELETE FROM migration_ledger.table_progress`);
  const c2 = await Copier.create({ oldDb, newDb, batchSize: 2 });
  const r2 = await c2.copyTable(tableSpec('contacts', { ...ctx, codec }), ctx);
  assert.equal(r2.read, 5); assert.equal(r2.inserted, 0);
  assert.deepEqual(await tableDigest(newDb, 'contacts'), before);
  // And a normal rerun with progress intact is a no-op.
  const r3 = await (await Copier.create({ oldDb, newDb })).copyTable(tableSpec('contacts', ctx), ctx);
  assert.equal(r3.skipped, true);
});

test('unmappable rows go to the reject ledger with a reason and the run continues', async () => {
  const { oldDb, newDb, copier, ctx } = await setup({ contacts: 2 });
  await copier.copyTable(tableSpec('contacts', ctx), ctx);
  const rows = [[1, 'call', 'ok'], [2, 'sms', 'texted'], [3, 'fax', 'bad enum'], [4, 'note', null], [5, 'note', 'fine']];
  for (const [n, type, summary] of rows) await oldDb.query(`INSERT INTO contact_activities VALUES ($1,$2,$3,$4,now())`, [activityId(n), contactId(1), type, summary]);
  const r = await copier.copyTable(tableSpec('contact_activities', ctx), ctx);
  assert.equal(r.read, 5); assert.equal(r.inserted, 3); assert.equal(r.rejected, 2);
  const rej = (await newDb.query(`SELECT old_pk, reason FROM migration_ledger.rejects WHERE table_name='contact_activities' ORDER BY old_pk`)).rows;
  assert.deepEqual(rej, [{ old_pk: activityId(3), reason: 'invalid_enum:contact_activities.type' }, { old_pk: activityId(4), reason: 'sql_23502' }]);
  const tr = (await newDb.query(`SELECT old_pk, kind, detail FROM migration_ledger.transforms WHERE table_name='contact_activities'`)).rows;
  assert.deepEqual(tr, [{ old_pk: activityId(2), kind: 'type_mapped', detail: { from: 'sms', to: 'note' } }]);
  assert.equal((await newDb.query(`SELECT type FROM contact_activities WHERE id=$1`, [activityId(2)])).rows[0].type, 'note');
  // Rerunning does not duplicate rejects.
  await newDb.query(`DELETE FROM migration_ledger.table_progress WHERE table_name='contact_activities'`);
  await (await Copier.create({ oldDb, newDb })).copyTable(tableSpec('contact_activities', ctx), ctx);
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM migration_ledger.rejects`)).rows[0].n, 2);
});

test('section_scores split and lossless numerics survive the copy', async () => {
  const { oldDb, newDb, copier, ctx } = await setup({ contacts: 0 });
  await oldDb.query(`INSERT INTO section_scores(id, session_id, section_label, notes) VALUES ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000ff', 'Intro', '{"section_number":1.5,"completed":true,"duration_seconds":12}')`);
  await oldDb.query(`INSERT INTO amounts VALUES (9007199254740993, 12345678901234567890.123456789, 0.1, 'x')`);
  await copier.copyTable(tableSpec('section_scores', ctx), ctx);
  await copier.copyTable(tableSpec('amounts', ctx), ctx);
  const s = (await newDb.query(`SELECT section_number, completed, duration_seconds FROM section_scores`)).rows[0];
  assert.deepEqual([s.section_number, s.completed, s.duration_seconds], [1.5, true, 12]);
  const a = (await newDb.query(`SELECT id::text, amount::text, ratio::text FROM amounts`)).rows[0];
  assert.deepEqual(a, { id: '9007199254740993', amount: '12345678901234567890.123456789', ratio: '0.1' });
});

test('a run that fails mid-table resumes from its ledger cursor without duplicates', async () => {
  const { oldDb, newDb, ctx } = await setup({ contacts: 10 });
  const failing = await Copier.create({ oldDb, newDb, batchSize: 3, failAfterBatches: 2 });
  await assert.rejects(failing.copyTable(tableSpec('contacts', ctx), ctx), InjectedFailure);
  const mid = await getProgress(newDb, 'contacts');
  assert.equal(mid.done, false); assert.equal(mid.inserted, 6);
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM contacts`)).rows[0].n, 6);

  const resumed = await Copier.create({ oldDb, newDb, batchSize: 3 });
  const r = await resumed.copyTable(tableSpec('contacts', ctx), ctx);
  assert.equal(r.read, 4, 'resume reads only rows after the cursor');
  const end = await getProgress(newDb, 'contacts');
  assert.equal(end.done, true); assert.equal(end.inserted, 10);
  const ids = (await newDb.query(`SELECT id::text FROM contacts ORDER BY id`)).rows.map(x => x.id);
  assert.deepEqual(ids, Array.from({ length: 10 }, (_, i) => contactId(i + 1)));
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM contacts WHERE tenant_id=$1`, [TENANT])).rows[0].n, 10);
});

test('a uuid id becomes a NEW identity through the id map, idempotently', async () => {
  const { oldDb, newDb, copier, ctx } = await setup({ contacts: 0 });
  for (let n = 1; n <= 4; n++) await oldDb.query(`INSERT INTO agent_availability_log VALUES ($1, 'synthetic_agent', 'Synthetic Agent', 'available', true, now() - ($2::text || ' hours')::interval)`, [`a1000000-0000-4000-8000-00000000000${n}`, String(n)]);
  const r1 = await copier.copyTable(tableSpec('agent_availability_log', ctx), ctx);
  assert.equal(r1.inserted, 4); assert.equal(r1.rejected, 0);
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM migration_ledger.id_map WHERE kind='agent_availability_log'`)).rows[0].n, 4);
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM agent_availability_log WHERE retention_started_at = changed_at`)).rows[0].n, 4);
  await newDb.query(`DELETE FROM migration_ledger.table_progress`);
  const r2 = await (await Copier.create({ oldDb, newDb })).copyTable(tableSpec('agent_availability_log', ctx), ctx);
  assert.equal(r2.inserted, 0);
  assert.equal((await newDb.query(`SELECT count(*)::int AS n FROM agent_availability_log`)).rows[0].n, 4);
});
