// End to end for the S4 filter rules (migrations 177 and 178) on PGlite:
// retention, cooldowns, the pooled repeat shopper and the daily budget, with
// Test Publisher B (Central, direct generic) and the S3 exchange (one operator
// publisher, buyers in Eastern, Central and Pacific time). Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide, migration } from './helpers/pingDb.js';
import { seedPublisherB, B, callSid } from './helpers/pingS2Db.js';
import { seedExchange, exchangePing, fixturePhoneHash, BUYERS, OP } from './helpers/exchangeDb.js';
import { createS4Db, makeClient, MIGRATIONS_S4, S4_FEATURES } from './helpers/pingS4Db.js';

let db; let campaigns; let ma;
before(async () => {
  db = await createS4Db(); campaigns = { ...(await seedPublisherB(db)), ...(await seedExchange(db)) };
  ma = campaigns['ma-central'];
  await setFeatures(db, S4_FEATURES);
});
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const flags = (extra = {}) => setFeatures(db, { ...S4_FEATURES, ...extra });
const setCampaign = (id, fields) => q(`UPDATE ping_campaigns SET ${Object.keys(fields).map((k, i) => `${k}=$${i + 2}`).join(',')}
  WHERE id=$1`, [id, ...Object.values(fields)]);
const ping = (extra = {}) => pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: PHONE, ...extra });
const decision = async id => (await q('SELECT * FROM ping_decisions WHERE id=$1', [id]))[0];
const step = (row, rule) => row.rule_trace.find(entry => entry.rule === rule);
const alerts = () => q('SELECT * FROM ping_retention_alerts ORDER BY created_at');
const releaseHolds = () => q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
const PHONE = '+15550101001';
const ago = days => `now()-interval '${days} days'`;

test('177 and 178 carry the UNAPPLIED header, a transaction, no em dashes and no paragon_* changes', async () => {
  for (const name of MIGRATIONS_S4) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /—/, name);
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION|VIEW|TRIGGER)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?paragon_/i, name);
  }
});

test('new campaigns keep every S4 rule off, so all five record skipped', () => inTx(async () => {
  const [row] = await q('SELECT retention_enabled,retention_mode,cooldown_same_source_days,daily_budget_calls FROM ping_campaigns WHERE id=$1', [ma]);
  assert.deepEqual(row, { retention_enabled: false, retention_mode: 'route_owner', cooldown_same_source_days: null, daily_budget_calls: null });
  await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
  const result = await ping({ callId: 'off-1' });
  assert.equal(result.reason, 'accepted_full');
  const rules = ['existing_client_retention', 'cooldown_same_source', 'cooldown_any_source', 'repeat_shopper', 'daily_budget_reached'];
  assert.deepEqual((await decision(result.decision_id)).rule_trace.filter(s => rules.includes(s.rule)).map(s => s.result),
    ['skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
}));

test('retention route_owner reserves the owning agent, the call reaches that agent and an alert is written', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true });
  const contact = await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
  const result = await ping({ callId: 'ret-1' });
  assert.equal(result.available, true);
  assert.equal(result.reason, 'accepted_retention_owner');
  assert.equal(result.agent_id, 'agent_y', 'the owner, not the round robin head agent_x');
  const row = await decision(result.decision_id);
  assert.deepEqual(step(row, 'existing_client_retention'), { rule: 'existing_client_retention', result: 'hit', mode: 'route_owner' });
  assert.equal(step(row, 'retention_owner').result, 'hit');
  for (const rule of ['cooldown_same_source', 'cooldown_any_source', 'repeat_shopper']) assert.equal(step(row, rule).result, 'skipped', rule);
  const [claim] = await q(`SELECT * FROM ping_claim_arrival($1,$2,'ret-1',$3,'{}',NULL,clock_timestamp())`, [callSid(401), PHONE, B.number]);
  assert.equal(claim.agent_id, 'agent_y');
  assert.equal(claim.claim_path, 'reserved');
  const [alert] = await alerts();
  assert.equal(alert.tenant_id, B.tenant);
  assert.equal(alert.contact_id, contact);
  assert.equal(alert.owner_agent_id, 'agent_y');
  assert.equal(alert.source_id, B.source);
  assert.equal(alert.campaign_id, ma);
  assert.equal(alert.decision_id, result.decision_id);
  assert.equal(alert.acknowledged_at, null);
}));

