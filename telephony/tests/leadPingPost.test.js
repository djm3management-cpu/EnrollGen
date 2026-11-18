// S9 lead ping-post in PGlite: direct and exchange lead pings, lead hours,
// budgets, the 60 second post window, consent, the post field allowlist,
// retention, duplicates, contact reuse, New Lead opportunities, round robin,
// billing, usage and loser privacy. Synthetic identities only.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures } from './helpers/pingDb.js';
import { B, seedPublisherB } from './helpers/pingS2Db.js';
import { OP, BUYERS, seedExchange, allWeek } from './helpers/exchangeDb.js';
import { makeClient } from './helpers/pingS4Db.js';
import { createS9Db, S9_FEATURES, seedLeadCampaign, leadPing, exchangeLeadPing, leadPostAccept, leadPost,
  TRUSTEDFORM, JORNAYA } from './helpers/pingS9Db.js';

let db; let direct; let lead = {};
const count = async (table, where = 'true', args = []) =>
  Number((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, args)).rows[0].n);
const ping = (payload = {}, options = {}) => leadPing(db, { key: B.hash, payload: { state: 'KS', zip: '66002',
  product_line: 'ma', sub_id: 'sub-1', ...payload }, ...options });
const post = (id, payload = {}, key = B.hash) => leadPostAccept(db, { key, id, payload: leadPost(payload) });
const setCampaign = (fields, id = direct) => db.query(`UPDATE ping_campaigns SET ${Object.keys(fields)
  .map((key, i) => `${key}=$${i + 2}`).join(',')} WHERE id=$1`, [id, ...Object.values(fields)]);

before(async () => {
  db = await createS9Db();
  await setFeatures(db, S9_FEATURES);
  await seedPublisherB(db);
  direct = await seedLeadCampaign(db, { tenant: B.tenant, source: B.source });
  const calls = await seedExchange(db);
  for (const key of Object.keys(BUYERS)) {
    lead[key] = await seedLeadCampaign(db, { tenant: BUYERS[key].tenant, source: BUYERS[key].source, states: ['TX', 'FL'],
      carriers: ['aetna'], name: `lead-${key}`, price: 10 + BUYERS[key].priority });
    await db.query('INSERT INTO exchange_routes(source_id,campaign_id,priority,weight) VALUES($1,$2,$3,$4)',
      [OP.source, lead[key], BUYERS[key].priority, BUYERS[key].weight]);
  }
  lead.calls = calls;
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec(`DELETE FROM ping_retention_alerts; ALTER TABLE lead_billing DISABLE TRIGGER USER; DELETE FROM lead_billing;
    ALTER TABLE lead_billing ENABLE TRIGGER USER; DELETE FROM lead_posts;
    DELETE FROM lead_auctions; DELETE FROM lead_pings; DELETE FROM opportunities; DELETE FROM pipeline_stages;
    DELETE FROM pipelines; DELETE FROM call_records; DELETE FROM contacts; DELETE FROM data_vendor_settings;
    UPDATE exchange_sources SET strategy='priority_waterfall',lead_rotation_state='{}';`);
  await db.query(`UPDATE ping_campaigns SET lead_hours=NULL,lead_daily_budget=NULL,consent_required='any',
    lead_assignment='round_robin',exchange_daily_cap=NULL,exchange_hourly_cap=NULL,cooldown_same_source_days=NULL,
    cooldown_any_source_days=NULL,active=true WHERE channel='lead'`);
});

test('a direct lead ping is accepted 24/7 with a 60 second post window and stores no direct identifier', async () => {
  const r = await ping({ t65: true, consent_cert_id: TRUSTEDFORM });
  assert.equal(r.available, true);
  assert.equal(r.reason, 'accepted_full');
  assert.equal(Number(r.price), 12);
  const window = (new Date(r.post_expires_at) - Date.now()) / 1000;
  assert.ok(window > 55 && window <= 60, String(window));
  const { rows: [row] } = await db.query('SELECT * FROM lead_pings WHERE id=$1', [r.lead_ping_id]);
  assert.equal(row.tenant_id, B.tenant);
  assert.equal(row.campaign_id, direct);
  assert.deepEqual([row.state, row.zip, row.t65_flag, row.product_line, row.engine], ['KS', '66002', true, 'ma', 'generic']);
  assert.ok(row.rule_trace.some(step => step.rule === 'outside_staffed_hours' && step.result === 'open_24_7'));
  assert.equal(await count('platform_usage_events', "kind='lead_ping'"), 0, 'direct pings are not metered, as in S3');
});

