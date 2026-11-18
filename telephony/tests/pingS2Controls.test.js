// Migration 173: generic publisher auth, per-tenant IANA hours and per source
// and per campaign pause with an append only audit. Also migration hygiene for
// 173 and 174.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide, migration, hash as paragonHash, source as paragonSource } from './helpers/pingDb.js';
import { createS2Db, seedPublisherB, B, CENTRAL_HOURS, MIGRATIONS_S2 } from './helpers/pingS2Db.js';
import { hoursOpen } from '../src/ping/decide.js';

let db; let campaigns;
before(async () => { db = await createS2Db(); campaigns = await seedPublisherB(db); });
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
// An expected error inside a transaction rolls back to a savepoint only.
const rejects = async (sql, args, pattern) => {
  await db.exec('SAVEPOINT expected');
  try { await assert.rejects(q(sql, args), pattern); } finally { await db.exec('ROLLBACK TO SAVEPOINT expected'); }
};
const admit = async (key, route) => (await q('SELECT admit_vendor($1,$2,600) AS r', [key, route]))[0].r;
const pingB = (extra = {}) => pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS',
  phone: '+15550003000', callId: 'b-1', ...extra });

const WEEK = hours => ({ timezone: hours, days: Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => [day, { enabled: true, start: '09:00', end: '17:00' }])) });
const sqlOpen = async (hours, at) => (await q('SELECT ping_hours_open($1,$2) AS open', [hours, at]))[0].open;

test('173 and 174 carry the UNAPPLIED header, a transaction, no em dashes and no paragon_* changes', async () => {
  for (const name of MIGRATIONS_S2) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /\u2014/, name);
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION|VIEW|TRIGGER)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?paragon_/i, name);
  }
});

test('new tables have RLS and no browser grants; entry routines are service role only', async () => {
  const names = ['ping_source_controls', 'ping_source_control_audit', 'ping_call_billing', 'ping_call_billing_events', 'ping_returns'];
  const tables = await q('SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1)', [names]);
  assert.equal(tables.length, names.length);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true, table.relname);
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_table_privilege($1,$2,$3) ok', [role, table.relname, 'SELECT']))[0].ok, false);
    }
  }
  for (const fn of ['admit_vendor(text,text,integer)', 'ping_hours_open(jsonb,timestamptz)', 'ping_decide(text,text,jsonb,text)',
    'set_ping_source_control(uuid,uuid,uuid,boolean,text)', 'ping_resolve_arrival(text,text,text,text,timestamptz)',
    'ping_claim_arrival(text,text,text,text,text[],text,timestamptz)', 'enqueue_ping_billing_event(text,text,jsonb)',
    'claim_ping_billing_jobs(integer)', 'record_ping_billing_snapshot(text,uuid,text,timestamptz,timestamptz,timestamptz,integer,jsonb)']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', [role, fn, 'EXECUTE']))[0].ok, false, `${role} ${fn}`);
    }
    assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', ['service_role', fn, 'EXECUTE']))[0].ok, true, fn);
  }
});

test('admit_vendor authorizes a non-Paragon publisher key for vendorPing only, behind the platform switch', () => inTx(async () => {
  await setFeatures(db);
  const gate = await admit(B.hash, 'vendorPing');
  assert.deepEqual([gate.authorized, gate.allowed], [true, true]);
  assert.deepEqual(await admit(B.hash, 'availability'), { authorized: false }, 'availability is unchanged');
  await q(`UPDATE lead_sources SET type='aggregator' WHERE id=$1`, [B.source]);
  assert.equal((await admit(B.hash, 'vendorPing')).authorized, true, 'aggregators ping too');
  await q(`UPDATE lead_sources SET type='direct' WHERE id=$1`, [B.source]);
  assert.deepEqual(await admit(B.hash, 'vendorPing'), { authorized: false }, 'direct sources never ping');
  await q(`UPDATE lead_sources SET type='publisher',active=false WHERE id=$1`, [B.source]);
  assert.deepEqual(await admit(B.hash, 'vendorPing'), { authorized: false }, 'inactive sources are refused');
  assert.deepEqual(await admit('e'.repeat(64), 'vendorPing'), { authorized: false }, 'unknown keys are refused');
}));