test('owner busy falls to the pool and still accepts as accepted_retention_owner', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true });
  await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
  await q(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id='agent_y'`);
  const result = await ping({ callId: 'ret-2' });
  assert.equal(result.reason, 'accepted_retention_owner');
  assert.equal(result.agent_id, 'agent_x');
  assert.equal(step(await decision(result.decision_id), 'retention_owner').result, 'pass');
  assert.equal((await alerts()).length, 1);
}));

test('the sticky owner is used when no sale names an agent, and a won opportunity makes a client', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true });
  await makeClient(db, { tenant: B.tenant, phone: PHONE, sale: 'opportunity', sticky: 'agent_y' });
  const result = await ping({ callId: 'ret-3' });
  assert.deepEqual([result.reason, result.agent_id], ['accepted_retention_owner', 'agent_y']);
}));

test('an open or deleted opportunity, a non-sale call, a test enrollment or a contact alone is not a client', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true });
  const cases = [{ sale: 'opportunity', status: 'open' }, { sale: 'opportunity', deleted: true },
    { sale: 'call', outcome: 'not_interested' }, { sale: 'none' }];
  for (const [index, variant] of cases.entries()) {
    const phone = `+1555010200${index}`;
    await makeClient(db, { tenant: B.tenant, phone, ownerSlug: 'agent_y', ...variant });
    const result = await ping({ phone, callId: `nc-${index}` });
    assert.equal(result.reason, 'accepted_full', JSON.stringify(variant));
    assert.equal(step(await decision(result.decision_id), 'existing_client_retention').result, 'pass');
    await releaseHolds();
  }
  const testSale = '+15550102009';
  const contact = await makeClient(db, { tenant: B.tenant, phone: testSale, ownerSlug: 'agent_y' });
  await q('UPDATE call_records SET is_test_enrollment=true WHERE contact_id=$1', [contact]);
  assert.equal((await ping({ phone: testSale, callId: 'nc-test' })).reason, 'accepted_full');
  // enrolled_pending_verification is a sale outcome.
  await makeClient(db, { tenant: B.tenant, phone: '+15550102010', ownerSlug: 'agent_y', outcome: 'enrolled_pending_verification' });
  assert.equal((await ping({ phone: '+15550102010', callId: 'nc-pend' })).reason, 'accepted_retention_owner');
}));

test('retention looks only at the evaluating tenant: another tenant\'s client is not a client here', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true });
  await makeClient(db, { tenant: BUYERS.east.tenant, phone: PHONE, ownerSlug: 'agent_east' });
  const result = await ping({ callId: 'ret-other' });
  assert.equal(result.reason, 'accepted_full');
  assert.equal((await alerts()).length, 0);
}));

test('reject_and_alert rejects with existing_client_retention and writes an alert', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true, retention_mode: 'reject_and_alert' });
  const contact = await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
  const result = await ping({ callId: 'ret-4' });
  assert.deepEqual([result.available, result.reason, result.agent_id], [false, 'existing_client_retention', null]);
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations'))[0].n, 0);
  const [alert] = await alerts();
  assert.deepEqual([alert.contact_id, alert.owner_agent_id, alert.decision_id], [contact, 'agent_y', result.decision_id]);
}));

test('no alert is written while PING_RETENTION_ALERTS_ENABLED is off, in either mode', () => inTx(async () => {
  await flags({ PING_RETENTION_ALERTS_ENABLED: false });
  try {
    await setCampaign(ma, { retention_enabled: true });
    await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
    assert.equal((await ping({ callId: 'ret-5' })).reason, 'accepted_retention_owner');
    await setCampaign(ma, { retention_mode: 'reject_and_alert' });
    assert.equal((await ping({ callId: 'ret-6' })).reason, 'existing_client_retention');
    assert.equal((await alerts()).length, 0);
  } finally { await flags(); }
}));

test('shadow decisions evaluate retention but never alert', () => inTx(async () => {
  await setCampaign(ma, { retention_enabled: true, engine_mode: 'shadow' });
  await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
  const result = await ping({ callId: 'ret-shadow', engine: 'shadow' });
  assert.deepEqual([result.reason, result.agent_id], ['accepted_retention_owner', 'agent_y']);
  assert.equal((await alerts()).length, 0);
}));

const publisherCall = (days, { tenant = B.tenant, source = B.source, phone = PHONE, kind = 'publisher', sid = null } = {}) =>
  q(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,source_kind,lead_source_id,created_at)
    VALUES($1,$2,$3,$4,$5,${ago(days)})`, [tenant, sid, phone, kind, source]);

