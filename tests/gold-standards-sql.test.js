// Gold Standards migrations 188 and 189 on the complete fresh install: flags,
// the MBI key, deterministic matching in priority order, file idempotency, the
// unmatched queue and audited manual links, CTMs through the existing
// complaint hold, activation tasks, tenant isolation, operator aggregates,
// attribution and the lifecycle events. Synthetic data only.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase } from './helpers/freshInstall.js';
import { freshInstallClient } from './helpers/freshInstallClient.js';
import { provisionDeployment } from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with { type: 'json' };
import roster from './fixtures/deployment-roster.json' with { type: 'json' };
import { featureHeaders } from '../telephony/src/lib/deploymentFeatures.js';
import { computeGoldStandards } from '../telephony/src/ping/goldStandards.js';
import { TABLE_CLASS } from '../scripts/retention/inventory.js';

let pg; let db; let agents; let rosterRows; let seq = 100;
const T = profile.tenantId; const OTHER = 'e1880000-0000-4000-8000-0000000000f1';
const id = n => `e1880000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ON = { GOLD_STANDARDS_METRICS_ENABLED: 'true', MEMBER_STATUS_IMPORT_ENABLED: 'true', CTM_IMPORT_ENABLED: 'true',
  BENEFIT_ACTIVATION_ENABLED: 'true', CONSUMER_LIFECYCLE_ENABLED: 'true' };
const MBI = ['1EG4TE5MK72', '2EG4TE5MK73', '3EG4TE5MK74', '4EG4TE5MK75'];
const PEPPER = 'synthetic-mbi-pepper-for-tests-only-0123456789';
const auth = n => ({ p_actor: roster[n].clerk_user_id, p_org: profile.organizationId });
const aid = n => agents.find(a => a.clerk_user_id === roster[n].clerk_user_id).id;
const rid = n => rosterRows.find(a => a.clerk_user_id === roster[n].clerk_user_id).id;
const q = (sql, args = []) => pg.query(sql, args).then(r => r.rows);
async function service(flags = ON) {
  await pg.exec('SET ROLE service_role');
  await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",
    [JSON.stringify(featureHeaders({ ...flags }))]);
}
async function asOwner(work) { await pg.exec('RESET ROLE'); try { return await work(); } finally { await service(); } }
const rpc = async (name, args) => { const r = await db.rpc(name, args); if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code }); return r.data; };
const sha = n => n.toString(16).padStart(64, '0');

async function seedIntake({ writer = 1, tenant = T, data = {}, mbiKey = null, isTest = false, completed = true } = {}) {
  const contact = id(seq++); const call = id(seq++); const intake = id(seq++);
  await asOwner(async () => {
    await q('INSERT INTO contacts(id,tenant_id,assigned_agent_id,phone,first_name,last_name,state) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [contact, tenant, tenant === T ? roster[writer].agent_slug : null, `+1212555${String(seq).padStart(4, '0')}`, 'Synthetic', 'Member', 'NJ']);
    await q(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,contact_id,call_type,call_direction,product_type,call_start)
      VALUES($1,$2,$3,'Synthetic',$4,'enrollment','inbound','MA',clock_timestamp())`,
    [call, tenant, tenant === T ? aid(writer) : (await q('SELECT id FROM enrolled_agents WHERE tenant_id=$1 LIMIT 1', [tenant]))[0].id, contact]);
    const d = { planType: 'MA/MAPD/PDP', contractId: 'H1111', planId: '1', segmentId: '0', newCarrier: 'Synthetic Carrier', effectiveDate: '2026-01-01',
      ...(tenant === T ? { writingAgentId: rid(writer) } : {}), ...data };
    await q(`INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,completed_at,submitted_at,is_test_enrollment,mbi_match_key)
      VALUES($1,$2,$3,$4,$5,'{}','Other',$6,'2025-11-20',$7,$8)`, [intake, tenant, call, contact, JSON.stringify(d), completed ? '2025-11-20' : null, isTest, mbiKey]);
  });
  return { intake, contact, call };
}
const key = async mbi => (await asOwner(() => q('SELECT member_mbi_key($1) AS k', [mbi])))[0].k;
const importRows = (rows, { kind = 'member_status', carrier = 'Synthetic Carrier', file = seq++, asOf = '2026-11-01', who = 0, dropped = [] } = {}) =>
  rpc('member_status_import', { ...auth(who), p_kind: kind, p_carrier: carrier, p_file_hash: sha(file), p_as_of: asOf, p_rows: rows, p_dropped: dropped });
