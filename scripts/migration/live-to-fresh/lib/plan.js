// The production -> fresh-install plan, as approved in
// docs/migration/live-to-fresh-mapping.md (Phase 1 answers Q1-Q17).
// Tables are discovered at runtime; this file only names exceptions.

import * as T from './transforms.js';
import { reencryptObjects, isEnvelope } from './pii.js';
import { quoteIdent } from './catalog.js';
import { stringifyLossless } from './json.js';
import * as ledger from './ledger.js';

// Not migrated, with the reason shown in reports.
export const NOT_MIGRATED = {
  cms_snp_conditions: 'OLD-only out-of-band table; exported to CSV for an owner decision (Q8)',
  quiz_leads: 'OLD-only out-of-band table with plaintext lead PII; exported to CSV for an owner decision (Q8)',
  availability_consumers: 'secrets: consumer key hashes; operator issues new scoped consumers',
  paragon_report_tokens: 'secrets: report token hash; operator re-issues',
  vendor_controls: 'vendor configuration; created paused by configure_deployment_vendor (Q11)',
  vendor_routing_config: 'vendor configuration (Q11)',
  vendor_agent_state_eligibility: 'vendor matrix; supplied through the profile (Q11) and used for roster licensed_states',
  paragon_residence_settings: 'vendor configuration (Q11)',
  agent_availability: 'live presence; provisioning creates offline rows',
  availability_agent_subjects: 'created by roster provisioning',
  recording_agent_subjects: 'created by roster provisioning',
  conversely_worker_status: 'worker heartbeat; recomputed at runtime',
  compliance_intents: 'canonical seed already in NEW; ids remapped by intent_code',
  knowledge_updates: 'job log of the knowledge refresh job (Q7)',
  qhp_landscape_2026: 'public reference with a changed NEW shape; operator import per P0-4 runbook',
  sbe_plans_nj_2025: 'public reference with a changed NEW shape; operator import per P0-4 runbook',
  sbe_plans_pa_2025: 'public reference with a changed NEW shape; operator import per P0-4 runbook',
  sbe_plans_va_2025: 'public reference with a changed NEW shape; operator import per P0-4 runbook',
};

// Q15: singletons whose OLD values overwrite NEW's install defaults.
export const SINGLETONS = { call_wrap_up_policy: 'singleton', telephony_presence_policy: 'singleton', compliance_runtime_control: 'id', integration_push_state: 'singleton' };

export const REFERENCE_TABLES = ['bulletins', 'bulletin_feed_status', 'cms_county_penetration', 'cms_plan_embeddings_py2027', 'cms_plans_py2027', 'dsnp_eae_lookup', 'fema_disasters', 'fema_feed_snapshot', 'plan_terminations', 'snp_plans_by_county', 'star_ratings_by_county', 'zip_county_crosswalk', 'csnp_carrier_verification', 'snp_routing_rules'];

export const PRE_PROVISION = ['tenants', 'enrolled_agents'];

// Tables whose migration is not a plain "every OLD row" copy; handled in index.
export const SUBSET_TABLES = ['scoring_templates', 'scoring_template_items', 'knowledge_base'];

export const EXCLUDED_EXPORTS = ['quiz_leads', 'cms_snp_conditions'];

const PLAINTEXT_CONTACT_COLUMNS = ['first_name', 'last_name', 'phone', 'email', 'dob', 'address'];

function objectEnvelopePrepare(column) {
  return async (list, ctx) => {
    const { encrypted } = await reencryptObjects(ctx.codec, list.map(m => m.row[column]));
    return list.map((m, i) => ({ ...m, row: { ...m.row, [column]: m.row[column] == null ? null : encrypted[i] } }));
  };
}

function singleEnvelopePrepare(column) {
  return async (list, ctx) => {
    const envs = list.map(m => m.row[column]);
    const plain = await ctx.codec.decryptMany(envs);
    const idx = [], values = [];
    plain.forEach((p, i) => { if (isEnvelope(envs[i])) { idx.push(i); values.push(p); } });
    const enc = await ctx.codec.encryptMany(values);
    const out = list.map(m => ({ ...m, row: { ...m.row } }));
    idx.forEach((i, j) => {
      if (enc[j] === null) out[i].reject = `pii_empty:${column}`;
      else out[i].row[column] = enc[j];
    });
    return out;
  };
}