test('a lead ping with a phone, name, email or address is invalid and stores nothing it was sent', async () => {
  for (const extra of [{ phone: '+15552010001' }, { first_name: 'X' }, { email: 'x@example.test' }, { address: '1 Main' }]) {
    const r = await ping(extra);
    assert.deepEqual([r.available, r.reason], [false, 'invalid_payload']);
  }
  const { rows } = await db.query('SELECT to_jsonb(l) AS j FROM lead_pings l');
  assert.ok(rows.every(row => !JSON.stringify(row.j).includes('5552010001')));
});

test('limited lead hours reject outside the window and accept inside it', async () => {
  const closed = { timezone: 'America/Chicago', days: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .map(day => [day, { enabled: false, start: '00:00', end: '23:59' }])) };
  await setCampaign({ lead_hours: closed });
  assert.equal((await ping()).reason, 'outside_staffed_hours');
  await setCampaign({ lead_hours: allWeek('America/Chicago') });
  assert.equal((await ping()).reason, 'accepted_full');
});

test('state, product line and inactive campaigns reject before the budget', async () => {
  assert.equal((await ping({ state: 'TX' })).reason, 'state_not_allowed');
  assert.equal((await ping({ product_line: 'medsupp' })).reason, 'campaign_inactive');
  await setCampaign({ active: false });
  assert.equal((await ping()).reason, 'campaign_inactive');
});

