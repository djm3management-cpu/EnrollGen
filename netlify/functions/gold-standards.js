// Gold Standards: member status and CTM imports, the unmatched queue, CTM
// resolution, column maps and the scorecards (docs/feature-gold-standards.md).
// Verified Clerk only. The tenant comes from the protected identity, never
// from input. Every SQL write routine checks protected admin authority again
// and appends its own admin_action_log row in the same transaction; the CSV
// export is logged here before any bytes are returned. Reads are one
// evidence_access_log event per request. Each action has its own flag.
import { randomUUID } from 'node:crypto';
import { requireClerkAuth } from './_clerkAuth.js';
import { getEvidenceServiceClient, resolveCallAccessIdentity, evidenceJson, evidenceFailure, EvidenceError } from './_evidenceAccess.js';
import { auditedEvidenceAccess } from '../../telephony/src/lib/evidenceAudit.js';
import { serverRequest } from '../../telephony/src/lib/adminActions.js';
import { securityEvent } from '../../telephony/src/lib/logger.js';
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';
import { featureEnabled } from '../../telephony/src/lib/deploymentFeatures.js';
import { validateGoldGroups } from '../../telephony/src/ping/goldStandards.js';
import { admitGold } from './_admission.js';
import { readRtsUploadForm, parseRtsFile, sha256Hex } from './_rtsIngestion.js';
import { IMPORT_KINDS, validateColumnMap, applyColumnMap, goldCsv } from '../../src/lib/goldStandards.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KIND_FLAG = { member_status: 'MEMBER_STATUS_IMPORT_ENABLED', ctm: 'CTM_IMPORT_ENABLED' };

function checked(result) {
  if (result.error) throw new EvidenceError({ 42501: 403, 22023: 400, 40001: 409, 23505: 409 }[result.error.code] || 503, 'Gold Standards request failed.');
  return result.data;
}
const bad = message => { throw new EvidenceError(400, message); };
const text = (value, max, name) => (typeof value === 'string' && value.trim().length >= 1 && value.length <= max ? value.trim() : bad(`Invalid ${name}.`));
const day = (value, name) => (typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : bad(`Invalid ${name}.`));

/** Parses the group list (comma separated) and validates it against the allowed groupings. */
export function parseGroups(value) {
  const groups = value ? String(value).split(',').map(part => part.trim()).filter(Boolean) : [];
  try { return validateGoldGroups(groups); } catch { return bad('Invalid group.'); }
}

/** The operator is an administrator of the deployment's own tenant. */
export const isGoldOperator = (identity, profile) => Boolean(identity?.admin === true && identity.tenant?.id && identity.tenant.id === profile.tenantId);

