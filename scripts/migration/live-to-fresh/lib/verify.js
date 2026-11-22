// --verify: compare OLD and NEW. Prints and returns counts, hashes and
// identifiers of schema objects only, never row values.

import { createHash } from 'node:crypto';
import { quoteIdent, foreignKeys, primaryKeys } from './catalog.js';
import { sha256, isEnvelope } from './pii.js';
import { parseLossless } from './json.js';

const pkExpr = (alias, pk) => `concat_ws('|', ${pk.map(c => `to_jsonb(${alias}.${quoteIdent(c.name)})#>>'{}'`).join(', ')})`;
const digest = values => createHash('sha256').update(values.join('\n')).digest('hex');

export const EXTERNAL_ID_COLUMNS = {
  tenants: ['clerk_org_id', 'ghl_location_id'], tenant_agents: ['clerk_user_id', 'ghl_user_id'], enrolled_agents: ['clerk_user_id'],
  pii_access_log: ['clerk_user_id'], post_call_jobs: ['clerk_user_id', 'clerk_org_id', 'clerk_session_id'], contact_activities: ['actor_clerk_user_id'],
  carrier_rts: ['clerk_user_id'], user_preferences: ['clerk_user_id'],
  call_records: ['twilio_call_sid'], sessions: ['twilio_call_sid'], inbound_calls: ['twilio_call_sid', 'aggregator_call_id'], telephony_events: ['twilio_call_sid'],
  telephony_call_attempts: ['parent_call_sid', 'child_call_sid'], call_conferences: ['twilio_conference_sid', 'parent_call_sid'],
  call_participants: ['twilio_call_sid', 'stream_sid', 'recording_sid'], call_wrap_ups: ['call_sid'], stt_call_reconnects: ['call_sid'],
  recording_call_scopes: ['call_sid'], integration_link_issues: ['twilio_call_sid'], paragon_ping_decisions: ['matched_call_sid'],
  recording_ingestion: ['recording_sid', 'parent_call_sid', 'callback_call_sid', 'account_sid'], recording_reconciliation: ['parent_call_sid', 'account_sid'],
  conversely_submissions: ['id', 'confirmation_code', 'ix_receipt_id', 'twilio_recording_sid'], conversely_run_agents: ['submission_id'],
  conversely_week_slots: ['submission_id'], conversely_weekly_audit: ['submission_id', 'recording_sid'],
  ghl_enrollment_deliveries: ['confirmation_code', 'ix_receipt_id', 'twilio_recording_sid'], messages: ['twilio_message_sid'],
  contacts: ['ghl_contact_id'], subscriptions: ['stripe_customer_id', 'stripe_subscription_id'],
  paragon_call_billing: ['parent_call_sid', 'account_sid'], paragon_billing_events: ['parent_call_sid'], lead_sources: ['external_id', 'twilio_number'],
  paragon_report_email_log: ['provider_message_id'],
};