test('the daily lead budget counts open windows and accepted posts, not expired unposted pings', async () => {
  await setCampaign({ lead_daily_budget: 1 });
  const first = await ping();
  assert.equal(first.reason, 'accepted_full');
  assert.equal((await ping()).reason, 'daily_budget_reached');
  await db.query("UPDATE lead_pings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [first.lead_ping_id]);
  const second = await ping();
  assert.equal(second.reason, 'accepted_full');
  assert.equal((await post(second.lead_ping_id)).accepted, true);
  assert.equal((await ping()).reason, 'daily_budget_reached');
});

test('a post inside the window creates the contact, a New Lead opportunity, billing and one usage event', async () => {
  await db.query(`INSERT INTO platform_price_plans(tenant_id,per_lead_accepted,effective_at) VALUES($1,2.5,now()-interval '1 day')
    ON CONFLICT (tenant_id) DO UPDATE SET per_lead_accepted=2.5`, [B.tenant]);
  const r = await ping({ consent_cert_id: TRUSTEDFORM });
  await setCampaign({ lead_price: 99 });
  const result = await post(r.lead_ping_id);
  await setCampaign({ lead_price: 12 });
  assert.deepEqual(result, { authorized: true, accepted: true, reason: 'accepted' });
  const { rows: [p] } = await db.query('SELECT * FROM lead_posts WHERE lead_ping_id=$1', [r.lead_ping_id]);
  assert.equal(p.status, 'accepted');
  assert.equal(p.consent_kind, 'trustedform');
  const { rows: [contact] } = await db.query('SELECT * FROM contacts WHERE id=$1', [p.contact_id]);
  assert.deepEqual([contact.tenant_id, contact.phone, contact.source, contact.first_name],
    [B.tenant, '+15552010001', 'ping_lead', 'Synthetic']);
  const { rows: [opp] } = await db.query(`SELECT o.*,s.name AS stage FROM opportunities o
    JOIN pipeline_stages s ON s.id=o.stage_id WHERE o.id=$1`, [p.opportunity_id]);
  assert.deepEqual([opp.stage, opp.line_of_business, opp.contact_id, opp.assigned_agent_id, opp.lead_source_id],
    ['New Lead', 'MA', contact.id, p.assigned_agent_id, B.source]);
  const { rows: [bill] } = await db.query('SELECT * FROM lead_billing WHERE lead_post_id=$1', [p.id]);
  assert.equal(Number(bill.price), 12, 'billed at the ping snapshot, not the later price');
  await assert.rejects(db.query('UPDATE lead_billing SET price=1'), /immutable/);
  const { rows: usage } = await db.query("SELECT * FROM platform_usage_events WHERE kind='lead_accepted' AND ref_id=$1", [p.id]);
  assert.deepEqual(usage.map(u => [u.tenant_id, Number(u.unit_price), u.ref_id]), [[B.tenant, 2.5, p.id]]);
  assert.ok((await db.query('SELECT posted_at FROM lead_pings WHERE id=$1', [r.lead_ping_id])).rows[0].posted_at);
  // No posted identifier is kept outside the contact.
  const stored = JSON.stringify((await db.query('SELECT to_jsonb(p) j FROM lead_posts p')).rows);
  assert.ok(!stored.includes('5552010001') && !stored.includes('Synthetic') && !stored.includes('example.test'));
});

test('a post after the window is rejected as lead_window_expired with no contact or billing', async () => {
  const r = await ping();
  await db.query("UPDATE lead_pings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [r.lead_ping_id]);
  const result = await post(r.lead_ping_id);
  assert.deepEqual([result.accepted, result.reason], [false, 'lead_window_expired']);
  assert.equal(await count('lead_posts', "status='rejected' AND reason='lead_window_expired'"), 1);
  assert.equal(await count('contacts'), 0);
  assert.equal(await count('lead_billing'), 0);
});

test('consent is required per campaign on the post, and a mismatched certificate is refused at the ping', async () => {
  await setCampaign({ consent_required: 'trustedform' });
  assert.equal((await ping({ consent_cert_id: JORNAYA })).reason, 'consent_missing');
  const noCert = await ping();
  assert.equal((await post(noCert.lead_ping_id, { consent_cert_id: null })).reason, 'consent_missing');
  const wrong = await ping();
  assert.equal((await post(wrong.lead_ping_id, { consent_cert_id: JORNAYA })).reason, 'consent_missing');
  const right = await ping();
  assert.equal((await post(right.lead_ping_id, { consent_cert_id: TRUSTEDFORM })).accepted, true);
  await setCampaign({ consent_required: 'jornaya' });
  const jornaya = await ping({ consent_cert_id: JORNAYA });
  assert.equal((await post(jornaya.lead_ping_id, { consent_cert_id: undefined })).accepted, true, 'the ping certificate carries over');
  await setCampaign({ consent_required: 'any' });
  const garbage = await ping();
  assert.equal((await post(garbage.lead_ping_id, { consent_cert_id: 'not-a-certificate' })).reason, 'consent_missing');
});

test('MBI, DOB, SSN and any unknown post field are invalid_payload, write nothing and leave the window open', async () => {
  const r = await ping();
  for (const extra of [{ mbi: '1EG4TE5MK73' }, { dob: '1950-01-01' }, { ssn: '000-00-0000' }, { medications: 'x' },
    { phone: '555-201-0001' }, { state: 'MO' }, { zip: '66003' }, { first_name: 7 }]) {
    const result = await post(r.lead_ping_id, extra);
    assert.deepEqual([result.accepted, result.reason], [false, 'invalid_payload'], JSON.stringify(extra));
  }
  assert.equal(await count('lead_posts'), 0);
  assert.equal(await count('contacts'), 0);
  assert.equal((await post(r.lead_ping_id)).accepted, true);
});

test('an existing client is rejected for retention, alerted, and never sold to its own buyer', async () => {
  const client = await makeClient(db, { tenant: B.tenant, phone: '+15552010001', ownerSlug: 'agent_y' });
  const r = await ping();
  const result = await post(r.lead_ping_id);
  assert.deepEqual([result.accepted, result.reason], [false, 'existing_client_retention']);
  const { rows: [alert] } = await db.query('SELECT * FROM ping_retention_alerts');
  assert.equal(alert.contact_id, client);
  assert.equal(alert.owner_agent_id, 'agent_y');
  assert.equal(alert.decision_id, null);
  assert.equal(alert.lead_post_id, (await db.query('SELECT id FROM lead_posts')).rows[0].id);
  assert.equal(await count('lead_billing'), 0);
  assert.equal(await count('opportunities'), 0);
  assert.equal(await count('platform_usage_events', "kind='lead_accepted' AND ref_id IN (SELECT id::text FROM lead_posts)"), 0);
});

test('the S4 cooldowns apply to posts using earlier accepted lead posts', async () => {
  await setCampaign({ cooldown_same_source_days: 30 });
  const first = await ping();
  assert.equal((await post(first.lead_ping_id)).accepted, true);
  const second = await ping();
  assert.equal((await post(second.lead_ping_id)).reason, 'cooldown_same_source');
  const other = await ping();
  assert.equal((await post(other.lead_ping_id, { phone: '+15552010002' })).accepted, true);
});

test('a second post for the same ping is duplicate_lead with no new rows', async () => {
  const r = await ping();
  assert.equal((await post(r.lead_ping_id)).accepted, true);
  const before = await Promise.all(['lead_posts', 'contacts', 'opportunities', 'lead_billing', 'platform_usage_events']
    .map(table => count(table)));
  const again = await post(r.lead_ping_id, { phone: '+15552010009' });
  assert.deepEqual(again, { authorized: true, accepted: false, reason: 'duplicate_lead' });
  const afterCounts = await Promise.all(['lead_posts', 'contacts', 'opportunities', 'lead_billing', 'platform_usage_events']
    .map(table => count(table)));
  assert.deepEqual(afterCounts, before);
});

test('a post reuses the contact by phone identity without overwriting it', async () => {
  const { rows: [existing] } = await db.query(`INSERT INTO contacts(tenant_id,phone,first_name,source)
    VALUES($1,'+15552010001','Kept','manual') RETURNING id`, [B.tenant]);
  const r = await ping();
  assert.equal((await post(r.lead_ping_id)).accepted, true);
  assert.equal(await count('contacts'), 1);
  const { rows: [p] } = await db.query('SELECT contact_id FROM lead_posts');
  assert.equal(p.contact_id, existing.id);
  assert.equal((await db.query('SELECT first_name FROM contacts')).rows[0].first_name, 'Kept');
});

test('round robin alternates the campaign eligible agents; unassigned leaves the lead unassigned', async () => {
  const assigned = [];
  for (let n = 1; n <= 3; n++) {
    const r = await ping();
    assert.equal((await post(r.lead_ping_id, { phone: `+1555201000${n}` })).accepted, true);
    const { rows: [row] } = await db.query(`SELECT a.agent_slug FROM lead_posts p JOIN tenant_agents a ON a.id=p.assigned_agent_id
      WHERE p.lead_ping_id=$1`, [r.lead_ping_id]);
    assigned.push(row.agent_slug);
  }
  assert.deepEqual(assigned, ['agent_x', 'agent_y', 'agent_x']);
  await setCampaign({ lead_assignment: 'unassigned' });
  const r = await ping();
  assert.equal((await post(r.lead_ping_id, { phone: '+15552010004' })).accepted, true);
  const { rows: [row] } = await db.query(`SELECT p.assigned_agent_id,o.assigned_agent_id AS opp FROM lead_posts p
    JOIN opportunities o ON o.id=p.opportunity_id WHERE p.lead_ping_id=$1`, [r.lead_ping_id]);
  assert.deepEqual([row.assigned_agent_id, row.opp], [null, null]);
});

test('an exchange lead ping picks one winner, meters every evaluated candidate and stores no loser data', async () => {
  const r = await exchangeLeadPing(db, { key: OP.hash, payload: { state: 'TX', zip: '75001', product_line: 'ma',
    consent_cert_id: TRUSTEDFORM } });
  assert.deepEqual([r.available, r.reason, Number(r.price)], [true, 'accepted_full', 11]);
  const { rows } = await db.query('SELECT * FROM lead_pings');
  assert.equal(rows.length, 1, 'one row per ping, never one per loser');
  assert.deepEqual([rows[0].tenant_id, rows[0].campaign_id, rows[0].engine], [BUYERS.east.tenant, lead.east, 'exchange']);
  const { rows: [auction] } = await db.query('SELECT * FROM lead_auctions');
  assert.equal(auction.winner_campaign_id, lead.east);
  assert.equal(auction.candidate_count, 3);
  assert.ok(auction.candidates.every(c => Object.keys(c).sort().join() === 'available,campaign_id,price,reason'));
  assert.ok(!JSON.stringify(auction.candidates).includes('75001'));
  const { rows: usage } = await db.query("SELECT tenant_id FROM platform_usage_events WHERE kind='lead_ping' AND ref_id LIKE $1",
    [`${r.lead_ping_id}:%`]);
  assert.deepEqual(usage.map(u => u.tenant_id).sort(), Object.values(BUYERS).map(b => b.tenant).sort());
  // The call exchange never sees lead campaigns, and the lead exchange never sees call campaigns.
  assert.ok(!auction.candidates.some(c => Object.values(lead.calls).includes(c.campaign_id)));
  // The winner's post lands only in the winner's tenant.
  const result = await post(r.lead_ping_id, { state: 'TX', zip: '75001' }, OP.hash);
  assert.equal(result.accepted, true);
  const { rows: [contact] } = await db.query('SELECT tenant_id FROM contacts');
  assert.equal(contact.tenant_id, BUYERS.east.tenant);
  const { rows: [opp] } = await db.query('SELECT lead_source_id FROM opportunities');
  assert.equal(opp.lead_source_id, null, 'the publisher source belongs to another tenant');
  // Another publisher cannot post to this ping.
  assert.equal((await post(r.lead_ping_id, { state: 'TX', zip: '75001' }, B.hash)).reason, 'invalid_payload');
});

test('exchange strategies and caps: highest price, buyer caps, and no buyer', async () => {
  await db.query("UPDATE exchange_sources SET strategy='highest_price'");
  const priced = await exchangeLeadPing(db, { key: OP.hash, payload: { state: 'TX' } });
  assert.equal((await db.query('SELECT campaign_id FROM lead_pings WHERE id=$1', [priced.lead_ping_id])).rows[0].campaign_id, lead.pacific);
  await db.query("UPDATE exchange_sources SET strategy='priority_waterfall'");
  await setCampaign({ exchange_daily_cap: 0 }, lead.east);
  const capped = await exchangeLeadPing(db, { key: OP.hash, payload: { state: 'TX' } });
  assert.equal((await db.query('SELECT campaign_id FROM lead_pings WHERE id=$1', [capped.lead_ping_id])).rows[0].campaign_id, lead.central);
  const { rows: [auction] } = await db.query('SELECT candidates FROM lead_auctions WHERE lead_ping_id=$1', [capped.lead_ping_id]);
  assert.equal(auction.candidates.find(c => c.campaign_id === lead.east).reason, 'buyer_cap_reached');
  const none = await exchangeLeadPing(db, { key: OP.hash, payload: { state: 'KS' } });
  assert.deepEqual([none.available, none.reason], [false, 'exchange_no_buyer']);
  const { rows: [row] } = await db.query('SELECT tenant_id,campaign_id FROM lead_pings WHERE id=$1', [none.lead_ping_id]);
  assert.deepEqual([row.tenant_id, row.campaign_id], [null, null]);
});

test('weighted rotation for leads keeps its own state and leaves the call rotation untouched', async () => {
  await db.query("UPDATE exchange_sources SET strategy='weighted_rotation',rotation_state='{\"x\":1}'");
  const winners = [];
  for (let n = 0; n < 4; n++) {
    const r = await exchangeLeadPing(db, { key: OP.hash, payload: { state: 'TX' } });
    winners.push((await db.query('SELECT campaign_id FROM lead_pings WHERE id=$1', [r.lead_ping_id])).rows[0].campaign_id);
  }
  assert.equal(winners.filter(id => id === lead.central).length, 2, 'central has weight 2 of 4');
  const { rows: [xs] } = await db.query('SELECT rotation_state,lead_rotation_state FROM exchange_sources');
  assert.deepEqual(xs.rotation_state, { x: 1 });
  assert.ok(Object.keys(xs.lead_rotation_state).length === 3);
  await db.query("UPDATE exchange_sources SET rotation_state='{}'");
});

test('lead campaigns are invisible to call pings', async () => {
  // Publisher B has two call campaigns and one lead campaign; a call ping by
  // the lead campaign's name never reaches it.
  const { rows: [r] } = await db.query('SELECT ping_decide($1,$2,$3,$4) AS d', [B.hash, 'web-leads',
    { phone: '+15552010001', state: 'KS', call_id: 'c1', routing_enabled: true }, 'generic']);
  assert.equal(r.d.reason, 'campaign_inactive');
  assert.equal((await db.query('SELECT campaign_id FROM ping_decisions WHERE id=$1', [r.d.decision_id])).rows[0].campaign_id, null);
});