const events = intake => q('SELECT event_type,matched_by,event_effective_date::text d FROM member_status_events WHERE enrollment_intake_id=$1 ORDER BY seq', [intake]);

before(async () => {
  pg = await freshDatabase(); db = freshInstallClient(pg); await service();
  await provisionDeployment(db, roster, { DEPLOYMENT_PROFILE_JSON: JSON.stringify(profile) });
  agents = await q('SELECT id,clerk_user_id FROM enrolled_agents');
  rosterRows = await q('SELECT id,clerk_user_id FROM tenant_agents');
  await asOwner(async () => {
    await q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)", [T, roster[0].clerk_user_id, roster[2].clerk_user_id, [aid(1)]]);
    await q("INSERT INTO tenants(id,name) VALUES($1,'Synthetic other agency')", [OTHER]);
    await q("INSERT INTO enrolled_agents(tenant_id,clerk_user_id,name,is_active) VALUES($1,'user_other_agency','Other Agent',true)", [OTHER]);
    // A synthetic prior plan year landscape: HMO, PPO and a dual SNP.
    await q('CREATE TABLE public.cms_plans_py2026 (LIKE public.cms_plans_py2027 INCLUDING DEFAULTS INCLUDING IDENTITY)');
    for (const [contract, category, type, snp] of [['H1111', 'MA-PD', 'HMO', null], ['H2222', 'MA-PD', 'PPO', null], ['H3333', 'SNP', 'HMO', 'Dual-Eligible'], ['H4444', 'MA', 'HMO-POS', null]]) {
      await q(`INSERT INTO cms_plans_py2026(plan_year,category,state_code,county_name,county_fips,carrier,contract_id,plan_id,segment_id,contract_plan_segment_id,plan_name,plan_type,snp_type,source_file)
        VALUES(2026,$1,'NJ','Synthetic','34001','Synthetic Carrier',$2,'001','000',$2||'_001_000','Synthetic Plan',$3,$4,'synthetic')`, [category, contract, type, snp]);
    }
  });
});
after(async () => { await pg?.close(); });
beforeEach(async () => { await service(); await asOwner(() => q('DELETE FROM admission_counters')); });

