// Pure row-mapping functions. Each takes an OLD row (lossless-parsed object)
// and returns { row } or { reject: reason }, optionally with `transform`
// entries that the engine records in migration_ledger.transforms. None of
// these functions log, and none put row values into a reason or transform.

import { exactText } from './json.js';

const ok = (row, transform = []) => ({ row, transform });

// Q2: production allows contact_activities.type = 'sms'; NEW does not.
export const NEW_CONTACT_ACTIVITY_TYPES = ['call', 'enrollment', 'note', 'status_change', 'follow_up'];
export function mapContactActivity(row) {
  if (NEW_CONTACT_ACTIVITY_TYPES.includes(row.type)) return ok(row);
  if (row.type === 'sms') return ok({ ...row, type: 'note' }, [{ kind: 'type_mapped', detail: { from: 'sms', to: 'note' } }]);
  return { reject: 'invalid_enum:contact_activities.type' };
}

// OLD section_scores.notes holds JSON text {section_number, completed,
// duration_seconds}; NEW has those as columns and drops score/max_score/notes.
export function mapSectionScore(row) {
  let notes;
  try { notes = typeof row.notes === 'string' ? JSON.parse(row.notes) : null; } catch { notes = null; }
  const n = notes?.section_number;
  if (n === undefined || n === null || !Number.isFinite(Number(n))) return { reject: 'missing_required:section_scores.section_number' };
  const { notes: _n, score: _s, max_score: _m, ...rest } = row;
  const duration = notes.duration_seconds;
  return ok({
    ...rest,
    section_number: Number(n),
    completed: typeof notes.completed === 'boolean' ? notes.completed : false,
    duration_seconds: duration === null || duration === undefined ? null : Number(duration),
    checklist_total: null,
    checklist_done: null,
  }, [{ kind: 'notes_split', detail: {} }]);
}

// Q12: Google Drive recording links embed an API key. Remove only the key
// parameter and keep the file reference. The key value is never returned.
export function stripGoogleApiKey(url) {
  if (typeof url !== 'string' || !url.startsWith('https://www.googleapis.com/')) return { url, stripped: false };
  let parsed;
  try { parsed = new URL(url); } catch { return { url, stripped: false }; }
  if (!parsed.searchParams.has('key')) return { url, stripped: false };
  parsed.searchParams.delete('key');
  return { url: parsed.toString(), stripped: true };
}
export function mapCallRecord(row) {
  const { url, stripped } = stripGoogleApiKey(row.recording_url);
  return ok({ ...row, recording_url: url }, stripped ? [{ kind: 'credential_param_stripped', detail: { column: 'recording_url', param: 'key' } }] : []);
}

// Signed storage URLs are capabilities; storage_path is the durable reference.
export function isSignedStorageUrl(url) {
  return typeof url === 'string' && /^https:\/\/[^/]+\/storage\/v1\/object\/sign\//.test(url) && /[?&]token=/.test(url);
}
export function mapMessageMedia(row) {
  if (!isSignedStorageUrl(row.media_url)) return ok(row);
  return ok({ ...row, media_url: null }, [{ kind: 'capability_url_removed', detail: { column: 'media_url' } }]);
}

export function mapMessage(row) {
  return row.body === null || row.body === undefined ? ok({ ...row, body: '' }) : ok(row);
}

// Q14: stale leases on terminal deliveries are cleared.
export function mapIntegrationDelivery(row) {
  if (row.lease_token == null && row.lease_expires_at == null && row.lease_until == null) return ok(row);
  const out = { ...row, lease_token: null };
  if ('lease_expires_at' in row) out.lease_expires_at = null;
  if ('lease_until' in row) out.lease_until = null;
  return ok(out, [{ kind: 'lease_cleared', detail: {} }]);
}

// Q10/Q3: tenants keep their non-secret settings; the webhook URL is dropped.
export function mapTenant(row) {
  const t = row.ghl_webhook_url ? [{ kind: 'secret_removed', detail: { column: 'ghl_webhook_url' } }] : [];
  return ok({ ...row, ghl_webhook_url: null }, t);
}

export function mapEnrolledAgent(row, ctx) {
  if (ctx.rosterClerkIds.has(row.clerk_user_id)) return ok(row);
  return ok({ ...row, is_active: false }, row.is_active ? [{ kind: 'deactivated_non_roster', detail: {} }] : []);
}

// Generic remap through an id map. Missing mappings reject the row.
export function remapColumns(row, maps) {
  const out = { ...row };
  for (const [column, map] of Object.entries(maps)) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    const mapped = map.get(exactText(value));
    if (!mapped) return { reject: `unmapped_reference:${column}` };
    out[column] = mapped;
  }
  return ok(out);
}

// Retention: NEW's retention_anchor_insert trigger uses the named anchor column
// (falling back to clock_timestamp()). The engine applies the same rule in SQL.
export function retentionAnchorExpression(anchor) {
  if (!anchor) return null;
  if (!/^[a-z_][a-z0-9_]*$/.test(anchor)) throw Error('Invalid retention anchor');
  return `coalesce((to_jsonb(r)->>'${anchor}')::timestamptz, clock_timestamp())`;
}

// NEW's call_records.retention_classification trigger, as an SQL expression
// over the populated record r (applied because replica mode skips triggers).
export const CALL_RECORD_RETENTION_SQL = {
  retention_enrollment_evidence: `(coalesce(r.enrollment_completed,false) OR coalesce(r.app_written,false) OR nullif(r.enrollment_confirmation_number,'') IS NOT NULL OR nullif(r.enrollment_code,'') IS NOT NULL OR nullif(r.sunfire_code,'') IS NOT NULL OR coalesce(r.call_outcome IN ('enrolled','enrolled_pending_verification','partial_enrollment','sale_ancillary'),false))`,
};
CALL_RECORD_RETENTION_SQL.retention_marketing_evidence = `(${CALL_RECORD_RETENTION_SQL.retention_enrollment_evidence} OR coalesce(r.call_type IN ('sales','marketing'),false) OR coalesce(r.call_outcome IN ('interested_needs_info','application_in_progress'),false))`;

// Q8: CSV export of excluded tables (values written to a private file only).
export function toCsv(columns, rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(cell).join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

// Profile staffed hours from vendor_controls.staffed_hours {timezone, days}.
export function profileStaffedHours(staffed) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const src = staffed?.days || {};
  return Object.fromEntries(days.map(d => {
    const v = src[d] || {};
    return [d, { enabled: v.enabled === true, start: v.start || '09:00', end: v.end || '17:00' }];
  }));
}