export async function verify({ oldDb, newDb, codec, plan, sampleSize = 100, log = () => {} }) {
  const out = { tables: [], externalIds: [], pii: {}, fk: {}, embeddings: [], scoring: {}, roster: {}, contacts: {} };
  const newPks = await primaryKeys(newDb), oldPks = await primaryKeys(oldDb);
  const rejects = new Map();
  for (const r of (await newDb.query(`SELECT table_name, old_pk FROM migration_ledger.rejects`)).rows) {
    if (!rejects.has(r.table_name)) rejects.set(r.table_name, new Set());
    rejects.get(r.table_name).add(r.old_pk);
  }
  const reasons = (await newDb.query(`SELECT table_name, reason, count(*)::int AS n FROM migration_ledger.rejects GROUP BY 1,2 ORDER BY 1,2`)).rows;
  out.rejectReasons = reasons;
  out.transforms = (await newDb.query(`SELECT table_name, kind, count(*)::int AS n FROM migration_ledger.transforms GROUP BY 1,2 ORDER BY 1,2`)).rows;

  // 1. Per-table counts: source = migrated + rejected.
  for (const table of plan.migrated) {
    const pk = oldPks.get(table);
    const src = (await oldDb.query(`SELECT ${pkExpr('t', pk)} AS k FROM public.${quoteIdent(table)} t`)).rows.map(r => r.k);
    const rej = rejects.get(table) || new Set();
    let migrated;
    if (table === 'agent_availability_log') {
      const m = await newDb.query(`SELECT old_id FROM migration_ledger.id_map m WHERE kind='agent_availability_log' AND EXISTS(SELECT 1 FROM public.agent_availability_log a WHERE a.id::text=m.new_id)`);
      const set = new Set(m.rows.map(r => r.old_id)); migrated = src.filter(k => set.has(k)).length;
    } else {
      const npk = newPks.get(table);
      const present = new Set((await newDb.query(`SELECT ${pkExpr('t', npk)} AS k FROM public.${quoteIdent(table)} t`)).rows.map(r => r.k));
      migrated = src.filter(k => present.has(k)).length;
    }
    const rejected = src.filter(k => rej.has(k)).length;
    out.tables.push({ table, source: src.length, migrated, rejected, balanced: src.length === migrated + rejected });
  }

  // 2. External identifiers, order-independent digest per column.
  for (const [table, cols] of Object.entries(EXTERNAL_ID_COLUMNS)) {
    if (!plan.migrated.includes(table)) continue;
    const pk = oldPks.get(table), rej = rejects.get(table) || new Set();
    for (const col of cols) {
      const o = (await oldDb.query(`SELECT ${pkExpr('t', pk)} AS k, t.${quoteIdent(col)}::text AS v FROM public.${quoteIdent(table)} t`)).rows.filter(r => !rej.has(r.k)).map(r => `${r.k}=${r.v ?? ''}`).sort();
      const n = (await newDb.query(`SELECT ${pkExpr('t', newPks.get(table))} AS k, t.${quoteIdent(col)}::text AS v FROM public.${quoteIdent(table)} t`)).rows.map(r => `${r.k}=${r.v ?? ''}`).sort();
      const keys = new Set(o.map(y => y.slice(0, y.indexOf('='))));
      const nFiltered = n.filter(x => keys.has(x.slice(0, x.indexOf('='))));
      out.externalIds.push({ table, column: col, rows: o.length, match: digest(o) === digest(nFiltered) });
    }
  }

  // 3. PII: sampled contacts plus every row of the smaller encrypted tables.
  const contactSample = (await oldDb.query(`SELECT id::text FROM public.contacts ORDER BY md5(id::text || 'enrollgen-verify') LIMIT $1`, [sampleSize])).rows.map(r => r.id);
  out.pii.contacts = await comparePii(oldDb, newDb, codec, 'contacts', 'pii_encrypted', contactSample, 'object');
  for (const [t, c, shape] of [['enrollment_intakes', 'pii_encrypted', 'object'], ['opportunities', 'pii_encrypted', 'object'], ['contact_tags', 'name_encrypted', 'single'], ['contact_merge_archive', 'encrypted_snapshot', 'single']]) {
    const ids = (await oldDb.query(`SELECT id::text FROM public.${quoteIdent(t)} WHERE ${quoteIdent(c)} IS NOT NULL`)).rows.map(r => r.id);
    out.pii[t] = await comparePii(oldDb, newDb, codec, t, c, ids, shape);
  }
  out.pii.ghl_enrollment_deliveries = await compareGhl(oldDb, newDb, codec, plan.ghlAllowlist);
  out.contacts.plaintextColumnsNonNull = Number((await newDb.query(`SELECT count(*) FROM public.contacts WHERE coalesce(first_name,last_name,phone,email,address) IS NOT NULL OR dob IS NOT NULL`)).rows[0].count);
  out.contacts.oldKeyIdsInNew = Number((await newDb.query(`SELECT count(*) FROM public.contacts c, jsonb_each(c.pii_encrypted) e WHERE jsonb_typeof(e.value)='object' AND NOT EXISTS(SELECT 1 FROM pii_vault.encryption_keys k WHERE k.key_id::text=e.value->>'k')`)).rows[0].count);
  out.contacts.blindIndexMismatches = await blindIndexCheck(newDb, codec);

  // 4. Foreign keys in NEW.
  let violations = 0; const bad = [];
  for (const fk of await foreignKeys(newDb)) {
    const cond = fk.cols.map(c => `c.${quoteIdent(c)} IS NOT NULL`).join(' AND ');
    const join = fk.cols.map((c, i) => `p.${quoteIdent(fk.pcols[i])} = c.${quoteIdent(c)}`).join(' AND ');
    const n = Number((await newDb.query(`SELECT count(*) FROM public.${quoteIdent(fk.child)} c WHERE ${cond} AND NOT EXISTS(SELECT 1 FROM ${quoteIdent(fk.parentSchema)}.${quoteIdent(fk.parent)} p WHERE ${join})`)).rows[0].count);
    if (n) { violations += n; bad.push({ constraint: fk.name, child: fk.child, rows: n }); }
  }
  out.fk = { checked: (await foreignKeys(newDb)).length, violations, bad };

  // 5. Embeddings.
  for (const t of ['transcript_chunks', 'cms_plan_embeddings_py2027']) {
    const q = `SELECT count(embedding)::int AS n, min(vector_dims(embedding)) AS dmin, max(vector_dims(embedding)) AS dmax, md5(string_agg(id::text || ':' || embedding::text, ',' ORDER BY id)) AS h FROM public.${quoteIdent(t)}`;
    const [o, n] = [(await oldDb.query(q)).rows[0], (await newDb.query(q)).rows[0]];
    out.embeddings.push({ table: t, old: Number(o.n), new: Number(n.n), dims: `${n.dmin}..${n.dmax}`, identical: o.h === n.h && Number(o.n) === Number(n.n) });
  }

  // 6. Scoring references.
  out.scoring = {
    scorecardsMissingTemplate: Number((await newDb.query(`SELECT count(*) FROM public.compliance_scorecards s WHERE template_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.scoring_templates t WHERE t.id=s.template_id)`)).rows[0].count),
    jobsMissingTemplate: Number((await newDb.query(`SELECT count(*) FROM public.scoring_jobs s WHERE template_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.scoring_templates t WHERE t.id=s.template_id)`)).rows[0].count),
    itemsMissingTemplateItem: Number((await newDb.query(`SELECT count(*) FROM public.scorecard_items s WHERE template_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.scoring_template_items t WHERE t.id=s.template_item_id)`)).rows[0].count),
    distinctTemplatesReferenced: Number((await newDb.query(`SELECT count(DISTINCT template_id) FROM public.compliance_scorecards`)).rows[0].count),
    itemsRemapped: Number((await newDb.query(`SELECT count(*) FROM public.scorecard_items s JOIN public.scoring_template_items t ON t.id=s.template_item_id`)).rows[0].count),
  };
  // Same rubric content per scorecard item: OLD item content == NEW item content.
  const contentSql = `SELECT s.id::text AS id, ci.intent_code||'|'||t.points_possible||'|'||md5(t.question_text) AS c FROM public.scorecard_items s JOIN public.scoring_template_items t ON t.id=s.template_item_id JOIN public.compliance_intents ci ON ci.id=t.intent_id`;
  const oc = new Map((await oldDb.query(contentSql)).rows.map(r => [r.id, r.c]));
  let same = 0, diff = 0;
  for (const r of (await newDb.query(contentSql)).rows) { if (!oc.has(r.id)) continue; if (oc.get(r.id) === r.c) same++; else diff++; }
  out.scoring.itemContentSame = same; out.scoring.itemContentDifferent = diff;

  // 7. Roster bindings created by provisioning equal OLD.
  for (const t of ['availability_agent_subjects', 'recording_agent_subjects']) {
    const q = `SELECT agent_slug||'|'||clerk_user_id AS k FROM public.${t} ${t === 'availability_agent_subjects' ? 'WHERE is_active' : ''}`;
    const [o, n] = [(await oldDb.query(q)).rows.map(r => r.k).sort(), (await newDb.query(q)).rows.map(r => r.k).sort()];
    out.roster[t] = { old: o.length, new: n.length, identical: digest(o) === digest(n) };
  }
  log('verify complete');
  return out;
}