test('cooldown_same_source: a publisher call from the same source on day N-1 rejects, day N+1 accepts', () => inTx(async () => {
  await setCampaign(ma, { cooldown_same_source_days: 30 });
  await publisherCall(29);
  const hit = await ping({ callId: 'cd-1' });
  assert.equal(hit.reason, 'cooldown_same_source');
  assert.equal(step(await decision(hit.decision_id), 'cooldown_same_source').result, 'hit');
  await q('DELETE FROM inbound_calls');
  await publisherCall(31);
  const ok = await ping({ callId: 'cd-2' });
  assert.equal(ok.reason, 'accepted_full');
  assert.equal(step(await decision(ok.decision_id), 'cooldown_same_source').result, 'pass');
}));

test('cooldown_same_source matches by duplicate_phone_key and ignores other sources, direct calls and other tenants', () => inTx(async () => {
  await setCampaign(ma, { cooldown_same_source_days: 30 });
  const other = '0e000000-0000-4000-8000-0000000000b7';
  await q(`INSERT INTO lead_sources(id,tenant_id,name,type,active) VALUES($1,$2,'Other Publisher','publisher',true)`, [other, B.tenant]);
  await publisherCall(1, { source: other });
  await publisherCall(1, { kind: 'direct' });
  await publisherCall(1, { tenant: BUYERS.east.tenant });
  assert.equal((await ping({ callId: 'cd-3' })).reason, 'accepted_full');
  await releaseHolds();
  await publisherCall(1, { phone: '(555) 010-1001' });
  assert.equal((await ping({ callId: 'cd-4' })).reason, 'cooldown_same_source', 'a ten digit number matches its E.164 key');
}));

test('cooldown_any_source: a publisher call from any source on day N-1 rejects, day N+1 accepts', () => inTx(async () => {
  await setCampaign(ma, { cooldown_any_source_days: 7 });
  const other = '0e000000-0000-4000-8000-0000000000b8';
  await q(`INSERT INTO lead_sources(id,tenant_id,name,type,active) VALUES($1,$2,'Another Publisher','publisher',true)`, [other, B.tenant]);
  await publisherCall(6, { source: other });
  const hit = await ping({ callId: 'ca-1' });
  assert.equal(hit.reason, 'cooldown_any_source');
  const row = await decision(hit.decision_id);
  assert.equal(step(row, 'cooldown_same_source').result, 'skipped');
  assert.equal(step(row, 'cooldown_any_source').result, 'hit');
  await q('DELETE FROM inbound_calls');
  await publisherCall(8, { source: other });
  assert.equal((await ping({ callId: 'ca-2' })).reason, 'accepted_full');
}));

