// Spec v5 publisher attestations (migration 190): source_attestation_missing is
// evaluated immediately after source_paused, only with SOURCE_ATTESTATIONS_ENABLED
// on and the campaign requiring attestations; missing or expired attestations
// decline; with the flag off or the setting false every call and lead decision
// is identical, reason and rule trace, to a database without 190.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures } from './helpers/pingDb.js';
import { B, seedPublisherB } from './helpers/pingS2Db.js';
import { OP, BUYERS, seedExchange, exchangePing } from './helpers/exchangeDb.js';
import { createS9Db, S9_FEATURES, seedLeadCampaign, leadPing } from './helpers/pingS9Db.js';
import { applyS10, S10_FEATURES } from './helpers/pingS10Db.js';
import { decidePing, REASONS } from '../src/ping/decide.js';
import { attestationStatus, attestationPatch, checkAttestation } from '../src/ping/attestations.js';

let db; let plain; let campaigns; let lead; let plainLead;
const current = { onshore_operation: true, no_resale: true, consent_language_reviewed: true, attestation_document_ref: 'ATTEST-1',
  attested_at: '2026-01-01T00:00:00Z', attestation_expires_at: '2099-01-01T00:00:00Z' };
const missing = { onshore_operation: null, no_resale: null, consent_language_reviewed: null, attestation_document_ref: null,
  attested_at: null, attestation_expires_at: null };

async function seed(target) {
  const ids = await seedPublisherB(target);
  const leadId = await seedLeadCampaign(target, { tenant: B.tenant, source: B.source });
  await seedExchange(target);
  return { ids, leadId };
}
const attest = (source, values) => db.query(`UPDATE lead_sources SET onshore_operation=$2,no_resale=$3,consent_language_reviewed=$4,
  attestation_document_ref=$5,attested_at=$6,attestation_expires_at=$7 WHERE id=$1`, [source, values.onshore_operation, values.no_resale,
  values.consent_language_reviewed, values.attestation_document_ref, values.attested_at, values.attestation_expires_at]);
const requireOn = (campaign, value) => db.query('UPDATE ping_campaigns SET require_source_attestations=$2 WHERE id=$1', [campaign, value]);
async function callPing(target, n) {
  const payload = { phone: `+1555301${String(n).padStart(4, '0')}`, state: 'KS', call_id: `att-${n}`, routing_enabled: true };
  const { rows: [row] } = await target.query('SELECT ping_decide($1,$2,$3,$4) AS d', [B.hash, 'ma-central', payload, 'generic']);
  const { rows: [decision] } = await target.query('SELECT reason,available,rule_trace FROM ping_decisions WHERE id=$1', [row.d.decision_id]);
  return decision;
}
const leadDecision = async (target, n) => {
  const result = await leadPing(target, { key: B.hash, payload: { state: 'KS', zip: '66002', sub_id: `lead-${n}` } });
  const { rows: [row] } = await target.query('SELECT reason,available,rule_trace FROM lead_pings WHERE id=$1', [result.lead_ping_id]);
  return row;
};
const rules = trace => trace.map(step => step.rule);

before(async () => {
  db = await applyS10(await createS9Db());
  plain = await createS9Db();
  for (const target of [db, plain]) await setFeatures(target, S9_FEATURES);
  ({ ids: campaigns, leadId: lead } = await seed(db));
  ({ leadId: plainLead } = await seed(plain));
});
after(async () => { await db?.close(); await plain?.close(); });
beforeEach(async () => {
  for (const target of [db, plain]) await target.exec('DELETE FROM ping_reservations; UPDATE vendor_controls SET vendor_pause=false;');
  await setFeatures(db, S9_FEATURES);
  await attest(B.source, missing); await attest(OP.source, missing);
  await db.query('UPDATE ping_campaigns SET require_source_attestations=false');
});

