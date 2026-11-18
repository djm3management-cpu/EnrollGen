// End to end for RTS eligibility generation (migrations 181 and 182) on
// PGlite. Publisher B's tenant gets an 'rts' campaign and carrier_rts rows
// that cover licensed and unlicensed states, terminated and not yet effective
// appointments, a missing certification year, non MA product lines, an
// unmapped carrier, an unlinked agent and a status that is not active. The
// Paragon campaign and B's manual campaigns stay on their manual matrix.
// Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide, migration, tenant as paragonTenant } from './helpers/pingDb.js';
import { seedPublisherB, B } from './helpers/pingS2Db.js';
import { createS6Db, MIGRATIONS_S6, S6_FEATURES } from './helpers/pingS6Db.js';

let db; let campaigns; let rtsCampaign; let paragonCampaign;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const agentId = async slug => (await q('SELECT id FROM tenant_agents WHERE agent_slug=$1', [slug]))[0].id;
const generate = async campaign => (await q('SELECT generate_rts_eligibility($1) AS r', [campaign]))[0].r;
const rtsRows = async () => q(`SELECT t.agent_slug AS agent,e.state,e.carrier,e.enabled,e.origin FROM agent_campaign_carriers e
  JOIN tenant_agents t ON t.id=e.agent_id WHERE e.campaign_id=$1 ORDER BY 1,2,3,5`, [rtsCampaign]);
const allCarrierRows = async () => q(`SELECT campaign_id,plan_year,agent_id,state,carrier,enabled,origin,updated_by
  FROM agent_campaign_carriers ORDER BY campaign_id,plan_year,agent_id,state,carrier`);
const tier = async (slug, state) => (await q('SELECT ping_agent_tier($1,$2,$3) AS t', [slug, state, rtsCampaign]))[0].t;

// Open every day in a zone whose 23:59 closing minute is not now, so the
// decisions here never depend on the wall clock.
const zone = new Date().getUTCHours() === 23 ? 'Asia/Tokyo' : 'Etc/UTC';
const ALWAYS_OPEN = { timezone: zone, days: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  .map(day => [day, { enabled: true, start: '00:00', end: '23:59' }])) };

const CERT_2027 = [{ name: 'Humana 2027 MAPD Certification', status: 'complete', date: '2026-07-10' }];
const apt = (...states) => states.map(state => ({ state, sub_status: 'APT' }));