async function contactsPrepare(list, ctx) {
  const { encrypted, plaintext } = await reencryptObjects(ctx.codec, list.map(m => m.row.pii_encrypted ?? {}),
    list.map(m => Object.fromEntries(PLAINTEXT_CONTACT_COLUMNS.map(c => [c, m.row[c]]))));
  const idx = await ctx.codec.contactIndexes(plaintext.map(f => ({ phone: f.phone ?? null, first_name: f.first_name ?? null, last_name: f.last_name ?? null })));
  return list.map((m, i) => {
    const row = { ...m.row, pii_encrypted: encrypted[i] || {}, phone_hash: idx[i].phone_hash, name_search: idx[i].name_search };
    for (const c of PLAINTEXT_CONTACT_COLUMNS) row[c] = null; // Q3
    return { ...m, row };
  });
}

async function ghlPrepare(list, ctx) {
  const envs = list.map(m => m.row.payload_encrypted);
  const plain = await ctx.codec.decryptMany(envs);
  const out = [];
  const enc = await ctx.newDb.query(
    `SELECT u.i, public.encrypt_pii_value((SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM jsonb_each(u.v::jsonb) WHERE key = ANY($2::text[]))::text)::text AS e,
            jsonb_typeof(u.v::jsonb) AS kind
       FROM unnest($1::text[]) WITH ORDINALITY u(v, i)`, [plain, ctx.ghlAllowlist]).catch(() => { throw Error('GHL snapshot minimization failed'); });
  const byI = new Map(enc.rows.map(r => [Number(r.i) - 1, r]));
  list.forEach((m, i) => {
    const r = byI.get(i);
    if (!r || r.kind !== 'object') out.push({ ...m, reject: 'invalid_snapshot:ghl_enrollment_deliveries.payload_encrypted' });
    else out.push({ ...m, row: { ...m.row, payload_encrypted: JSON.parse(r.e) } });
  });
  return out;
}

// Per-row insert with an id map, for agent_availability_log (uuid -> identity).
async function writeAvailabilityLog(db, list, ctx) {
  let n = 0;
  const cols = ctx.shape.cols, exprs = ctx.shape.exprs;
  for (const m of list) {
    const seen = await db.query(`SELECT 1 FROM migration_ledger.id_map WHERE kind='agent_availability_log' AND old_id=$1`, [m.key]);
    if (seen.rows.length) continue;
    const r = await db.query(`INSERT INTO public.agent_availability_log (${cols.map(quoteIdent).join(', ')})
      SELECT ${exprs.join(', ')} FROM jsonb_populate_recordset(NULL::public.agent_availability_log, $1::jsonb) r RETURNING id::text`, [stringifyLossless([m.row])]);
    await ledger.putIdMap(db, 'agent_availability_log', [[m.key, r.rows[0].id]]);
    n++;
  }
  return n;
}

// Returns the spec for one table (engine input), given runtime context.
export function tableSpec(table, ctx) {
  const anchor = ctx.anchors.get(table);
  const anchorSql = anchor ? T.retentionAnchorExpression(anchor) : 'clock_timestamp()';
  switch (table) {
    case 'tenants': return { table, map: T.mapTenant, conflict: `ON CONFLICT (id) DO UPDATE SET coop_rates=excluded.coop_rates, carrier_options=excluded.carrier_options, licensed_states=excluded.licensed_states, compliance_config=excluded.compliance_config, agency_npn=excluded.agency_npn, ghl_location_id=excluded.ghl_location_id, ghl_webhook_url=NULL, created_at=excluded.created_at, updated_at=excluded.updated_at` };
    case 'enrolled_agents': return { table, map: T.mapEnrolledAgent };
    case 'contacts': return { table, prepare: contactsPrepare, sqlColumns: { retention_last_activity_at: anchorSql } };
    case 'contact_activities': return { table, map: T.mapContactActivity };
    case 'contact_tags': return { table, prepare: singleEnvelopePrepare('name_encrypted') };
    case 'contact_merge_archive': return { table, prepare: singleEnvelopePrepare('encrypted_snapshot') };
    case 'opportunities': return { table, prepare: objectEnvelopePrepare('pii_encrypted') };
    case 'enrollment_intakes': return { table, prepare: objectEnvelopePrepare('pii_encrypted') };
    case 'ghl_enrollment_deliveries': return { table, prepare: ghlPrepare };
    case 'section_scores': return { table, map: T.mapSectionScore, produces: ['section_number', 'completed', 'duration_seconds', 'checklist_total', 'checklist_done'] };
    case 'call_records': return { table, map: T.mapCallRecord, sqlColumns: { ...T.CALL_RECORD_RETENTION_SQL } };
    case 'message_media': return { table, map: T.mapMessageMedia };
    case 'messages': return { table, map: T.mapMessage };
    case 'integration_deliveries': return { table, map: T.mapIntegrationDelivery };
    case 'agent_availability_log': return { table, skipColumns: ['id'], sourcePk: [{ name: 'id' }], write: writeAvailabilityLog };
    case 'scorecard_items': return { table, map: row => T.remapColumns(row, { template_item_id: ctx.itemMap, intent_id: ctx.intentMap }) };
    case 'intent_detections': return { table, map: row => T.remapColumns(row, { intent_id: ctx.intentMap }) };
    default: return { table };
  }
}