test('the closed reason lists and the JS mirror carry source_attestation_missing right after source_paused', async () => {
  assert.equal(REASONS[REASONS.indexOf('source_paused') + 1], 'source_attestation_missing');
  for (const table of ['ping_decisions', 'lead_pings']) {
    const { rows: [row] } = await db.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname=$1`, [`${table}_reason_check`]);
    assert.match(row.d, /source_attestation_missing/);
  }
  const base = { campaign: { active: true, allowed_states: ['KS'], engine_mode: 'generic', require_source_attestations: true },
    staffed: true, state: 'KS', callIdentity: true, agents: [] };
  assert.equal(decidePing({ ...base, attestations: { enabled: true, current: false } }).reason, 'source_attestation_missing');
  assert.equal(decidePing({ ...base, paused: true, attestations: { enabled: true, current: false } }).reason, 'source_paused');
  const off = decidePing({ ...base, attestations: { enabled: false, current: false } });
  assert.deepEqual(off, decidePing(base), 'flag off is identical to no attestation input');
  assert.ok(!rules(off.rule_trace).includes('source_attestation_missing'));
  assert.deepEqual(rules(decidePing({ ...base, attestations: { enabled: true, current: true } }).rule_trace).slice(0, 4),
    ['routing_disabled', 'invalid_payload', 'source_paused', 'source_attestation_missing']);
});

test('flag off or setting false: call and lead decisions are identical to a database without 190', async () => {
  let n = 1;
  for (const [flags, required] of [[S9_FEATURES, false], [S9_FEATURES, true], [S10_FEATURES, false]]) {
    await setFeatures(db, flags);
    await requireOn(campaigns['ma-central'], required); await requireOn(lead, required);
    for (const target of [db, plain]) await target.exec('DELETE FROM ping_reservations');
    const [a, b] = [await callPing(db, n), await callPing(plain, n)];
    assert.equal(a.reason, b.reason); assert.equal(a.available, b.available);
    assert.deepEqual(a.rule_trace, b.rule_trace);
    const [la, lb] = [await leadDecision(db, n), await leadDecision(plain, n)];
    assert.equal(la.reason, lb.reason); assert.deepEqual(la.rule_trace, lb.rule_trace);
    n += 1;
  }
  assert.ok(plainLead);
});

test('flag on and required: missing or expired attestations decline; current ones pass with a traced step', async () => {
  await setFeatures(db, S10_FEATURES);
  await requireOn(campaigns['ma-central'], true);
  const declined = await callPing(db, 20);
  assert.equal(declined.reason, 'source_attestation_missing');
  assert.equal(declined.available, false);
  assert.deepEqual(rules(declined.rule_trace), ['routing_disabled', 'invalid_payload', 'source_paused', 'source_attestation_missing']);
  await attest(B.source, { ...current, attested_at: '2019-01-01T00:00:00Z', attestation_expires_at: '2020-01-01T00:00:00Z' });
  assert.equal((await callPing(db, 21)).reason, 'source_attestation_missing', 'expired');
  await attest(B.source, { ...current, no_resale: false });
  assert.equal((await callPing(db, 22)).reason, 'source_attestation_missing', 'incomplete');
  await attest(B.source, current);
  const passed = await callPing(db, 23);
  assert.match(passed.reason, /^accepted_/);
  const steps = passed.rule_trace.map(step => [step.rule, step.result]);
  assert.deepEqual(steps.slice(2, 4), [['source_paused', 'pass'], ['source_attestation_missing', 'pass']]);
});

test('source_paused is evaluated before the attestation gate', async () => {
  await setFeatures(db, S10_FEATURES);
  await requireOn(campaigns['ma-central'], true);
  await db.query('UPDATE vendor_controls SET vendor_pause=true WHERE tenant_id=$1', [B.tenant]);
  const paused = await callPing(db, 30);
  assert.equal(paused.reason, 'source_paused');
  assert.ok(!rules(paused.rule_trace).includes('source_attestation_missing'));
});

test('exchange: a buyer requiring attestations declines an unattested publisher and the next buyer wins', async () => {
  await setFeatures(db, S10_FEATURES);
  const { rows } = await db.query('SELECT id,tenant_id FROM ping_campaigns WHERE name LIKE $1', ['exchange-%']);
  const east = rows.find(r => r.tenant_id === BUYERS.east.tenant).id;
  await requireOn(east, true);
  const result = await exchangePing(db, { phone: '+15550007301', callId: 'att-x1' });
  assert.equal(result.available, true);
  const { rows: [eastEval] } = await db.query(`SELECT reason FROM ping_decisions WHERE campaign_id=$1 AND engine='exchange_eval'
    ORDER BY received_at DESC LIMIT 1`, [east]);
  assert.equal(eastEval.reason, 'source_attestation_missing');
  const { rows: [won] } = await db.query(`SELECT campaign_id FROM ping_decisions WHERE engine='exchange' AND available ORDER BY received_at DESC LIMIT 1`);
  assert.notEqual(won.campaign_id, east);
  await attest(OP.source, current);
  await db.exec('DELETE FROM ping_reservations');
  await exchangePing(db, { phone: '+15550007302', callId: 'att-x2' });
  const { rows: [after] } = await db.query(`SELECT reason FROM ping_decisions WHERE campaign_id=$1 AND engine='exchange_eval'
    ORDER BY received_at DESC LIMIT 1`, [east]);
  assert.notEqual(after.reason, 'source_attestation_missing');
});

test('lead pings: the gate follows source_paused and declines with the same code', async () => {
  await setFeatures(db, S10_FEATURES);
  await requireOn(lead, true);
  const declined = await leadDecision(db, 40);
  assert.equal(declined.reason, 'source_attestation_missing');
  assert.deepEqual(rules(declined.rule_trace), ['invalid_payload', 'source_paused', 'source_attestation_missing']);
  await attest(B.source, current);
  const accepted = await leadDecision(db, 41);
  assert.equal(accepted.reason, 'accepted_full');
  assert.deepEqual(rules(accepted.rule_trace).slice(0, 3), ['invalid_payload', 'source_paused', 'source_attestation_missing']);
});

test('attestation status and the operator patch mirror ping_source_attested', async () => {
  const now = new Date('2026-11-18T00:00:00Z');
  assert.equal(attestationStatus(current, now), 'current');
  assert.equal(attestationStatus({ ...current, attestation_expires_at: '2026-11-17T00:00:00Z' }, now), 'expired');
  assert.equal(attestationStatus(missing, now), 'missing');
  for (const [source, expected] of [[current, true], [{ ...current, attested_at: '2019-01-01T00:00:00Z', attestation_expires_at: '2020-01-01T00:00:00Z' }, false], [missing, false]]) {
    await attest(B.source, source);
    const { rows: [row] } = await db.query('SELECT ping_source_attested($1,clock_timestamp()) AS ok', [B.source]);
    assert.equal(row.ok, expected);
  }
  const patch = attestationPatch({ onshore_operation: true, no_resale: true, consent_language_reviewed: true,
    attestation_document_ref: ' DOC-1 ', expires_at: '2027-11-18' }, 'user_operator', now);
  assert.equal(patch.attestation_document_ref, 'DOC-1');
  assert.equal(patch.attested_by, 'user_operator');
  assert.equal(checkAttestation({ onshore_operation: true, no_resale: true, consent_language_reviewed: true,
    attestation_document_ref: null, expires_at: '2026-01-01' }, 'u', now).error, 'expires_at must be in the future');
  assert.match(checkAttestation({ no_resale: true }, 'u', now).error, /onshore_operation/);
});