async function rts(slug, carrier, productLine, fields = {}) {
  await q(`INSERT INTO carrier_rts(tenant_id,carrier,product_line,agent_name,agent_id,status,state_appointments,
    certifications,effective_date,termination_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [fields.tenant ?? B.tenant, carrier, productLine, slug ?? 'Unlinked agent', slug ? await agentId(slug) : null,
    fields.status ?? 'Active', JSON.stringify(fields.states ?? apt('KS')), JSON.stringify(fields.certs ?? CERT_2027),
    fields.effective ?? '2020-01-01', fields.terminated ?? null]);
}

before(async () => {
  db = await createS6Db();
  await setFeatures(db, S6_FEATURES);
  campaigns = await seedPublisherB(db);
  paragonCampaign = (await q(`SELECT id FROM ping_campaigns WHERE tenant_id=$1`, [paragonTenant]))[0].id;
  rtsCampaign = (await q(`INSERT INTO ping_campaigns(tenant_id,source_id,name,product_line,engine_mode,allowed_states,
    required_carriers,critical_carriers,plan_year,pricing_model,rate,eligibility_source,staffed_hours_override)
    VALUES($1,$2,'ma-rts','ma','generic','{KS,MO,NE}','{aetna,humana,uhc}','{humana}',2027,'per_call',35,'rts',$3)
    RETURNING id`, [B.tenant, B.source, ALWAYS_OPEN]))[0].id;
  // agent_x is licensed in KS and MO on the roster; agent_y only in KS, through enrolled_agents.
  await q(`UPDATE tenant_agents SET licensed_states='["KS","MO"]' WHERE agent_slug='agent_x'`);
  await q(`UPDATE tenant_agents SET clerk_user_id='clerk_y' WHERE agent_slug='agent_y'`);
  await q(`INSERT INTO enrolled_agents(tenant_id,clerk_user_id,licensed_states) VALUES($1,'clerk_y','{KS}')`, [B.tenant]);

  // Generated: x KS and MO humana, x KS aetna, y KS humana.
  await rts('agent_x', 'Humana', 'Medicare', { states: [...apt('KS', 'NE'), { state: 'MO', sub_status: 'JIT' }] });
  await rts('agent_x', 'Aetna - Silverscript', 'Medicare (MA/MAPD/PDP)', {
    states: [...apt('KS'), { state: 'MO', sub_status: 'PENDING' }],
    certs: [{ name: 'Aetna MA certification', status: 'complete', plan_year: 2027 }] });
  await rts('agent_y', 'Humana', 'Medicare Advantage', { states: apt('KS', 'MO') });
  // Skipped, one reason each.
  await rts('agent_x', 'United Healthcare', 'Medicare (MA/MAPD/Med Sup/PDP)', { terminated: '2021-06-30' });
  await rts('agent_y', 'Aetna Medicare', 'Medicare Advantage (MA/MAPD)', { effective: '2099-01-01' });
  await rts('agent_y', 'UnitedHealthcare', 'Medicare', { certs: [{ name: 'UHC 2026 certification', status: 'complete' }] });
  await rts('agent_y', 'Devoted Health', 'Medicare Advantage (MA/MAPD)', { certs: [{ name: 'Devoted 2027', status: 'incomplete' }] });
  await rts('agent_y', 'Humana', 'Medicare Supplement');
  await rts('agent_x', 'Aetna', 'PDP');
  await rts('agent_y', 'Clover (Medicare)', 'Medicare (MAPD)');
  await rts(null, 'Humana', 'Medicare');
  await rts('agent_x', 'WellCare', 'Medicare', { status: 'Needs Action' });
  await rts('agent_x', 'Devoted Health', 'Medicare Advantage (MA/MAPD)', { states: [] });
  // Another tenant's RTS never reaches B's campaign.
  await rts('agent_a', 'Humana', 'Medicare', { tenant: paragonTenant, states: apt('KS', 'AR') });
});
after(async () => db?.close());

test('181 and 182 carry the UNAPPLIED header, a transaction, the platform fence, no em dashes and no paragon_* changes', async () => {
  for (const name of MIGRATIONS_S6) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.match(sql, /deployment_feature_enabled\('PING_PLATFORM_ENABLED'\)/, name);
    assert.doesNotMatch(sql, /—/, name);
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION|VIEW|TRIGGER)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(CREATE|ALTER|DROP)\s+TABLE\s+(IF\s+\w+\s+)*(public\.)?zip_county_crosswalk\b/i, name);
  }
});

test('every existing campaign defaults to the manual matrix with both county switches off', async () => {
  const rows = await q(`SELECT name,eligibility_source,county_aware,county_filter FROM ping_campaigns WHERE name<>'ma-rts' ORDER BY name`);
  assert.deepEqual(rows.map(r => r.name), ['default', 'ma-central', 'medsupp-central']);
  for (const row of rows) assert.deepEqual([row.eligibility_source, row.county_aware, row.county_filter], ['manual', false, false]);
  const [origins] = await q(`SELECT count(*) FILTER (WHERE origin<>'manual')::int AS other FROM agent_campaign_carriers`);
  assert.equal(origins.other, 0);
});

test('generation on a manual campaign raises and leaves every carrier row untouched, Paragon included', async () => {
  const snapshot = await allCarrierRows();
  for (const campaign of [paragonCampaign, campaigns['ma-central']]) {
    await assert.rejects(generate(campaign), /requires eligibility_source rts/);
  }
  await assert.rejects(generate('0e000000-0000-4000-8000-00000000ffff'), /Unknown ping campaign/);
  assert.deepEqual(await allCarrierRows(), snapshot);
  assert.equal((await q('SELECT count(*)::int AS n FROM rts_eligibility_runs'))[0].n, 0);
});

test('generation is fenced by PING_PLATFORM_ENABLED', async () => {
  await setFeatures(db, { PING_PLATFORM_ENABLED: false });
  try { await assert.rejects(generate(rtsCampaign), /Ping platform disabled/); } finally { await setFeatures(db, S6_FEATURES); }
});

test('generation adds exactly the expected rows and logs every skipped reason', async () => {
  const paragonBefore = await q('SELECT * FROM agent_campaign_carriers WHERE campaign_id=$1 ORDER BY agent_id,state,carrier', [paragonCampaign]);
  const result = await generate(rtsCampaign);
  assert.equal(result.rows_added, 4);
  assert.equal(result.rows_removed, 0);
  assert.deepEqual(result.skipped_reasons, {
    agent_not_linked: 1, carrier_unmapped: 1, certification_missing: 2, no_state_appointments: 1,
    not_licensed: 2, not_ma_product_line: 2, not_yet_effective: 1, state_not_ready: 1, status_not_active: 1, terminated: 1,
  });
  assert.deepEqual(await rtsRows(), [
    { agent: 'agent_x', state: 'KS', carrier: 'aetna', enabled: true, origin: 'rts' },
    { agent: 'agent_x', state: 'KS', carrier: 'humana', enabled: true, origin: 'rts' },
    { agent: 'agent_x', state: 'MO', carrier: 'humana', enabled: true, origin: 'rts' },
    { agent: 'agent_y', state: 'KS', carrier: 'humana', enabled: true, origin: 'rts' },
  ]);
  const [run] = await q('SELECT * FROM rts_eligibility_runs WHERE id=$1', [result.run_id]);
  assert.deepEqual([run.tenant_id, run.campaign_id, run.plan_year, run.rows_added, run.rows_removed],
    [B.tenant, rtsCampaign, 2027, 4, 0]);
  assert.deepEqual(run.skipped_reasons, result.skipped_reasons);
  assert.deepEqual(await q('SELECT * FROM agent_campaign_carriers WHERE campaign_id=$1 ORDER BY agent_id,state,carrier', [paragonCampaign]),
    paragonBefore, 'the Paragon campaign is untouched');
  // A second run over the same RTS changes nothing.
  const again = await generate(rtsCampaign);
  assert.deepEqual([again.rows_added, again.rows_removed], [0, 0]);
});

test('generated rows drive tiers and decisions only for the rts campaign', async () => {
  assert.equal(await tier('agent_x', 'KS'), 'partial', 'aetna and humana, uhc missing');
  assert.equal(await tier('agent_x', 'MO'), 'partial');
  assert.equal(await tier('agent_y', 'KS'), 'partial');
  assert.equal(await tier('agent_y', 'MO'), 'ineligible', 'not licensed in MO, no row');
  const decision = await pingDecide(db, { state: 'KS', phone: '+15550106001', campaign: rtsCampaign, key: B.hash });
  assert.equal(decision.reason, 'accepted_partial');
  // Switching the campaign back to manual hides its generated rows at once.
  await q(`UPDATE ping_campaigns SET eligibility_source='manual' WHERE id=$1`, [rtsCampaign]);
  try {
    assert.equal(await tier('agent_x', 'KS'), 'ineligible');
    const manual = await pingDecide(db, { state: 'KS', phone: '+15550106002', campaign: rtsCampaign, key: B.hash });
    assert.equal(manual.reason, 'no_eligible_agent');
  } finally { await q(`UPDATE ping_campaigns SET eligibility_source='rts' WHERE id=$1`, [rtsCampaign]); }
  await q('DELETE FROM ping_reservations');
});

test('manual rows always win over generated rows', async () => {
  const y = await agentId('agent_y');
  const x = await agentId('agent_x');
  // A manual disable for a key RTS would generate, and a manual enable RTS would not.
  await q(`DELETE FROM agent_campaign_carriers WHERE campaign_id=$1 AND agent_id=$2 AND state='KS' AND carrier='humana'`, [rtsCampaign, y]);
  await q(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,enabled,updated_by)
    VALUES($1,$2,2027,$3,'KS','humana',false,'admin'),($1,$2,2027,$4,'KS','uhc',true,'admin')`, [B.tenant, rtsCampaign, y, x]);
  const result = await generate(rtsCampaign);
  assert.equal(result.rows_added, 0, 'the manual key is not re-added');
  assert.equal(result.rows_removed, 0, 'manual rows are never removed');
  assert.equal(result.skipped_reasons.manual_override, 1);
  const rows = await rtsRows();
  assert.deepEqual(rows.find(r => r.agent === 'agent_y' && r.carrier === 'humana'),
    { agent: 'agent_y', state: 'KS', carrier: 'humana', enabled: false, origin: 'manual' });
  assert.deepEqual(rows.find(r => r.agent === 'agent_x' && r.carrier === 'uhc'),
    { agent: 'agent_x', state: 'KS', carrier: 'uhc', enabled: true, origin: 'manual' });
  assert.equal(await tier('agent_y', 'KS'), 'ineligible', 'manual disable of the critical carrier wins');
  assert.equal(await tier('agent_x', 'KS'), 'full', 'manual uhc plus generated aetna and humana');
});