test('with the switch off only the deployment vendor is admitted, exactly as in 158', () => inTx(async () => {
  for (const features of [{}, { PING_PLATFORM_ENABLED: false }]) {
    await setFeatures(db, features);
    assert.deepEqual(await admit(B.hash, 'vendorPing'), { authorized: false });
    assert.equal((await admit(paragonHash, 'vendorPing')).authorized, true);
    assert.deepEqual(await admit(paragonHash, 'availability'), { authorized: false });
  }
  await q(`INSERT INTO availability_consumers VALUES('Status Feed',true,$1)`, ['f'.repeat(64)]);
  assert.equal((await admit('f'.repeat(64), 'availability')).authorized, true);
  await rejects('SELECT admit_vendor($1,$2,600)', [B.hash, 'other'], /Invalid vendor route/);
}));

test('ping_hours_open uses America/Chicago across the March DST change', async () => {
  const hours = WEEK('America/Chicago');
  // Saturday 2026-03-07 is CST (UTC-6); Sunday 2026-03-08 is CDT (UTC-5).
  assert.equal(await sqlOpen(hours, '2026-03-07T14:30:00Z'), false, '08:30 CST');
  assert.equal(await sqlOpen(hours, '2026-03-07T15:00:00Z'), true, '09:00 CST');
  assert.equal(await sqlOpen(hours, '2026-03-08T13:30:00Z'), false, '08:30 CDT');
  assert.equal(await sqlOpen(hours, '2026-03-08T14:00:00Z'), true, '09:00 CDT on the DST day');
  assert.equal(await sqlOpen(hours, '2026-03-08T21:59:00Z'), true, '16:59 CDT');
  assert.equal(await sqlOpen(hours, '2026-03-08T22:00:00Z'), false, '17:00 CDT');
  // November fall back: Saturday 10-31 is CDT, Sunday 11-01 is CST.
  assert.equal(await sqlOpen(hours, '2026-10-31T14:00:00Z'), true, '09:00 CDT');
  assert.equal(await sqlOpen(hours, '2026-11-01T14:30:00Z'), false, '08:30 CST on the DST day');
  assert.equal(await sqlOpen(hours, '2026-11-01T15:00:00Z'), true, '09:00 CST on the DST day');
});

test('ping_hours_open uses America/Los_Angeles across the March DST change', async () => {
  const hours = WEEK('America/Los_Angeles');
  assert.equal(await sqlOpen(hours, '2026-03-07T16:30:00Z'), false, '08:30 PST');
  assert.equal(await sqlOpen(hours, '2026-03-07T17:00:00Z'), true, '09:00 PST');
  assert.equal(await sqlOpen(hours, '2026-03-08T16:00:00Z'), true, '09:00 PDT on the DST day');
  assert.equal(await sqlOpen(hours, '2026-03-08T15:59:00Z'), false, '08:59 PDT on the DST day');
  assert.equal(await sqlOpen(hours, '2026-03-08T23:59:00Z'), true, '16:59 PDT');
  assert.equal(await sqlOpen(hours, '2026-03-09T00:00:00Z'), false, '17:00 PDT');
  // The same instant is open in Los Angeles and closed in Chicago and New York.
  assert.equal(await sqlOpen(WEEK('America/New_York'), '2026-03-09T00:00:00Z'), false);
});

test('ping_hours_open keeps aliases, POSIX strings and unknown zones closed; the JS mirror agrees', async () => {
  const at = '2026-03-10T15:00:00Z';
  for (const zone of ['America/Chicago', 'America/Los_Angeles', 'America/New_York', 'America/Argentina/Buenos_Aires',
    'UTC', 'EST', 'CST6CDT', 'Mars/Olympus', 'america/chicago', '', null]) {
    const hours = { ...WEEK('x'), timezone: zone };
    assert.equal(hoursOpen(hours, at), await sqlOpen(hours, at), String(zone));
  }
  assert.equal(await sqlOpen(WEEK('Mars/Olympus'), at), false);
  assert.equal(await sqlOpen(WEEK('UTC'), at), false);
  for (const [zone, instant] of [['America/Chicago', '2026-03-08T13:30:00Z'], ['America/Chicago', '2026-03-08T14:00:00Z'],
    ['America/Los_Angeles', '2026-03-08T15:59:00Z'], ['America/Los_Angeles', '2026-03-08T16:00:00Z'],
    ['America/Chicago', '2026-11-01T14:30:00Z'], ['America/Chicago', '2026-11-01T15:00:00Z']]) {
    assert.equal(hoursOpen(WEEK(zone), instant), await sqlOpen(WEEK(zone), instant), `${zone} ${instant}`);
  }
});