// Q5: scoring identity maps.
export async function buildScoringMaps(oldDb, newDb) {
  const sigSql = `SELECT i.template_id::text AS t, md5(string_agg(ci.intent_code||'|'||i.display_order||'|'||i.points_possible||'|'||i.is_critical||'|'||i.is_auto_fail||'|'||md5(i.question_text), ',' ORDER BY ci.intent_code)) AS sig
    FROM public.scoring_template_items i JOIN public.compliance_intents ci ON ci.id=i.intent_id GROUP BY 1`;
  const itemsSql = `SELECT i.id::text AS id, i.template_id::text AS t, ci.intent_code AS code FROM public.scoring_template_items i JOIN public.compliance_intents ci ON ci.id=i.intent_id`;
  const intentsSql = `SELECT id::text AS id, intent_code AS code FROM public.compliance_intents`;
  // Sequential: one pg client runs one query at a time.
  const oSig = await oldDb.query(sigSql), nSig = await newDb.query(sigSql);
  const oItems = await oldDb.query(itemsSql), nItems = await newDb.query(itemsSql);
  const oInt = await oldDb.query(intentsSql), nInt = await newDb.query(intentsSql);
  const refs = await oldDb.query(`SELECT DISTINCT template_id::text AS t FROM public.compliance_scorecards WHERE template_id IS NOT NULL UNION SELECT DISTINCT template_id::text FROM public.scoring_jobs WHERE template_id IS NOT NULL`);
  const nTemplates = await newDb.query(`SELECT id::text AS id FROM public.scoring_templates`);
  const newByCode = new Map(nInt.rows.map(r => [r.code, r.id]));
  const intentMap = new Map();
  for (const r of oInt.rows) if (newByCode.has(r.code)) intentMap.set(r.id, newByCode.get(r.code));
  const newTemplateIds = new Set(nTemplates.rows.map(r => r.id));
  const referenced = new Set(refs.rows.map(r => r.t));
  const newSigToId = new Map();
  for (const r of nSig.rows) if (!newSigToId.has(r.sig) || newTemplateIds.has(r.t)) newSigToId.set(r.sig, r.t);
  const templateMap = new Map(), insertTemplates = [];
  for (const { t, sig } of oSig.rows) {
    if (newTemplateIds.has(t)) templateMap.set(t, t);
    else if (referenced.has(t)) { insertTemplates.push(t); templateMap.set(t, t); }
    else if (newSigToId.has(sig)) templateMap.set(t, newSigToId.get(sig));
  }
  const newItemByKey = new Map(nItems.rows.map(r => [`${r.t}|${r.code}`, r.id]));
  const itemMap = new Map();
  for (const r of oItems.rows) {
    const nt = templateMap.get(r.t);
    if (!nt) continue;
    if (insertTemplates.includes(r.t)) itemMap.set(r.id, r.id);
    else if (newItemByKey.has(`${nt}|${r.code}`)) itemMap.set(r.id, newItemByKey.get(`${nt}|${r.code}`));
  }
  const unmatchedIntents = oInt.rows.length - intentMap.size;
  return { intentMap, itemMap, templateMap, insertTemplates, unmatchedIntents, oldTemplates: oSig.rows.length };
}

export function ghlAllowlistFrom(source) {
  const m = source && source.match(/ANY\(ARRAY\[([\s\S]*?)\]::text\[\]\)/);
  if (!m) throw Error('Could not read the GHL snapshot allowlist from NEW');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