test('regeneration removes stale rts rows, including other plan years, and logs the counts', async () => {
  const x = await agentId('agent_x');
  await q(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by,origin)
    VALUES($1,$2,2026,$3,'KS','humana','rts-generator','rts')`, [B.tenant, rtsCampaign, x]);
  // agent_x loses the MO humana appointment.
  await q(`UPDATE carrier_rts SET state_appointments=$1 WHERE agent_id=$2 AND carrier='Humana' AND product_line='Medicare'`,
    [JSON.stringify(apt('KS', 'NE')), x]);
  const result = await generate(rtsCampaign);
  assert.deepEqual([result.rows_added, result.rows_removed], [0, 2]);
  assert.equal(result.skipped_reasons.not_licensed, 2);
  assert.equal(result.skipped_reasons.state_not_ready, 1);
  const rows = await rtsRows();
  assert.ok(!rows.some(r => r.agent === 'agent_x' && r.state === 'MO'));
  assert.equal((await q(`SELECT count(*)::int AS n FROM agent_campaign_carriers WHERE campaign_id=$1 AND plan_year<>2027`, [rtsCampaign]))[0].n, 0);
  assert.deepEqual(await q(`SELECT rows_added,rows_removed FROM rts_eligibility_runs WHERE campaign_id=$1 ORDER BY ran_at`, [rtsCampaign]),
    [{ rows_added: 4, rows_removed: 0 }, { rows_added: 0, rows_removed: 0 }, { rows_added: 0, rows_removed: 0 },
      { rows_added: 0, rows_removed: 2 }]);
  // A terminated appointment drops its row on the next run.
  await q(`UPDATE carrier_rts SET termination_date=current_date-1 WHERE agent_id=$1 AND carrier='Aetna - Silverscript'`, [x]);
  const terminated = await generate(rtsCampaign);
  assert.deepEqual([terminated.rows_added, terminated.rows_removed], [0, 1]);
  assert.equal(terminated.skipped_reasons.terminated, 2);
});

test('the run log and new tables are service role only', async () => {
  const grants = await q(`SELECT table_name,grantee FROM information_schema.role_table_grants
    WHERE table_name IN ('rts_eligibility_runs','carrier_aliases','ping_zip_county_crosswalk')
      AND grantee IN ('anon','authenticated','PUBLIC')`);
  assert.deepEqual(grants, []);
  const rls = await q(`SELECT relname,relrowsecurity FROM pg_class
    WHERE relname IN ('rts_eligibility_runs','carrier_aliases','ping_zip_county_crosswalk') ORDER BY relname`);
  assert.deepEqual(rls.map(r => r.relrowsecurity), [true, true, true]);
});
