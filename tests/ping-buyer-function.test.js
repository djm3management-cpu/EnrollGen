// Netlify ping-buyer (S8b): flag gating, Clerk auth pass through, admin
// check, tenant isolation, action and input allowlists, and admin_action_log
// rows written before every write. Runs against migrations 171 to 187 in
// PGlite; only authentication and identity resolution are injected.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPingBuyerHandler } from '../netlify/functions/ping-buyer.js';
import { createPortalDb, portalClient, BUYERS, OP, S9_FEATURES } from './helpers/pingPortalDb.js';

const A = BUYERS.east; const B = BUYERS.central;
let pg; let campaigns; let flags;

before(async () => { ({ pg, campaigns } = await createPortalDb()); });
after(async () => { await pg.close(); });

const identity = (tenant, { admin = true, user = `user_${tenant.slice(-2)}` } = {}) =>
  ({ admin, tenant: { id: tenant }, agent: { id: 'agent' }, auth: { userId: user } });

function handler({ who = identity(A.tenant), db = null, auth = null, enabledFlags = null } = {}) {
  flags = enabledFlags ?? { ...S9_FEATURES };
  return createPingBuyerHandler({
    authenticate: async () => auth ?? { userId: who.auth.userId },
    getDb: () => db ?? portalClient(pg),
    resolveIdentity: async () => who,
    enabled: name => Boolean(flags[name]),
    profile: () => ({ tenantId: OP.tenant, timezone: 'America/Chicago' }),
  });
}