test('a Central time tenant pings against its own clock', () => inTx(async () => {
  await setFeatures(db);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const hour = Number(parts.hour);
  if (hour < 1 || hour > 21) return; // Keep the window inside one local day.
  const day = parts.weekday.slice(0, 3).toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  // Open one hour either side of Central now; New York's clock is outside it.
  const window = { enabled: true, start: `${pad(hour - 1)}:${parts.minute}`, end: `${pad(hour + 1)}:${parts.minute}` };
  await q('UPDATE vendor_controls SET staffed_hours=$2 WHERE tenant_id=$1',
    [B.tenant, { timezone: 'America/Chicago', days: { [day]: window } }]);
  assert.equal((await pingB()).reason, 'accepted_full');
  await q('UPDATE vendor_controls SET staffed_hours=$2 WHERE tenant_id=$1',
    [B.tenant, { timezone: 'America/Chicago', days: { [day]: { ...window, end: `${pad(hour)}:00`, start: `${pad(hour - 1)}:00` } } }]);
  assert.equal((await pingB({ callId: 'b-2', phone: '+15550003001' })).reason, 'outside_staffed_hours');
}));

test('source and campaign pause rows reject only their scope and every write is audited', () => inTx(async () => {
  await setFeatures(db);
  const set = (campaign, paused) => q('SELECT set_ping_source_control($1,$2,$3,$4,$5) id',
    [B.tenant, B.source, campaign, paused, 'ops@test']);
  await set(campaigns['ma-central'], true);
  assert.equal((await pingB()).reason, 'source_paused');
  assert.equal((await pingB({ campaign: 'medsupp-central', callId: 'b-9' })).reason, 'accepted_full');
  await set(campaigns['ma-central'], false);
  await set(null, true);
  assert.equal((await pingB({ callId: 'b-3' })).reason, 'source_paused');
  assert.equal((await pingB({ campaign: 'medsupp-central', callId: 'b-4' })).reason, 'source_paused');
  await set(null, false);
  assert.equal((await pingB({ callId: 'b-5' })).available, true);
  const audit = await q('SELECT operation,paused,campaign_id,changed_by FROM ping_source_control_audit ORDER BY changed_at');
  assert.deepEqual(audit.map(a => [a.operation, a.paused, a.campaign_id]), [
    ['INSERT', true, campaigns['ma-central']], ['UPDATE', false, campaigns['ma-central']],
    ['INSERT', true, null], ['UPDATE', false, null]]);
  assert.ok(audit.every(a => a.changed_by === 'ops@test'));
  await rejects('UPDATE ping_source_control_audit SET paused=true', [], /append only/);
  await rejects('DELETE FROM ping_source_control_audit', [], /append only/);
}));

test('pause rows cannot cross tenants, the setter is fenced, and Paragon pause is untouched', () => inTx(async () => {
  await setFeatures(db);
  await rejects('SELECT set_ping_source_control($1,$2,NULL,true,$3)', [B.tenant, paragonSource, 'ops'], /scope mismatch/);
  const [paragonCampaign] = await q('SELECT id FROM ping_campaigns WHERE source_id=$1', [paragonSource]);
  await rejects('SELECT set_ping_source_control($1,$2,$3,true,$4)', [B.tenant, B.source, paragonCampaign.id, 'ops'], /scope mismatch/);
  await setFeatures(db, {});
  await rejects('SELECT set_ping_source_control($1,$2,NULL,true,$3)', [B.tenant, B.source, 'ops'], /disabled/);
  await setFeatures(db);
  // A tenant-wide pause still pauses generic campaigns, as in 172.
  await q('UPDATE vendor_controls SET vendor_pause=true WHERE tenant_id=$1', [B.tenant]);
  assert.equal((await pingB()).reason, 'source_paused');
  // Paragon's legacy campaign keeps answering routing_disabled to the generic engine.
  const legacy = await pingDecide(db, { state: 'KS', phone: '+15550004000', callId: 'p-1' });
  assert.equal(legacy.reason, 'routing_disabled');
  assert.equal(CENTRAL_HOURS.timezone, 'America/Chicago');
}));