test('cooldowns count an exchange call matched to this tenant\'s decision, and existing clients bypass them', () => inTx(async () => {
  await setCampaign(ma, { cooldown_any_source_days: 7, retention_enabled: true });
  const sid = callSid(402);
  await publisherCall(2, { kind: 'direct', source: null, sid });
  await q(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,available,reason,engine,matched_call_sid,received_at)
    VALUES($1,$2,$3,true,'accepted_full','exchange',$4,now()-interval '2 days')`, [B.tenant, OP.source, ma, sid]);
  assert.equal((await ping({ callId: 'ca-3' })).reason, 'cooldown_any_source');
  await makeClient(db, { tenant: B.tenant, phone: PHONE, ownerSlug: 'agent_y' });
  const client = await ping({ callId: 'ca-4' });
  assert.equal(client.reason, 'accepted_retention_owner');
  assert.equal(step(await decision(client.decision_id), 'cooldown_any_source').result, 'skipped');
}));

// A second exchange publisher in its own tenant, routed to the same buyers.
const OP2 = { tenant: '0e000000-0000-4000-8000-0000000000aa', source: '0e000000-0000-4000-8000-0000000000ba', hash: 'f'.repeat(64) };
async function seedSecondPublisher() {
  await q('INSERT INTO tenants VALUES($1)', [OP2.tenant]);
  await q(`INSERT INTO lead_sources(id,tenant_id,name,type,active,ping_key_hash) VALUES($1,$2,'Second Publisher','publisher',true,$3)`,
    [OP2.source, OP2.tenant, OP2.hash]);
  await q(`INSERT INTO exchange_sources(source_id,strategy) VALUES($1,'priority_waterfall')`, [OP2.source]);
  await q(`INSERT INTO exchange_routes(source_id,campaign_id,priority,weight)
    SELECT $1,campaign_id,priority,weight FROM exchange_routes WHERE source_id=$2`, [OP2.source, OP.source]);
}
const SHOPPER = '+15550103001';
const exchangeAs = (key, n) => exchangePing(db, { key, phone: SHOPPER, callId: `rs-${key[0]}-${n}` });
async function repeatShopperSetup() {
  await seedSecondPublisher();
  for (const key of Object.keys(BUYERS)) {
    await setCampaign(campaigns[key], { repeat_shopper_threshold: 2, repeat_shopper_window_days: 30 });
  }
}

test('repeat shopper pools across two publishers in different tenants once pooling and the exchange flag are on', () => inTx(async () => {
  await repeatShopperSetup();
  await q('UPDATE platform_settings SET pooled_shopper_enabled=true');
  assert.equal((await exchangeAs(OP.hash, 1)).available, true);
  await releaseHolds();
  assert.equal((await exchangeAs(OP2.hash, 1)).available, true);
  await releaseHolds();
  const rows = await q('SELECT phone_hash,tenant_id,source_id FROM shopper_history ORDER BY tenant_id');
  assert.deepEqual(rows.map(row => [row.phone_hash, row.tenant_id]),
    [[fixturePhoneHash(SHOPPER), OP.tenant], [fixturePhoneHash(SHOPPER), OP2.tenant]]);
  const third = await exchangeAs(OP.hash, 2);
  assert.deepEqual([third.available, third.reason], [false, 'exchange_no_buyer']);
  const [auction] = await q('SELECT candidates FROM exchange_auctions WHERE id=$1', [third.auction_id]);
  assert.deepEqual(auction.candidates.map(c => c.reason), ['repeat_shopper', 'repeat_shopper', 'repeat_shopper']);
  assert.equal((await q('SELECT count(*)::int n FROM shopper_history'))[0].n, 2, 'one row per hash, source and day');
}));

test('repeat shopper is skipped and nothing is recorded while pooling is off', () => inTx(async () => {
  await repeatShopperSetup();
  for (const [index, key] of [OP.hash, OP2.hash, OP.hash].entries()) {
    const result = await exchangeAs(key, 10 + index);
    assert.equal(result.available, true);
    const [row] = await q(`SELECT rule_trace FROM ping_decisions WHERE engine='exchange' ORDER BY received_at DESC LIMIT 1`);
    assert.equal(step(row, 'repeat_shopper').result, 'skipped');
    await releaseHolds();
  }
  assert.equal((await q('SELECT count(*)::int n FROM shopper_history'))[0].n, 0);
}));

test('repeat shopper is skipped and nothing is recorded while PING_EXCHANGE_ENABLED is off, even with pooling on', () => inTx(async () => {
  await q('UPDATE platform_settings SET pooled_shopper_enabled=true');
  await setCampaign(ma, { repeat_shopper_threshold: 1, repeat_shopper_window_days: 30 });
  await flags({ PING_EXCHANGE_ENABLED: false });
  try {
    for (const n of [1, 2, 3]) {
      const result = await ping({ phone: SHOPPER, callId: `rsd-${n}` });
      assert.equal(result.reason, 'accepted_full');
      assert.equal(step(await decision(result.decision_id), 'repeat_shopper').result, 'skipped');
      await releaseHolds();
    }
    assert.equal((await q('SELECT count(*)::int n FROM shopper_history'))[0].n, 0);
  } finally { await flags(); }
  // With the flag back on, direct pings record and the rule applies.
  assert.equal((await ping({ phone: SHOPPER, callId: 'rsd-4' })).reason, 'accepted_full');
  await releaseHolds();
  const hit = await ping({ phone: SHOPPER, callId: 'rsd-5' });
  assert.equal(hit.reason, 'repeat_shopper');
}));

test('shopper_history is service role only and the count function returns an integer and nothing else', async () => {
  const [table] = await q(`SELECT relrowsecurity FROM pg_class WHERE relname='shopper_history'`);
  assert.equal(table.relrowsecurity, true);
  for (const role of ['anon', 'authenticated', 'public']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const sql = role === 'public'
        ? `SELECT bool_or(privilege_type=$1) IS TRUE ok FROM information_schema.role_table_grants WHERE table_name='shopper_history' AND grantee='PUBLIC'`
        : `SELECT has_table_privilege('${role}','shopper_history',$1) ok`;
      assert.equal((await q(sql, [privilege]))[0].ok, false, `${role} ${privilege}`);
    }
  }
  assert.equal((await q(`SELECT has_table_privilege('service_role','shopper_history','SELECT') ok`))[0].ok, true);
  for (const table of ['ping_retention_alerts', 'platform_settings']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_table_privilege($1,$2,$3) ok', [role, table, 'SELECT']))[0].ok, false);
    }
  }
  const [fn] = await q(`SELECT prorettype::regtype::text type,proretset,prosecdef,array_length(proallargtypes,1) outs
    FROM pg_proc WHERE oid='public.shopper_history_count(text,integer)'::regprocedure`);
  assert.deepEqual(fn, { type: 'integer', proretset: false, prosecdef: true, outs: null });
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await q(`SELECT has_function_privilege($1,'public.shopper_history_count(text,integer)','EXECUTE') ok`, [role]))[0].ok, false);
  }
  for (const sig of ['shopper_history_record(text,uuid,uuid)', 'ping_existing_client(uuid,text)',
    'ping_recent_publisher_call(uuid,text,uuid,timestamptz,timestamptz)', 'ping_campaign_accepted_today(uuid,jsonb,timestamptz)']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await q(`SELECT has_function_privilege($1,$2,'EXECUTE') ok`, [role, `public.${sig}`]))[0].ok, false, `${role} ${sig}`);
    }
  }
  await inTx(async () => {
    await q('UPDATE platform_settings SET pooled_shopper_enabled=true');
    await q(`INSERT INTO shopper_history VALUES($1,$2,$3,(now() AT TIME ZONE 'UTC')::date),($1,$4,$5,(now() AT TIME ZONE 'UTC')::date-40)`,
      [fixturePhoneHash(SHOPPER), OP.tenant, OP.source, B.tenant, B.source]);
    const [row] = await q('SELECT shopper_history_count($1,30) AS n', [fixturePhoneHash(SHOPPER)]);
    assert.deepEqual(row, { n: 1 }, 'a bare integer inside the window');
    await q('UPDATE platform_settings SET pooled_shopper_enabled=false');
    assert.equal((await q('SELECT shopper_history_count($1,30) AS n', [fixturePhoneHash(SHOPPER)]))[0].n, 0);
  });
});

test('daily budget rejects at daily_budget_calls accepted decisions across generic and exchange engines', () => inTx(async () => {
  await setCampaign(ma, { daily_budget_calls: 2 });
  await q(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,available,reason,engine)
    VALUES($1,$2,$3,true,'accepted_full','exchange')`, [B.tenant, OP.source, ma]);
  assert.equal((await ping({ callId: 'bd-1' })).reason, 'accepted_full');
  await releaseHolds();
  const capped = await ping({ callId: 'bd-2' });
  assert.equal(capped.reason, 'daily_budget_reached');
  assert.equal(step(await decision(capped.decision_id), 'daily_budget_reached').result, 'hit');
  // A re-ping inside the commitment replays and is not counted again.
  await setCampaign(ma, { daily_budget_calls: 3 });
  assert.equal((await ping({ callId: 'bd-3' })).reason, 'accepted_full');
  const replay = await ping({ callId: 'bd-3' });
  assert.equal(replay.reason, 'accepted_full');
  assert.equal(step(await decision(replay.decision_id), 'commitment_replay').result, 'hit');
  assert.equal((await q(`SELECT ping_campaign_accepted_today($1,$2,clock_timestamp()) n`, [ma, { timezone: 'America/Chicago' }]))[0].n, 3);
}));