async function comparePii(oldDb, newDb, codec, table, column, ids, shape) {
  if (!ids.length) return { rows: 0, fields: 0, match: 0, mismatch: 0 };
  const q = `SELECT id::text, ${quoteIdent(column)}::text AS e FROM public.${quoteIdent(table)} WHERE id = ANY($1::uuid[])`;
  const [o, n] = [await oldDb.query(q, [ids]), await newDb.query(q, [ids])];
  const nById = new Map(n.rows.map(r => [r.id, r.e ? parseLossless(r.e) : null]));
  const oSlots = [], nSlots = [];
  for (const r of o.rows) {
    const oe = r.e ? parseLossless(r.e) : null, ne = nById.get(r.id);
    if (shape === 'single') { if (isEnvelope(oe)) { oSlots.push(oe); nSlots.push(ne ?? null); } continue; }
    for (const [f, env] of Object.entries(oe || {})) if (isEnvelope(env)) { oSlots.push(env); nSlots.push(ne?.[f] ?? null); }
  }
  const [op, np] = [await codec.decryptMany(oSlots), await codec.decryptNewMany(nSlots)];
  let match = 0, mismatch = 0;
  op.forEach((p, i) => { if (sha256(p) === sha256(np[i])) match++; else mismatch++; });
  return { rows: o.rows.length, fields: oSlots.length, match, mismatch };
}

