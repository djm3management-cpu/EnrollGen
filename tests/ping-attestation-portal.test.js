// Spec v5 attestations in the portals: the operator records publisher
// attestations and campaign requirements (audited before every write, feature
// gated), the buyer sees status and expiry of the publishers that reach it
// (never the document reference), and source_attestation_missing shows up in
// the scorecards like every other closed reason. Migrations 171 to 187 plus 190.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPingOperatorHandler } from '../netlify/functions/ping-operator.js';
import { createPingBuyerHandler } from '../netlify/functions/ping-buyer.js';
import { createPortalDb, portalClient, BUYERS, OP, S9_FEATURES, exchangePing } from './helpers/pingPortalDb.js';
import { applyS10 } from '../telephony/tests/helpers/pingS10Db.js';
import { setFeatures } from '../telephony/tests/helpers/pingDb.js';

const A = BUYERS.east;
const FLAGS = { ...S9_FEATURES, SOURCE_ATTESTATIONS_ENABLED: true };
let pg; let campaigns;
before(async () => { ({ pg, campaigns } = await createPortalDb()); await applyS10(pg); });
after(async () => { await pg.close(); });

const who = tenant => ({ admin: true, tenant: { id: tenant }, agent: { id: 'agent' }, auth: { userId: `user_${tenant.slice(-2)}` } });
const operator = (flags = FLAGS) => createPingOperatorHandler({ authenticate: async () => ({ userId: 'user_operator' }), getDb: () => portalClient(pg),
  resolveIdentity: async () => ({ ...who(OP.tenant), auth: { userId: 'user_operator' } }), enabled: name => Boolean(flags[name]), profile: () => ({ tenantId: OP.tenant }) });
const buyer = (flags = FLAGS, tenant = A.tenant) => createPingBuyerHandler({ authenticate: async () => ({ userId: 'u' }), getDb: () => portalClient(pg),
  resolveIdentity: async () => who(tenant), enabled: name => Boolean(flags[name]), profile: () => ({ tenantId: OP.tenant, timezone: 'America/Chicago' }) });
const base = fn => `https://app.example/.netlify/functions/${fn}`;
const get = async (h, fn, query) => { const r = await h(new Request(`${base(fn)}?${query}`)); return { status: r.status, body: await r.json() }; };
const post = async (h, fn, body) => { const r = await h(new Request(base(fn), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const audits = async op => (await pg.query("SELECT * FROM admin_action_log WHERE action='ping_operator' AND after_summary->>'op'=$1", [op])).rows;
const valid = { source_id: OP.source, onshore_operation: true, no_resale: true, consent_language_reviewed: true, attestation_document_ref: 'ATTEST-2027', expires_at: '2099-01-01' };

test('attestation actions are gated by SOURCE_ATTESTATIONS_ENABLED and add nothing to existing reads', async () => {
  assert.equal((await get(operator(S9_FEATURES), 'ping-operator', 'action=source_attestations')).status, 503);
  assert.equal((await post(operator(S9_FEATURES), 'ping-operator', { action: 'source_attestation', ...valid })).status, 503);
  assert.equal((await get(buyer(S9_FEATURES), 'ping-buyer', 'action=sources')).status, 503);
  const context = (await get(buyer(S9_FEATURES), 'ping-buyer', 'action=context')).body;
  assert.deepEqual(Object.keys(context.features).sort(), ['exchange', 'retention', 'scorecard', 'screener']);
  assert.equal((await get(buyer(), 'ping-buyer', 'action=context')).body.features.attestations, true);
  const sources = (await get(operator(), 'ping-operator', 'action=sources')).body.sources;
  assert.ok(sources.every(s => !('onshore_operation' in s)), 'the existing sources read is unchanged');
});

test('the operator records attestations and campaign requirements, audited before each write; invalid input writes nothing', async () => {
  const h = operator();
  assert.equal((await post(h, 'ping-operator', { action: 'source_attestation', ...valid, expires_at: '2020-01-01' })).status, 400);
  assert.equal((await post(h, 'ping-operator', { action: 'source_attestation', ...valid, extra: 1 })).status, 400);
  assert.equal((await audits('source_attestation')).length, 0);
  const missing = (await get(h, 'ping-operator', 'action=source_attestations')).body.sources.find(s => s.source_id === OP.source);
  assert.equal(missing.status, 'missing');
  const saved = await post(h, 'ping-operator', { action: 'source_attestation', ...valid });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.source.status, 'current');
  const [audit] = await audits('source_attestation');
  assert.equal(audit.actor_id, 'user_operator');
  assert.equal(audit.after_summary.attestation_document_ref, 'ATTEST-2027');
  const { rows: [row] } = await pg.query('SELECT attested_by,attested_at IS NOT NULL AS dated FROM lead_sources WHERE id=$1', [OP.source]);
  assert.deepEqual(row, { attested_by: 'user_operator', dated: true });
  assert.equal((await post(h, 'ping-operator', { action: 'source_attestation', ...valid, source_id: A.source })).status, 400, 'a buyer intake source is not an operator publisher');
  const required = await post(h, 'ping-operator', { action: 'campaign_attestations', campaign_id: campaigns.east, require_source_attestations: true });
  assert.equal(required.body.campaign.require_source_attestations, true);
  assert.equal((await audits('campaign_attestations')).length, 1);
});

test('the buyer sees status and expiry of the publishers that reach it, never the document reference', async () => {
  const view = await get(buyer(), 'ping-buyer', 'action=sources');
  assert.equal(view.status, 200);
  const publisher = view.body.sources.find(s => s.source_id === OP.source);
  assert.equal(publisher.status, 'current');
  assert.ok(publisher.expires_at);
  assert.ok(!JSON.stringify(view.body).includes('ATTEST-2027'));
  assert.ok(view.body.campaigns.every(c => typeof c.require_source_attestations === 'boolean'));
  assert.ok(view.body.campaigns.every(c => c.id === campaigns.east), 'only this tenant’s campaigns');
});

test('source_attestation_missing appears in the buyer scorecard rejects by reason', async () => {
  await setFeatures(pg, FLAGS);
  await pg.query("UPDATE lead_sources SET attested_at=now()-interval '2 days',attestation_expires_at=now()-interval '1 day' WHERE id=$1", [OP.source]);
  await exchangePing(pg, { phone: '+15550007401', callId: 'portal-att-1' });
  const from = new Date(Date.now() - 3600000).toISOString(); const to = new Date(Date.now() + 3600000).toISOString();
  const card = await get(buyer(), 'ping-buyer', `action=scorecard&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  assert.equal(card.status, 200);
  const rejects = card.body.rows.reduce((all, row) => ({ ...all, ...row.rejects_by_reason }), {});
  assert.ok(rejects.source_attestation_missing >= 1, JSON.stringify(card.body.rows));
});