export function createGoldStandardsHandler({ authenticate = request => requireClerkAuth(request, { allowBypass: false }),
  getDb = getEvidenceServiceClient, env = process.env } = {}) {
  const on = name => featureEnabled(name, env);
  return serverRequest('gold-standards', async request => {
    if (!Object.values(KIND_FLAG).concat('GOLD_STANDARDS_METRICS_ENABLED').some(on)) return evidenceJson(404, { error: 'Not found.' });
    if (!['GET', 'POST'].includes(request.method)) return evidenceJson(405, { error: 'Use GET or POST.' });
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb(env); const profile = deploymentProfile(env);
      const identity = await resolveCallAccessIdentity(db, auth);
      if (identity.admin !== true) throw new EvidenceError(403, 'Administrator access required.');
      const actor = { p_actor: auth.userId, p_org: auth.orgId || auth.tokenPayload?.o?.id || null };
      const tenant = identity.tenant.id; const operator = isGoldOperator(identity, profile);
      const url = new URL(request.url);
      const action = request.method === 'GET' ? url.searchParams.get('action') : url.searchParams.get('action') || null;
      return await auditedEvidenceAccess(db, { actor: auth.userId, tenant, resource: 'gold_standards', action: action === 'export' ? 'export' : request.method === 'GET' ? 'list' : 'read' }, async () => {
        if (request.method === 'GET') {
          const p = url.searchParams;
          const need = flag => { if (!on(flag)) throw new EvidenceError(404, 'Not found.'); };
          if (action === 'context') {
            return evidenceJson(200, { operator, features: { metrics: on('GOLD_STANDARDS_METRICS_ENABLED'), member_import: on('MEMBER_STATUS_IMPORT_ENABLED'),
              ctm_import: on('CTM_IMPORT_ENABLED'), activation: on('BENEFIT_ACTIVATION_ENABLED'), attestations: on('SOURCE_ATTESTATIONS_ENABLED') } });
          }
          if (['scorecard', 'network', 'export'].includes(action)) {
            need('GOLD_STANDARDS_METRICS_ENABLED');
            const network = action === 'network' || (action === 'export' && p.get('scope') === 'network');
            if (network && !operator) throw new EvidenceError(403, 'Operator access required.');
            const from = day(p.get('from'), 'from'); const to = day(p.get('to'), 'to'); const groups = parseGroups(p.get('group'));
            const year = p.get('plan_year') ? Number(p.get('plan_year')) : null;
            if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) bad('Invalid plan year.');
            await admitGold(db, action === 'export' ? 'goldExport' : 'goldRead', auth.userId, profile);
            const result = checked(network
              ? await db.rpc('gold_standard_network_scorecard', { p_from: from, p_to: to, p_group_by: groups, p_plan_year: year })
              : await db.rpc('gold_standard_scorecard', { p_tenant: tenant, p_from: from, p_to: to, p_group_by: groups, p_plan_year: year }));
            if (action !== 'export') return evidenceJson(200, result);
            const logged = await db.from('admin_action_log').insert({ request_id: randomUUID(), actor_id: auth.userId, tenant_id: tenant,
              action: 'gold_standards_export', target_type: network ? 'network' : 'agency', target_id: 'collection', result: 'succeeded',
              before_summary: {}, after_summary: { op: 'export_csv', from, to, group_by: groups, rows: result.groups.length } });
            if (logged.error) { securityEvent('admin_log_write_failed', { subject: auth.userId }); throw new EvidenceError(503, 'Administrator action log unavailable.'); }
            const csv = goldCsv(result, { agencyNames: result.agency_names || {}, agentNames: result.agent_names || {} });
            return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
              'Content-Disposition': `attachment; filename="gold-standards-${from}-to-${to}.csv"` } });
          }
          if (action === 'unmatched' || action === 'maps') {
            const kind = p.get('kind'); if (!IMPORT_KINDS.includes(kind)) bad('Invalid kind.');
            need(KIND_FLAG[kind]);
            await admitGold(db, 'goldRead', auth.userId, profile);
            return evidenceJson(200, action === 'maps'
              ? { maps: checked(await db.rpc('read_member_column_maps', { ...actor, p_kind: kind })) }
              : checked(await db.rpc('read_member_unmatched', { ...actor, p_kind: kind, p_limit: 200 })));
          }
          if (action === 'ctms') {
            need('CTM_IMPORT_ENABLED');
            const status = p.get('status') || 'open'; if (!['open', 'resolved'].includes(status)) bad('Invalid status.');
            await admitGold(db, 'goldRead', auth.userId, profile);
            return evidenceJson(200, checked(await db.rpc('read_ctm_records', { ...actor, p_status: status, p_limit: 200 })));
          }
          bad('Unknown action.');
        }
        if (action === 'import') {
          const form = await readRtsUploadForm(request).catch(error => bad(error.message));
          const kind = form.get('kind'); if (!IMPORT_KINDS.includes(kind)) bad('Invalid kind.');
          if (!on(KIND_FLAG[kind])) throw new EvidenceError(404, 'Not found.');
          const carrier = text(form.get('carrier'), 100, 'carrier'); const asOf = day(form.get('as_of'), 'file date');
          const file = form.get('file'); if (!file || typeof file.arrayBuffer !== 'function') bad('A file is required.');
          await admitGold(db, 'goldImport', auth.userId, profile);
          const maps = checked(await db.rpc('read_member_column_maps', { ...actor, p_kind: kind }));
          const stored = (Array.isArray(maps) ? maps : []).find(m => m.carrier === carrier);
          if (!stored) bad('No column map for this carrier.');
          let map; try { map = validateColumnMap(kind, stored.mapping); } catch (error) { bad(error.message); }
          let parsed; try { parsed = await parseRtsFile(file); } catch (error) { bad(error.message); }
          const { rows, dropped } = applyColumnMap(kind, map, parsed.rows, parsed.headers);
          if (rows.length > 3000) bad('A file holds at most 3,000 rows.');
          const result = checked(await db.rpc('member_status_import', { ...actor, p_kind: kind, p_carrier: carrier,
            p_file_hash: await sha256Hex(file), p_as_of: asOf, p_rows: rows, p_dropped: dropped }));
          return evidenceJson(200, result);
        }
        let input; try { const body = await request.text(); if (body.length > 20000) throw new Error(); input = JSON.parse(body || '{}'); } catch { bad('Invalid request.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Invalid request.');
        const kind = input.kind;
        switch (input.action) {
          case 'link': case 'dismiss': {
            if (!UUID.test(input.row || '') || (input.action === 'link' && !UUID.test(input.enrollment_intake_id || ''))) bad('Invalid request.');
            await admitGold(db, 'goldWrite', auth.userId, profile);
            return evidenceJson(200, checked(input.action === 'link'
              ? await db.rpc('member_link_unmatched', { ...actor, p_row: input.row, p_intake: input.enrollment_intake_id, p_reason: text(input.reason, 500, 'reason') })
              : await db.rpc('member_dismiss_unmatched', { ...actor, p_row: input.row, p_reason: text(input.reason, 500, 'reason') })));
          }
          case 'resolve_ctm': {
            if (!on('CTM_IMPORT_ENABLED')) throw new EvidenceError(404, 'Not found.');
            if (!UUID.test(input.id || '') || typeof input.code !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(input.code)) bad('Invalid request.');
            await admitGold(db, 'goldWrite', auth.userId, profile);
            return evidenceJson(200, checked(await db.rpc('resolve_ctm', { ...actor, p_ctm: input.id, p_code: input.code, p_reason: text(input.reason, 1000, 'reason') })));
          }
          case 'save_map': {
            if (!IMPORT_KINDS.includes(kind) || !on(KIND_FLAG[kind])) bad('Invalid kind.');
            let map; try { map = validateColumnMap(kind, input.mapping); } catch (error) { bad(error.message); }
            await admitGold(db, 'goldWrite', auth.userId, profile);
            return evidenceJson(200, checked(await db.rpc('save_member_column_map', { ...actor, p_kind: kind, p_carrier: text(input.carrier, 100, 'carrier'), p_mapping: map })));
          }
          default: return bad('Unknown action.');
        }
      });
    } catch (error) { return evidenceFailure(error); }
  });
}

export default createGoldStandardsHandler();
export const config = { path: '/api/gold-standards' };