async function compareGhl(oldDb, newDb, codec, allowlist) {
  const q = `SELECT id::text, payload_encrypted::text AS e FROM public.ghl_enrollment_deliveries WHERE payload_encrypted IS NOT NULL ORDER BY id`;
  const [o, n] = [(await oldDb.query(q)).rows, new Map((await newDb.query(q)).rows.map(r => [r.id, parseLossless(r.e)]))];
  const op = await codec.decryptMany(o.map(r => parseLossless(r.e)));
  const np = await codec.decryptNewMany(o.map(r => n.get(r.id) ?? null));
  // Expected NEW plaintext = OLD plaintext minimized by NEW's allowlist (jsonb text form).
  const exp = await newDb.query(`SELECT u.i, (SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(u.v::jsonb) WHERE key = ANY($2::text[]))::text AS m FROM unnest($1::text[]) WITH ORDINALITY u(v,i)`, [op, allowlist]);
  const byI = new Map(exp.rows.map(r => [Number(r.i) - 1, r.m]));
  let match = 0, mismatch = 0;
  op.forEach((_, i) => { if (sha256(byI.get(i)) === sha256(np[i])) match++; else mismatch++; });
  return { rows: o.length, fields: o.length, match, mismatch, note: 'compared after NEW snapshot minimization' };
}

async function blindIndexCheck(newDb, codec) {
  const rows = (await newDb.query(`SELECT id::text, pii_encrypted::text AS e, phone_hash, name_search FROM public.contacts ORDER BY id`)).rows;
  const objs = rows.map(r => parseLossless(r.e || '{}'));
  const slots = [];
  objs.forEach((o, i) => { for (const f of ['phone', 'first_name', 'last_name']) if (isEnvelope(o[f])) slots.push({ i, f, e: o[f] }); });
  const plain = await codec.decryptNewMany(slots.map(s => s.e));
  const fields = rows.map(() => ({}));
  slots.forEach((s, j) => { fields[s.i][s.f] = plain[j]; });
  const idx = await codec.contactIndexes(fields.map(f => ({ phone: f.phone ?? null, first_name: f.first_name ?? null, last_name: f.last_name ?? null })));
  let mismatches = 0;
  rows.forEach((r, i) => { if ((r.phone_hash ?? null) !== (idx[i].phone_hash ?? null) || (r.name_search ?? null) !== (idx[i].name_search ?? null)) mismatches++; });
  return mismatches;
}