test('every new routine is fenced: flags off refuse, and browser roles reach nothing', async () => {
  await service({});
  for (const [name, args] of [['member_status_import', { ...auth(0), p_kind: 'member_status', p_carrier: 'X', p_file_hash: sha(1), p_as_of: '2026-11-01', p_rows: [], p_dropped: [] }],
    ['read_activation_tasks', { ...auth(0), p_filters: {}, p_limit: 10, p_offset: 0 }], ['resolve_ctm', { ...auth(0), p_ctm: id(1), p_code: 'X', p_reason: 'r' }],
    ['gold_standard_scorecard', { p_tenant: T, p_from: '2025-01-01', p_to: '2026-01-01', p_group_by: [], p_plan_year: null }],
    ['gold_standard_network_scorecard', { p_from: '2025-01-01', p_to: '2026-01-01', p_group_by: [], p_plan_year: null }]]) {
    await assert.rejects(rpc(name, args), error => error.code === '42501', name);
  }
  await service();
  await pg.exec('SET ROLE authenticated');
  for (const table of ['member_status_events', 'ctm_records', 'member_unmatched_rows', 'activation_tasks', 'member_carrier_ids', 'member_match_secrets']) {
    await assert.rejects(q(`SELECT 1 FROM ${table}`), /permission denied/, table);
  }
  await assert.rejects(q("SELECT gold_standard_network_scorecard('2025-01-01','2026-01-01','{}',NULL)"), /permission denied/);
  await service();
  const routines = await asOwner(() => q(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
    AND (p.proname LIKE 'gold%' OR p.proname LIKE 'member%' OR p.proname LIKE 'activation%' OR p.proname LIKE '%ctm%' OR p.proname='enrollment_attribution')
    AND (p.proconfig IS NULL OR NOT EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))`));
  assert.deepEqual(routines, [], 'every SECURITY DEFINER routine pins its search_path');
  for (const table of ['member_status_events', 'ctm_records', 'activation_tasks', 'member_unmatched_rows']) {
    const [row] = await asOwner(() => q('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [`public.${table}`]));
    assert.equal(row.relrowsecurity, true, table);
  }
});

test('the MBI key: a dedicated, once only pepper; normalized CMS format; null when absent; never the raw MBI', async () => {
  assert.equal(await key(MBI[0]), null, 'no pepper, no key');
  await assert.rejects(rpc('provision_member_mbi_pepper', { p_secret: 'short' }), /at least 32/);
  await rpc('provision_member_mbi_pepper', { p_secret: PEPPER });
  await assert.rejects(rpc('provision_member_mbi_pepper', { p_secret: PEPPER }), /already provisioned/);
  const k = await key(MBI[0]);
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(await key(` ${MBI[0].slice(0, 4)}-${MBI[0].slice(4, 7)}-${MBI[0].slice(7).toLowerCase()} `), k, 'spaces, dashes and case normalize');
  assert.equal(await key('1SG4TE5MK72'), null, 'S is not a valid MBI letter');
  assert.equal(await key('123456789A'), null);
  assert.notEqual(await key(MBI[1]), k);
});

test('save_enrollment_intake stores the key for new intakes from the caller MBI', async () => {
  const [{ fn }] = await asOwner(() => q("SELECT pg_get_functiondef('public.save_enrollment_intake(uuid,uuid,uuid,uuid,jsonb,text,jsonb)'::regprocedure) AS fn"));
  assert.match(fn, /mbi_match_key=public\.member_mbi_key\(p_data->>'mbi'\)/);
  const seeded = await seedIntake({ data: { enrollmentId: 'SAVE-1' } });
  const saved = await rpc('save_enrollment_intake', { p_id: null, p_tenant: T, p_call: seeded.call, p_contact: seeded.contact,
    p_data: { sixtyDayDate: '2026-03-01', aor: (await asOwner(() => q('SELECT name FROM tenant_agents WHERE id=$1', [rid(1)])))[0].name,
      writingAgentId: rid(1), mbi: MBI[3], effectiveDate: '2026-01-01' }, p_carrier: 'Other',
    p_payload: { submittedAt: '2026-01-01T00:00:00Z' } }).catch(error => error);
  assert.ok(!(saved instanceof Error), saved?.message);
  const [row] = await asOwner(() => q('SELECT mbi_match_key,data ? \'mbi\' AS raw FROM enrollment_intakes WHERE id=$1', [saved]));
  assert.match(row.mbi_match_key, /^[0-9a-f]{64}$/, 'the pepper provisioned above keys the new intake');
  assert.equal(row.mbi_match_key, await key(MBI[3]));
  assert.equal(row.raw, false, 'the MBI itself stays encrypted only');
});

test('matching priority: confirmation, then carrier member id, then MBI key with carrier and effective date; queue otherwise', async () => {
  const a = await seedIntake({ data: { enrollmentId: 'CONF-A1', effectiveDate: '2026-01-01' }, mbiKey: await key(MBI[0]) });
  const b = await seedIntake({ data: { enrollmentId: 'CONF-B1', effectiveDate: '2026-02-01' }, mbiKey: await key(MBI[1]) });
  const c = await seedIntake({ data: { sunfireCode: 'SUN-C1', effectiveDate: '2026-03-01' } });
  await seedIntake({ data: { enrollmentId: 'DUP-1' } }); await seedIntake({ data: { enrollmentId: 'DUP-1' } });
  const test1 = await seedIntake({ data: { enrollmentId: 'CONF-T1' }, isTest: true });
  const result = await importRows([
    // Confirmation wins over an MBI key that points elsewhere; the member id is learned.
    { row_number: 2, confirmation: ' conf-a1 ', mbi: MBI[1], effective_date: '2026-02-01', carrier_member_id: 'M-A', event_type: 'effectuated', event_effective_date: '2026-01-01' },
    { row_number: 3, mbi: MBI[1], effective_date: '2026-02-01', event_type: 'effectuated', event_effective_date: '2026-02-01' },
    { row_number: 4, confirmation: 'SUN-C1', event_type: 'effectuated', event_effective_date: '2026-03-01' },
    { row_number: 5, confirmation: 'DUP-1', event_type: 'effectuated', event_effective_date: '2026-01-01' },
    { row_number: 6, confirmation: 'CONF-T1', event_type: 'effectuated', event_effective_date: '2026-01-01' },
    { row_number: 7, mbi: MBI[1], effective_date: '2026-03-01', event_type: 'effectuated', event_effective_date: '2026-03-01' },
    { row_number: 8, mbi: MBI[1], effective_date: '2026-02-01', event_type: 'effectuated', event_effective_date: '2026-02-01' },
    { row_number: 9, event_type: 'promoted', event_effective_date: '2026-01-01' },
  ], { carrier: 'synthetic carrier' });
  assert.equal(result.matched, 4);
  assert.deepEqual(result.by_key, { confirmation: 2, carrier_member_id: 0, mbi_key: 2 });
  assert.equal(result.queued, 3);
  assert.deepEqual(result.rejected_rows, [{ row: 9, field: 'event_type' }]);
  assert.deepEqual((await events(a.intake)).map(e => e.matched_by), ['confirmation']);
  assert.deepEqual((await events(b.intake)).map(e => e.matched_by), ['mbi_key', 'mbi_key']);
  assert.deepEqual((await events(c.intake)).map(e => e.matched_by), ['confirmation']);
  assert.deepEqual(await events(test1.intake), [], 'a test enrollment never matches');
  const queue = await rpc('read_member_unmatched', { ...auth(0), p_kind: 'member_status', p_limit: 50 });
  assert.deepEqual(queue.rows.map(r => [r.row, r.reason]), [[5, 'ambiguous'], [6, 'no_match'], [7, 'no_match']]);
  assert.ok(queue.rows.every(r => !JSON.stringify(r).includes(MBI[1])), 'the queue never shows the MBI');
  // The learned member id now matches a later file on its own.
  const later = await importRows([{ row_number: 2, carrier_member_id: 'M-A', event_type: 'disenrolled', event_effective_date: '2026-03-15', disenroll_reason_code: 'D01' }],
    { carrier: 'synthetic carrier' });
  assert.deepEqual(later.by_key, { confirmation: 0, carrier_member_id: 1, mbi_key: 0 });
  assert.deepEqual((await events(a.intake)).map(e => [e.event_type, e.matched_by]), [['effectuated', 'confirmation'], ['disenrolled', 'carrier_member_id']]);
});

test('the same file hash imports once; events are immutable', async () => {
  const s = await seedIntake({ data: { enrollmentId: 'IDEM-1' } });
  const rows = [{ row_number: 2, confirmation: 'IDEM-1', event_type: 'effectuated', event_effective_date: '2026-01-01' }];
  const first = await importRows(rows, { file: 77777 });
  const again = await importRows(rows, { file: 77777 });
  assert.equal(first.duplicate, false); assert.equal(again.duplicate, true); assert.equal(again.file_id, first.file_id);
  assert.equal((await events(s.intake)).length, 1);
  await assert.rejects(asOwner(() => q("UPDATE member_status_events SET event_type='disenrolled' WHERE enrollment_intake_id=$1", [s.intake])), /immutable/);
  await assert.rejects(asOwner(() => q('DELETE FROM member_status_events WHERE enrollment_intake_id=$1', [s.intake])), /immutable/);
  await assert.rejects(asOwner(() => q('UPDATE member_status_import_files SET carrier=$2 WHERE id=$1', [first.file_id, 'Other'])), /immutable/);
});

test('manual links are admin only, audited, and create the event with matched_by manual', async () => {
  const s = await seedIntake({ data: { enrollmentId: 'LINK-1' } });
  const result = await importRows([{ row_number: 2, confirmation: 'NOPE-1', carrier_member_id: 'M-LINK', event_type: 'effectuated', event_effective_date: '2026-01-01' }]);
  const [row] = (await rpc('read_member_unmatched', { ...auth(0), p_kind: 'member_status', p_limit: 200 })).rows.filter(r => r.file_id === result.file_id);
  for (const who of [1, 2]) await assert.rejects(rpc('member_link_unmatched', { ...auth(who), p_row: row.id, p_intake: s.intake, p_reason: 'Verified with carrier' }), e => e.code === '42501');
  await rpc('member_link_unmatched', { ...auth(0), p_row: row.id, p_intake: s.intake, p_reason: 'Verified with carrier' });
  assert.deepEqual((await events(s.intake)).map(e => e.matched_by), ['manual']);
  const [audit] = await asOwner(() => q("SELECT actor_id,action,after_summary FROM admin_action_log WHERE action='gold_standards_link' AND target_id=$1", [row.id]));
  assert.equal(audit.actor_id, roster[0].clerk_user_id);
  assert.equal(audit.after_summary.enrollment_intake_id, s.intake);
  const learned = await asOwner(() => q("SELECT enrollment_intake_id FROM member_carrier_ids WHERE carrier_member_id='M-LINK'"));
  assert.deepEqual(learned, [], 'a carrier member id is learned only from a confirmation or MBI key match');
  await assert.rejects(rpc('member_link_unmatched', { ...auth(0), p_row: row.id, p_intake: s.intake, p_reason: 'again' }), /unavailable/);
});

test('CTMs: no narrative, a matched open CTM uses the existing complaint hold, only resolve_ctm clears it', async () => {
  const s = await seedIntake({ data: { enrollmentId: 'CTM-1' } });
  const result = await importRows([
    { row_number: 2, confirmation: 'CTM-1', cms_complaint_id: 'CTM0001', received_date: '2026-04-02', category: 'marketing', status: 'open' },
    { row_number: 3, confirmation: 'NONE', cms_complaint_id: 'CTM0002', received_date: '2026-04-03', category: 'unheard_of' },
    { row_number: 4, cms_complaint_id: 'CTM0003', received_date: '2026-04-03', narrative: 'Synthetic narrative' },
  ], { kind: 'ctm', dropped: ['Complaint Description'] });
  assert.equal(result.matched, 1); assert.equal(result.queued, 1); assert.deepEqual(result.rejected_rows, [{ row: 4, field: 'narrative' }]);
  assert.deepEqual(result.dropped_columns, ['Complaint Description']);
  const [file] = await asOwner(() => q('SELECT dropped_columns FROM member_status_import_files WHERE id=$1', [result.file_id]));
  assert.deepEqual(file.dropped_columns, ['Complaint Description']);
  const ctms = await asOwner(() => q("SELECT cms_complaint_id,category,status,contact_id FROM ctm_records WHERE source_file_id=$1 ORDER BY cms_complaint_id", [result.file_id]));
  assert.deepEqual(ctms.map(c => [c.cms_complaint_id, c.category, c.status]), [['CTM0001', 'marketing', 'open'], ['CTM0002', 'other', 'open']]);
  const columns = (await asOwner(() => q("SELECT column_name FROM information_schema.columns WHERE table_name='ctm_records'"))).map(r => r.column_name);
  assert.ok(!columns.some(c => /narrative|text|description|note/.test(c)), 'no narrative column exists');
  const contact = async () => (await asOwner(() => q('SELECT complaint_open FROM contacts WHERE id=$1', [s.contact])))[0].complaint_open;
  const holds = () => asOwner(() => q("SELECT released_at FROM retention_holds WHERE target_id=$1 AND source='complaint'", [s.contact]));
  assert.equal(await contact(), true);
  assert.equal((await holds()).filter(h => !h.released_at).length, 1);
  // A carrier file reporting resolution records it and resolves nothing.
  await importRows([{ row_number: 2, cms_complaint_id: 'CTM0001', received_date: '2026-04-02', status: 'resolved', resolution_code: 'R1' }], { kind: 'ctm' });
  assert.equal(await contact(), true);
  const [reported] = await asOwner(() => q("SELECT status,carrier_reported_status FROM ctm_records WHERE cms_complaint_id='CTM0001'"));
  assert.deepEqual([reported.status, reported.carrier_reported_status], ['open', 'resolved']);
  await assert.rejects(asOwner(async () => { await pg.exec('SET ROLE service_role'); await q('UPDATE contacts SET complaint_open=false WHERE id=$1', [s.contact]); }), /Protected admin complaint resolution required/);
  await service();
  const [ctm] = await asOwner(() => q("SELECT id FROM ctm_records WHERE cms_complaint_id='CTM0001'"));
  await assert.rejects(rpc('resolve_ctm', { ...auth(1), p_ctm: ctm.id, p_code: 'RESOLVED', p_reason: 'Carrier confirmed' }), e => e.code === '42501');
  assert.deepEqual(await rpc('resolve_ctm', { ...auth(0), p_ctm: ctm.id, p_code: 'RESOLVED', p_reason: 'Carrier confirmed' }),
    { id: ctm.id, status: 'resolved', complaint_cleared: true });
  assert.equal(await contact(), false);
  assert.equal((await holds()).filter(h => !h.released_at).length, 0);
  assert.equal(TABLE_CLASS.ctm_records, 'complaint');
});

test('activation: opened once per enrollment on a matched effectuation, PCP only for HMO plans, supplemental only when recorded, no outbound action', async () => {
  const outbound = async () => (await asOwner(() => q(`SELECT (SELECT count(*) FROM messages)+(SELECT count(*) FROM telephony_call_attempts)
    +(SELECT count(*) FROM integration_deliveries)+(SELECT count(*) FROM followup_queue) AS n`)))[0].n;
  const before = await outbound();
  const hmo = await seedIntake({ data: { enrollmentId: 'ACT-HMO', contractId: 'H1111' } });
  const ppo = await seedIntake({ data: { enrollmentId: 'ACT-PPO', contractId: 'H2222' } });
  const pdp = await seedIntake({ data: { enrollmentId: 'ACT-PDP', contractId: 'S5555' } });
  const pos = await seedIntake({ data: { enrollmentId: 'ACT-POS', contractId: 'H4444' } });
  await importRows(['ACT-HMO', 'ACT-PPO', 'ACT-PDP', 'ACT-POS'].map((c, i) => ({ row_number: i + 2, confirmation: c, event_type: 'effectuated', event_effective_date: '2026-01-01' })));
  await importRows([{ row_number: 2, confirmation: 'ACT-HMO', event_type: 'effectuated', event_effective_date: '2026-01-01' }]);
  const kinds = async s => (await asOwner(() => q(`SELECT i.kind FROM activation_task_items i JOIN activation_tasks t ON t.id=i.task_id
    WHERE t.enrollment_intake_id=$1 ORDER BY i.position`, [s.intake]))).map(r => r.kind);
  assert.equal((await asOwner(() => q('SELECT count(*)::int n FROM activation_tasks WHERE enrollment_intake_id=$1', [hmo.intake])))[0].n, 1);
  assert.deepEqual(await kinds(hmo), ['member_card', 'pcp', 'pharmacy', 'member_reachable']);
  assert.deepEqual(await kinds(ppo), ['member_card', 'pharmacy', 'member_reachable']);
  assert.deepEqual(await kinds(pdp), ['member_card', 'pharmacy', 'member_reachable']);
  assert.deepEqual(await kinds(pos), ['member_card', 'pcp', 'member_reachable']);
  const [task] = await asOwner(() => q('SELECT id,due_date::text d,assigned_agent_id,status FROM activation_tasks WHERE enrollment_intake_id=$1', [hmo.intake]));
  assert.equal(task.d, '2026-01-31'); assert.equal(task.assigned_agent_id, aid(1));
  // Scope: the writing agent, the manager of that team and the admin; not another agent.
  for (const who of [1, 2, 0]) assert.ok((await rpc('read_activation_tasks', { ...auth(who), p_filters: {}, p_limit: 200, p_offset: 0 })).rows.some(r => r.id === task.id), String(who));
  assert.ok(!(await rpc('read_activation_tasks', { ...auth(3), p_filters: {}, p_limit: 200, p_offset: 0 })).rows.some(r => r.id === task.id));
  assert.equal((await rpc('read_activation_tasks', { ...auth(1), p_filters: {}, p_limit: 200, p_offset: 0 })).summary, null, 'agents get no manager summary');
  await assert.rejects(rpc('activation_close_task', { ...auth(3), p_task: task.id, p_status: 'completed' }), e => e.code === '42501');
  await rpc('activation_add_benefit', { ...auth(1), p_task: task.id, p_label: 'Dental allowance' });
  await assert.rejects(rpc('activation_add_benefit', { ...auth(1), p_task: task.id, p_label: 'dental allowance' }), /already recorded/);
  assert.deepEqual(await kinds(hmo), ['member_card', 'pcp', 'pharmacy', 'member_reachable', 'supplemental_benefit']);
  await assert.rejects(rpc('activation_close_task', { ...auth(1), p_task: task.id, p_status: 'completed' }), /Record every item/);
  const listed = (await rpc('read_activation_tasks', { ...auth(1), p_filters: {}, p_limit: 200, p_offset: 0 })).rows.find(r => r.id === task.id);
  await assert.rejects(rpc('activation_record_item', { ...auth(1), p_item: listed.items[0].id, p_outcome: 'done', p_note: 'Call 2125550199 back' }), /identifiers/);
  await assert.rejects(rpc('activation_record_item', { ...auth(1), p_item: listed.items[0].id, p_outcome: 'done', p_note: `MBI ${MBI[2]}` }), /identifiers/);
  for (const item of listed.items) await rpc('activation_record_item', { ...auth(1), p_item: item.id, p_outcome: item.kind === 'pcp' ? 'not_applicable' : 'done', p_note: null });
  await rpc('activation_close_task', { ...auth(1), p_task: task.id, p_status: 'completed' });
  await assert.rejects(rpc('activation_record_item', { ...auth(1), p_item: listed.items[0].id, p_outcome: 'done', p_note: null }), /closed/);
  const audits = await asOwner(() => q("SELECT after_summary->>'op' op FROM admin_action_log WHERE action='activation_task' AND (target_id=$1 OR target_id = ANY($2))",
    [task.id, listed.items.map(i => i.id)]));
  assert.deepEqual([...new Set(audits.map(a => a.op))].sort(), ['benefit_added', 'closed', 'item_recorded', 'opened']);
  assert.equal(await outbound(), before, 'no message, call attempt, delivery or queue row was created');
  await assert.rejects(rpc('activation_set_due_days', { ...auth(0), p_days: 5 }), /7 to 90/);
  await rpc('activation_set_due_days', { ...auth(0), p_days: 45 });
});

test('lifecycle: matched events, CTMs and activation appear for the consumer, each behind its flag', async () => {
  const s = await seedIntake({ data: { enrollmentId: 'LIFE-1' } });
  await importRows([{ row_number: 2, confirmation: 'LIFE-1', event_type: 'effectuated', event_effective_date: '2026-01-01' }]);
  await importRows([{ row_number: 2, confirmation: 'LIFE-1', cms_complaint_id: 'CTMLIFE', received_date: '2026-02-01', category: 'marketing', status: 'open' }], { kind: 'ctm' });
  const types = async () => new Set((await asOwner(() => q('SELECT type FROM consumer_lifecycle_rows($1,$2)', [s.contact, T]))).map(r => r.type));
  const seen = await types();
  for (const type of ['member_effectuated', 'complaint_recorded', 'activation_task_opened']) assert.ok(seen.has(type), type);
  await service({ CONSUMER_LIFECYCLE_ENABLED: 'true' });
  const off = await asOwner(async () => { await service({ CONSUMER_LIFECYCLE_ENABLED: 'true' }); await pg.exec('RESET ROLE'); return q('SELECT type FROM consumer_lifecycle_rows($1,$2)', [s.contact, T]); });
  for (const type of ['member_effectuated', 'complaint_recorded', 'activation_task_opened']) assert.ok(!off.some(r => r.type === type), `${type} with its flag off`);
});

test('tenant isolation: another agency sees none of these rows, and the operator view returns aggregates only', async () => {
  const mine = await seedIntake({ data: { enrollmentId: 'ISO-1' } });
  await importRows([{ row_number: 2, confirmation: 'ISO-1', event_type: 'effectuated', event_effective_date: '2026-01-01' }]);
  const theirs = await seedIntake({ tenant: OTHER, data: { enrollmentId: 'ISO-1' } });
  const matchedTheirs = await asOwner(() => q('SELECT count(*)::int n FROM member_status_events WHERE enrollment_intake_id=$1', [theirs.intake]));
  assert.equal(matchedTheirs[0].n, 0, 'a confirmation never matches across tenants');
  const agency = await rpc('gold_standard_scorecard', { p_tenant: OTHER, p_from: '2025-01-01', p_to: '2026-11-01', p_group_by: [], p_plan_year: null });
  assert.equal(agency.totals.applications, 1);
  assert.equal(agency.totals.effectuated, 0);
  const network = await rpc('gold_standard_network_scorecard', { p_from: '2025-01-01', p_to: '2026-11-01', p_group_by: ['agency'], p_plan_year: null });
  const text = JSON.stringify(network);
  for (const value of [mine.intake, mine.contact, theirs.intake, theirs.contact, '+1212555', MBI[0]]) assert.ok(!text.includes(value), value);
  assert.deepEqual(Object.keys(network).sort(), ['agency_names', 'cohort', 'cross_agency_moves', 'from', 'group_by', 'groups', 'matured', 'mix',
    'pending', 'scope', 'threshold', 'to', 'totals', 'unattributed', 'unattributed_share']);
  assert.ok(network.groups.every(g => Object.keys(g.key).join() === 'agency'));
  const queue = await rpc('read_member_unmatched', { ...auth(0), p_kind: 'member_status', p_limit: 200 });
  assert.ok(queue.rows.every(r => !JSON.stringify(r).includes(OTHER)));
});

test('scorecards: the SQL result equals the JS mirror on the extracted facts, and attribution keeps unattributed enrollments', async () => {
  const window = ['2025-01-01', '2026-11-01'];
  const attribution = await rpc('enrollment_attribution', { p_tenant: T });
  assert.ok(attribution.length > 0);
  assert.ok(attribution.every(r => r.lead_source_id === null), 'no inbound call links a source in this fixture, so source stays null');
  for (const groups of [[], ['source'], ['product_line', 'snp_type'], ['agent', 'effective_month'], ['carrier', 'agent_cohort_month']]) {
    const sql = await rpc('gold_standard_scorecard', { p_tenant: T, p_from: window[0], p_to: window[1], p_group_by: groups, p_plan_year: 2026 });
    const [{ f }] = await asOwner(() => q('SELECT gold_facts($1,$2,$3,2026) AS f', [[T], window[0], window[1]]));
    const js = computeGoldStandards(f, window[0], window[1], groups);
    const rest = { ...sql }; delete rest.agent_names; delete rest.scope;
    assert.equal(sql.scope, 'agency');
    assert.deepEqual(JSON.parse(JSON.stringify(rest)), JSON.parse(JSON.stringify(js)), groups.join(','));
  }
  const all = await rpc('gold_standard_scorecard', { p_tenant: T, p_from: window[0], p_to: window[1], p_group_by: ['source'], p_plan_year: 2026 });
  assert.equal(all.unattributed, all.totals.applications);
  assert.equal(all.unattributed_share, 1);
  assert.equal(all.groups.length, 1); assert.equal(all.groups[0].key.source, null);
});

test('the raw MBI is never stored in any table the Gold Standards migrations add', async () => {
  const tables = ['member_match_secrets', 'member_status_column_maps', 'member_status_import_files', 'member_carrier_ids', 'member_status_events',
    'ctm_records', 'member_unmatched_rows', 'activation_settings', 'activation_tasks', 'activation_task_items', 'activation_item_records', 'admin_action_log'];
  for (const table of tables) {
    const rows = await asOwner(() => q(`SELECT to_jsonb(t)::text AS r FROM public.${table} t`));
    for (const mbi of MBI) assert.ok(!rows.some(r => r.r.toUpperCase().includes(mbi)), `${table} holds ${mbi}`);
  }
  const keyed = await asOwner(() => q('SELECT count(*)::int n FROM member_unmatched_rows WHERE mbi_match_key IS NOT NULL'));
  assert.ok(keyed[0].n > 0, 'unmatched rows keep the key, not the MBI');
});