test('daily budget resets at midnight in a Pacific tenant, not at Eastern midnight', () => inTx(async () => {
  const pacific = campaigns.pacific;
  await setCampaign(pacific, { daily_budget_calls: 2 });
  const accepted = at => q(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,available,reason,engine,received_at)
    VALUES($1,$2,$3,true,'accepted_full','exchange',$4)`, [BUYERS.pacific.tenant, OP.source, pacific, at]);
  // 2026-11-17 01:00 and 21:30 Pacific; the second is after Eastern midnight (05:00Z).
  await accepted('2026-11-17T09:00:00Z');
  await accepted('2026-11-18T05:30:00Z');
  const count = (zone, at) => q('SELECT ping_campaign_accepted_today($1,$2,$3) n', [pacific, { timezone: zone }, at]);
  assert.equal((await count('America/Los_Angeles', '2026-11-18T07:30:00Z'))[0].n, 2, '23:30 Pacific: both today');
  assert.equal((await count('America/New_York', '2026-11-18T07:30:00Z'))[0].n, 1, 'Eastern would already have reset');
  assert.equal((await count('America/Los_Angeles', '2026-11-18T08:30:00Z'))[0].n, 0, '00:30 Pacific: reset');
  // End to end against the buyer's own hours: Pacific tenant hours drive the rule.
  await q(`UPDATE exchange_routes SET active=(campaign_id=$1) WHERE source_id=$2`, [pacific, OP.source]);
  for (const n of [1, 2]) await accepted(new Date(Date.now() - n * 1000).toISOString());
  const result = await exchangePing(db, { phone: '+15550104001', callId: 'bd-px' });
  assert.equal(result.reason, 'exchange_no_buyer');
  const [row] = await q(`SELECT reason FROM ping_decisions WHERE campaign_id=$1 AND engine='exchange_eval' ORDER BY received_at DESC LIMIT 1`, [pacific]);
  assert.equal(row.reason, 'daily_budget_reached');
}));
