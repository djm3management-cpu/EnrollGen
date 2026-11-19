// Gold Standards HTTP handlers on the complete fresh install: default off,
// administrator only, column mapping by stored configuration, narrative
// columns dropped and recorded, file idempotency through the real
// spreadsheet reader, aggregate CSV export written to the admin audit and the
// evidence trail, operator only network scope, and the activation handler's
// scoping. Synthetic data only; no network.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase } from './helpers/freshInstall.js';
import { freshInstallClient } from './helpers/freshInstallClient.js';
import { provisionDeployment } from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with { type: 'json' };
import roster from './fixtures/deployment-roster.json' with { type: 'json' };
import { featureHeaders } from '../telephony/src/lib/deploymentFeatures.js';
import { createGoldStandardsHandler } from '../netlify/functions/gold-standards.js';
import { createActivationTasksHandler } from '../netlify/functions/activation-tasks.js';
import { validateColumnMap, applyColumnMap, normalizeDate, goldCsv } from '../src/lib/goldStandards.js';

let pg; let db; let agents; let rosterRows;
const T = profile.tenantId;
const FLAGS = { GOLD_STANDARDS_METRICS_ENABLED: 'true', MEMBER_STATUS_IMPORT_ENABLED: 'true', CTM_IMPORT_ENABLED: 'true', BENEFIT_ACTIVATION_ENABLED: 'true' };
const env = { DEPLOYMENT_PROFILE_JSON: JSON.stringify(profile), ...FLAGS };
const q = (sql, args = []) => pg.query(sql, args).then(r => r.rows);
const auth = n => ({ userId: roster[n].clerk_user_id, orgId: profile.organizationId, tokenPayload: {} });
const aid = n => agents.find(a => a.clerk_user_id === roster[n].clerk_user_id).id;
async function service(flags = FLAGS) {
  await pg.exec('SET ROLE service_role');
  await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)", [JSON.stringify(featureHeaders(flags))]);
}
async function asOwner(work) { await pg.exec('RESET ROLE'); try { return await work(); } finally { await service(); } }
const gold = (n = 0, flags = env) => createGoldStandardsHandler({ env: flags, getDb: () => db, authenticate: async () => auth(n) });
const activation = (n = 1, flags = env) => createActivationTasksHandler({ env: flags, getDb: () => db, authenticate: async () => auth(n) });
const url = query => `https://example.invalid/api/gold-standards${query ? `?${query}` : ''}`;
const getJson = async (h, query) => { const r = await h(new Request(url(query))); return { status: r.status, body: await r.json().catch(() => null), response: r }; };
const postJson = async (h, body, base = url()) => { const r = await h(new Request(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
async function upload(h, { kind, carrier, csv, name = 'file.csv', asOf = '2026-11-01' }) {
  const form = new FormData();
  form.set('kind', kind); form.set('carrier', carrier); form.set('as_of', asOf);
  form.set('file', new File([csv], name, { type: 'text/csv' }));
  const r = await h(new Request(url('action=import'), { method: 'POST', body: form }));
  return { status: r.status, body: await r.json() };
}
const MEMBER_MAP = { columns: { confirmation: 'App ID', carrier_member_id: 'Member ID', event_type: 'Status', event_effective_date: 'Status Date' },
  values: { event_type: { ACTIVE: 'effectuated', TERMED: 'disenrolled' } }, date_format: 'mdy' };
const CTM_MAP = { columns: { confirmation: 'App ID', cms_complaint_id: 'CTM ID', received_date: 'Received', category: 'Category', status: 'Status' },
  values: { category: { MKT: 'marketing' }, status: { OPEN: 'open', CLOSED: 'resolved' } }, narrative_columns: ['Issue'] };

async function seedIntake(enrollmentId, writer = 1) {
  const [contact, call, intake] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await asOwner(async () => {
    await q('INSERT INTO contacts(id,tenant_id,assigned_agent_id,phone) VALUES($1,$2,$3,$4)', [contact, T, roster[writer].agent_slug, `+1973555${String(Math.floor(Math.random() * 9000) + 1000)}`]);
    await q(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,contact_id,call_type,call_direction,product_type,call_start)
      VALUES($1,$2,$3,'Synthetic',$4,'enrollment','inbound','MA',clock_timestamp())`, [call, T, aid(writer), contact]);
    await q(`INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,completed_at,submitted_at)
      VALUES($1,$2,$3,$4,$5,'{}','Other','2025-11-20','2025-11-20')`, [intake, T, call, contact,
      JSON.stringify({ planType: 'MA/MAPD/PDP', contractId: 'S1234', planId: '1', newCarrier: 'Synthetic Carrier', effectiveDate: '2026-01-01', enrollmentId,
        writingAgentId: rosterRows.find(a => a.clerk_user_id === roster[writer].clerk_user_id).id })]);
  });
  return { intake, contact };
}

before(async () => {
  pg = await freshDatabase(); db = freshInstallClient(pg); await service();
  await provisionDeployment(db, roster, { DEPLOYMENT_PROFILE_JSON: JSON.stringify(profile) });
  agents = await q('SELECT id,clerk_user_id FROM enrolled_agents');
  rosterRows = await q('SELECT id,clerk_user_id FROM tenant_agents');
  await asOwner(() => q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}')", [T, roster[0].clerk_user_id]));
});
after(async () => { await pg?.close(); });
beforeEach(async () => { await service(); await asOwner(() => q('DELETE FROM admission_counters')); });

test('pure mapping: configuration validates, dates never guess, narrative headers are dropped and named', () => {
  assert.throws(() => validateColumnMap('member_status', { columns: { event_type: 'S' } }), /event_effective_date/);
  assert.throws(() => validateColumnMap('member_status', { columns: { event_type: 'S', event_effective_date: 'D' } }), /matching key/);
  assert.throws(() => validateColumnMap('ctm', { ...CTM_MAP, columns: { ...CTM_MAP.columns, narrative: 'Issue' } }), /Unknown field narrative/);
  assert.throws(() => validateColumnMap('ctm', { ...CTM_MAP, narrative_columns: ['CTM ID'] }), /cannot be mapped/);
  assert.equal(normalizeDate('2/30/2026', 'mdy'), '');
  assert.equal(normalizeDate('02/03/2026', 'mdy'), '2026-02-03');
  assert.equal(normalizeDate('2026-02-03', 'mdy'), '', 'the configured format only');
  const map = validateColumnMap('ctm', CTM_MAP);
  const { rows, dropped } = applyColumnMap('ctm', map, [{ 'App ID': 'A1', 'CTM ID': 'C1', Received: '2026-01-02', Category: 'mkt', Status: 'OPEN',
    Issue: 'Synthetic free text', 'Agent Comments': 'Synthetic', Phone: '+15550000000' }]);
  assert.deepEqual(rows, [{ row_number: 2, confirmation: 'A1', cms_complaint_id: 'C1', received_date: '2026-01-02', category: 'marketing', status: 'open' }]);
  assert.deepEqual(dropped, ['Issue', 'Agent Comments']);
  assert.ok(!JSON.stringify(rows).includes('Synthetic free text') && !JSON.stringify(rows).includes('+1555'));
  assert.match(goldCsv({ group_by: ['agency'], groups: [{ key: { agency: '=cmd' }, r_rdp: {}, calls: null }] }), /"'=cmd"/, 'formula cells are neutralized');
});

test('every handler is off by default and administrator only', async () => {
  const off = { DEPLOYMENT_PROFILE_JSON: env.DEPLOYMENT_PROFILE_JSON };
  assert.equal((await getJson(gold(0, off), 'action=context')).status, 404);
  assert.equal((await getJson(createActivationTasksHandler({ env: off, getDb: () => db, authenticate: async () => auth(1) }), '')).status, 404);
  assert.equal((await getJson(gold(1), 'action=context')).status, 403);
  const context = await getJson(gold(0), 'action=context');
  assert.equal(context.status, 200);
  assert.deepEqual(context.body.features, { metrics: true, member_import: true, ctm_import: true, activation: true, attestations: false });
});

test('imports use the stored carrier map, drop narrative, match, and the same file is a no-op', async () => {
  const s = await seedIntake('HTTP-1');
  const h = gold(0);
  assert.equal((await upload(h, { kind: 'member_status', carrier: 'Synthetic Carrier', csv: 'App ID,Status,Status Date\nHTTP-1,ACTIVE,01/01/2026\n' })).status, 400, 'no map yet');
  assert.equal((await postJson(h, { action: 'save_map', kind: 'member_status', carrier: 'Synthetic Carrier', mapping: MEMBER_MAP })).status, 200);
  assert.equal((await postJson(gold(1), { action: 'save_map', kind: 'member_status', carrier: 'Synthetic Carrier', mapping: MEMBER_MAP })).status, 403);
  const csv = 'App ID,Member ID,Status,Status Date,Notes\nHTTP-1,M-100,ACTIVE,01/01/2026,Synthetic note text\nNOPE,M-101,ACTIVE,01/01/2026,\n';
  const first = await upload(h, { kind: 'member_status', carrier: 'Synthetic Carrier', csv });
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.matched, first.body.queued, first.body.duplicate], [1, 1, false]);
  assert.deepEqual(first.body.dropped_columns, ['Notes']);
  const again = await upload(h, { kind: 'member_status', carrier: 'Synthetic Carrier', csv, name: 'renamed.csv' });
  assert.equal(again.body.duplicate, true);
  const [count] = await asOwner(() => q('SELECT count(*)::int n FROM member_status_events WHERE enrollment_intake_id=$1', [s.intake]));
  assert.equal(count.n, 1);
  const [log] = await asOwner(() => q("SELECT after_summary FROM admin_action_log WHERE action='gold_standards_import' ORDER BY occurred_at DESC LIMIT 1"));
  assert.deepEqual(log.after_summary.dropped_columns, ['Notes']);
  assert.ok(!JSON.stringify(await asOwner(() => q('SELECT * FROM member_status_import_files'))).includes('Synthetic note text'));
  const queue = await getJson(h, 'action=unmatched&kind=member_status');
  assert.equal(queue.body.rows.length, 1);
  assert.equal((await postJson(h, { action: 'link', row: queue.body.rows[0].id, enrollment_intake_id: s.intake, reason: 'Matched by carrier call' })).status, 200);
});

test('CTM import through the handler drops the narrative column and records that it was dropped', async () => {
  await seedIntake('HTTP-CTM');
  const h = gold(0);
  await postJson(h, { action: 'save_map', kind: 'ctm', carrier: 'Synthetic Carrier', mapping: CTM_MAP });
  const result = await upload(h, { kind: 'ctm', carrier: 'Synthetic Carrier', csv: 'App ID,CTM ID,Received,Category,Status,Issue\nHTTP-CTM,CTM9,2026-02-01,MKT,OPEN,Synthetic complaint narrative\n' });
  assert.equal(result.status, 200);
  assert.deepEqual([result.body.matched, result.body.dropped_columns], [1, ['Issue']]);
  const ctms = await getJson(h, 'action=ctms&status=open');
  assert.ok(ctms.body.rows.some(r => r.cms_complaint_id === 'CTM9' && r.category === 'marketing' && r.linked));
  assert.ok(!JSON.stringify(await asOwner(() => q('SELECT * FROM ctm_records'))).includes('Synthetic complaint narrative'));
});

test('scorecards: agency scope for admins, network scope for the operator only, and CSV export audited', async () => {
  const h = gold(0);
  const card = await getJson(h, 'action=scorecard&from=2025-01-01&to=2026-11-01&group=source');
  assert.equal(card.status, 200);
  assert.equal(card.body.scope, 'agency');
  assert.equal((await getJson(h, 'action=scorecard&from=2025-01-01&to=2026-11-01&group=bogus')).status, 400);
  const network = await getJson(h, 'action=network&from=2025-01-01&to=2026-11-01&group=agency');
  assert.equal(network.status, 200, 'the deployment tenant admin is the operator');
  const elsewhere = createGoldStandardsHandler({ env: { ...env, DEPLOYMENT_PROFILE_JSON: JSON.stringify({ ...profile, tenantId: '00000000-0000-4000-8000-0000000000ff' }) },
    getDb: () => db, authenticate: async () => auth(0) });
  assert.equal((await getJson(elsewhere, 'action=network&from=2025-01-01&to=2026-11-01')).status, 403);
  const before = (await asOwner(() => q("SELECT count(*)::int n FROM admin_action_log WHERE action='gold_standards_export'")))[0].n;
  const exported = await h(new Request(url('action=export&from=2025-01-01&to=2026-11-01&group=product_line')));
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type'), /text\/csv/);
  const text = await exported.text();
  assert.match(text.split('\n')[0], /^Product,Calls,Applications/);
  for (const forbidden of ['+1973555', 'Synthetic Member', '2026-01-01T']) assert.ok(!text.includes(forbidden));
  const after = (await asOwner(() => q("SELECT count(*)::int n FROM admin_action_log WHERE action='gold_standards_export'")))[0].n;
  assert.equal(after, before + 1);
  const trail = await asOwner(() => q("SELECT action,result FROM evidence_access_log WHERE resource_type='gold_standards' AND action='export'"));
  assert.ok(trail.some(r => r.result === 'allowed'));
});

test('activation handler: scoped reads, validated writes, and no outbound action anywhere in its source', async () => {
  await seedIntake('HTTP-ACT', 1);
  await upload(gold(0), { kind: 'member_status', carrier: 'Synthetic Carrier', csv: 'App ID,Status,Status Date\nHTTP-ACT,ACTIVE,01/01/2026\n' });
  const mine = await getJson(activation(1), 'status=open');
  assert.equal(mine.status, 200);
  const task = mine.body.rows.find(r => r.product_line === 'PDP');
  assert.ok(task, 'the PDP enrollment opened a task');
  assert.deepEqual(task.items.map(i => i.kind), ['member_card', 'pharmacy', 'member_reachable']);
  assert.ok(!(await getJson(activation(3), 'status=open')).body.rows.some(r => r.id === task.id));
  assert.equal((await getJson(activation(1), 'status=bogus')).status, 400);
  const base = 'https://example.invalid/api/activation-tasks';
  assert.equal((await postJson(activation(1), { action: 'record', item: task.items[0].id, outcome: 'maybe' }, base)).status, 400);
  assert.equal((await postJson(activation(1), { action: 'record', item: task.items[0].id, outcome: 'done' }, base)).status, 200);
  assert.equal((await postJson(activation(3), { action: 'close', task: task.id, status: 'cancelled' }, base)).status, 403);
  const { readFileSync } = await import('node:fs');
  for (const file of ['netlify/functions/activation-tasks.js', 'src/components/gold/ActivationTasks.jsx']) {
    const code = readFileSync(file, 'utf8').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    assert.doesNotMatch(code, /twilio|sendSms|sendEmail|resend|\bdial|messages\b|telephony_call_attempts|followup_queue|fetch\(/i, file);
  }
});