const url = query => `https://app.example/.netlify/functions/ping-buyer${query ? `?${query}` : ''}`;
async function get(h, query) { const r = await h(new Request(url(query))); return { status: r.status, body: await r.json() }; }
async function post(h, body) {
  const r = await h(new Request(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
}
const auditRows = async tenant => (await pg.query(
  "SELECT * FROM admin_action_log WHERE tenant_id=$1 AND action='ping_buyer' ORDER BY occurred_at,id", [tenant])).rows;
const campaignRow = async id => (await pg.query('SELECT * FROM ping_campaigns WHERE id=$1', [id])).rows[0];

async function alertFor(buyer, campaign) {
  const { rows: [d] } = await pg.query(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,available,reason,engine)
    VALUES($1,$2,$3,true,'accepted_retention_owner','exchange') RETURNING id`, [buyer.tenant, OP.source, campaign]);
  const { rows: [a] } = await pg.query(`INSERT INTO ping_retention_alerts(tenant_id,contact_id,source_id,campaign_id,decision_id)
    VALUES($1,gen_random_uuid(),$2,$3,$4) RETURNING id`, [buyer.tenant, OP.source, campaign, d.id]);
  return a.id;
}

test('PING_PLATFORM_ENABLED off answers 503 before authentication; per action flags gate reports and scripts', async () => {
  let authenticated = 0;
  const off = createPingBuyerHandler({ authenticate: async () => { authenticated += 1; return { userId: 'x' }; },
    getDb: () => assert.fail('no database access'), resolveIdentity: async () => assert.fail('no identity'), enabled: () => false });
  const response = await off(new Request(url('action=campaigns')));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).feature, 'PING_PLATFORM_ENABLED');
  assert.equal(authenticated, 0);
  const h = handler({ enabledFlags: { PING_PLATFORM_ENABLED: true } });
  assert.equal((await get(h, 'action=scorecard&from=2026-11-01&to=2026-11-02')).body.feature, 'PING_SCORECARD_ENABLED');
  assert.equal((await get(h, 'action=scripts')).body.feature, 'PING_SCREENER_ENABLED');
  assert.equal((await get(h, 'action=campaigns')).status, 200);
});

test('an unauthenticated request gets the auth response; a non admin member is forbidden and writes nothing', async () => {
  const unauth = handler({ auth: { response: new Response('{"error":"Unauthorized"}', { status: 401 }) } });
  assert.equal((await get(unauth, 'action=campaigns')).status, 401);
  const writes = [];
  const member = handler({ who: identity(A.tenant, { admin: false }), db: portalClient(pg, { writes }) });
  assert.equal((await get(member, 'action=campaigns')).status, 403);
  assert.equal((await post(member, { action: 'campaign_pause', id: campaigns.east })).status, 403);
  assert.deepEqual(writes, []);
});

test('context reports operator only for an administrator of the deployment tenant with the exchange on', async () => {
  assert.equal((await get(handler(), 'action=context')).body.operator, false);
  const op = handler({ who: identity(OP.tenant) });
  const context = (await get(op, 'action=context')).body;
  assert.equal(context.operator, true);
  assert.equal(context.timezone, 'America/Chicago');
  assert.equal((await get(handler({ who: identity(OP.tenant), enabledFlags: { ...S9_FEATURES, PING_EXCHANGE_ENABLED: false } }),
    'action=context')).body.operator, false);
});

test('reads are scoped to the signed in tenant', async () => {
  const listed = (await get(handler(), 'action=campaigns')).body.campaigns;
  assert.deepEqual(listed.map(c => c.id), [campaigns.east]);
  assert.equal(listed[0].channel, 'call');
  assert.equal(listed[0].paused, false);
  await alertFor(A, campaigns.east); await alertFor(B, campaigns.central);
  const alerts = (await get(handler(), 'action=alerts')).body.alerts;
  assert.ok(alerts.length >= 1 && alerts.every(a => a.campaign_id === campaigns.east));
  const scorecard = await get(handler(), 'action=scorecard&from=2020-01-01&to=2020-02-01&group=campaign');
  assert.equal(scorecard.status, 200);
  assert.deepEqual(scorecard.body.group, ['campaign']);
  const usage = await get(handler(), 'action=usage&month=2026-11');
  assert.equal(usage.status, 200);
  assert.equal(usage.body.usage.tenant_id, A.tenant);
  assert.equal((await get(handler(), 'action=invoice_lines&month=2026-11')).status, 200);
});

test('unknown actions, unknown fields and bad values are 400; GET actions refuse POST', async () => {
  const h = handler();
  assert.equal((await get(h, 'action=drop_tables')).status, 400);
  assert.equal((await get(h, '')).status, 400);
  assert.equal((await get(h, 'action=campaigns&tenant_id=x')).status, 400);
  assert.equal((await get(h, 'action=campaigns&action=campaigns')).status, 400);
  assert.equal((await get(h, 'action=scorecard&from=2026-11-02&to=2026-11-01')).status, 400);
  assert.equal((await get(h, 'action=scorecard&from=2026-11-01&to=2026-11-02&group=buyer_tenant')).status, 400);
  assert.equal((await get(h, 'action=usage&month=2026-13')).status, 400);
  assert.equal((await post(h, { action: 'campaigns' })).status, 405);
  assert.equal((await post(h, { action: 'nope' })).status, 400);
});

test('a campaign update applies only allowlisted fields, is audited first, and a rejected patch is audited and changes nothing', async () => {
  const h = handler();
  const before = await campaignRow(campaigns.east);
  const rejected = await post(h, { action: 'campaign_update', id: campaigns.east, patch: { rate: 0, active: false } });
  assert.equal(rejected.status, 400);
  const extra = await post(h, { action: 'campaign_update', id: campaigns.east, patch: { active: false }, tenant_id: B.tenant });
  assert.equal(extra.status, 400);
  assert.equal((await campaignRow(campaigns.east)).active, before.active);
  const denied = (await auditRows(A.tenant)).filter(r => r.after_summary.op === 'campaign_update' && r.result === 'denied');
  assert.equal(denied.length, 2);
  assert.deepEqual(denied[0].after_summary.fields, ['active', 'rate']);

  const ok = await post(h, { action: 'campaign_update', id: campaigns.east,
    patch: { exchange_daily_cap: 25, retention_mode: 'reject_and_alert', performance_routing: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.campaign.exchange_daily_cap, 25);
  const row = await campaignRow(campaigns.east);
  assert.equal(row.retention_mode, 'reject_and_alert');
  assert.equal(Number(row.rate), Number(before.rate));
  const audit = (await auditRows(A.tenant)).at(-1);
  assert.equal(audit.result, 'authorized');
  assert.equal(audit.actor_id, 'user_c1');
  assert.equal(audit.target_id, campaigns.east);
  assert.deepEqual(audit.after_summary.changes, { exchange_daily_cap: 25, retention_mode: 'reject_and_alert', performance_routing: true });
});

test('another tenant\'s campaign, alert or script target is not found, audited against the caller and unchanged', async () => {
  const h = handler();
  const before = await campaignRow(campaigns.central);
  assert.equal((await post(h, { action: 'campaign_update', id: campaigns.central, patch: { active: false } })).status, 404);
  assert.equal((await post(h, { action: 'campaign_pause', id: campaigns.central })).status, 404);
  const alertB = await alertFor(B, campaigns.central);
  assert.equal((await post(h, { action: 'alert_ack', id: alertB })).status, 404);
  const script = { campaign_id: campaigns.central, opening: 'o', q_medicare: 'm', q_zip: 'z', q_reason: 'r', q_connect: 'c',
    pass_line: 'p', fail_line: 'f' };
  assert.equal((await post(h, { action: 'script_draft', ...script })).status, 404);
  assert.deepEqual(await campaignRow(campaigns.central), before);
  const { rows: [b] } = await pg.query('SELECT acknowledged_at FROM ping_retention_alerts WHERE id=$1', [alertB]);
  assert.equal(b.acknowledged_at, null);
  assert.equal((await pg.query('SELECT count(*)::int n FROM ping_source_controls WHERE campaign_id=$1', [campaigns.central])).rows[0].n, 0);
  assert.equal((await pg.query('SELECT count(*)::int n FROM screener_scripts WHERE campaign_id=$1', [campaigns.central])).rows[0].n, 0);
  assert.equal((await auditRows(B.tenant)).length, 0);
});

test('pause and resume go through the audited source control; alert ack and script drafts are audited', async () => {
  const h = handler();
  const paused = await post(h, { action: 'campaign_pause', id: campaigns.east });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.campaign.paused, true);
  const { rows: [control] } = await pg.query('SELECT * FROM ping_source_controls WHERE campaign_id=$1', [campaigns.east]);
  assert.equal(control.paused, true);
  assert.equal(control.changed_by, 'user_c1');
  assert.equal((await post(h, { action: 'campaign_resume', id: campaigns.east })).body.campaign.paused, false);
  assert.equal((await post(h, { action: 'campaign_pause', id: campaigns.east, extra: 1 })).status, 400);

  const alertA = await alertFor(A, campaigns.east);
  const acked = await post(h, { action: 'alert_ack', id: alertA });
  assert.equal(acked.status, 200);
  assert.ok(acked.body.alert.acknowledged_at);
  const again = await post(h, { action: 'alert_ack', id: alertA });
  assert.equal(again.body.alert.acknowledged_at, acked.body.alert.acknowledged_at);

  const script = { campaign_id: campaigns.east, opening: 'Opening', q_medicare: 'Medicare?', q_zip: 'ZIP?', q_reason: 'Reason?',
    q_connect: 'Connect?', pass_line: 'Pass', fail_line: 'Fail' };
  const first = await post(h, { action: 'script_draft', ...script });
  assert.equal(first.status, 201);
  assert.equal(first.body.script.status, 'draft');
  const second = await post(h, { action: 'script_draft', ...script, voice: 'Polly.Matthew' });
  assert.equal(second.body.script.version, first.body.script.version + 1);
  assert.equal((await post(h, { action: 'script_draft', ...script, approved_by: 'me' })).status, 400);
  assert.equal((await post(h, { action: 'script_draft', ...script, opening: '' })).status, 400);
  const scripts = (await get(h, `action=scripts&campaign_id=${campaigns.east}`)).body.scripts;
  assert.equal(scripts.length, 2);
  const ops = (await auditRows(A.tenant)).map(r => `${r.after_summary.op}:${r.result}`);
  for (const op of ['campaign_pause:authorized', 'campaign_resume:authorized', 'alert_ack:authorized',
    'screener_draft_create:authorized', 'screener_draft_create:denied']) assert.ok(ops.includes(op), op);
});

test('when the audit write fails the change does not run', async () => {
  const h = handler({ db: portalClient(pg, { failInsertInto: 'admin_action_log' }) });
  const before = await campaignRow(campaigns.east);
  const response = await post(h, { action: 'campaign_update', id: campaigns.east, patch: { daily_budget_calls: 3 } });
  assert.equal(response.status, 503);
  assert.equal((await campaignRow(campaigns.east)).daily_budget_calls, before.daily_budget_calls);
});
