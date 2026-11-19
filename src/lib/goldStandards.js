// Shared Gold Standards constants and pure helpers for the browser and the
// server. No I/O. The metric math itself lives in
// telephony/src/ping/goldStandards.js (the mirror of migration 189).

export const GOLD_GROUP_LABELS = Object.freeze({
  source: 'Source', sub_id: 'Sub ID', agent: 'Agent', carrier: 'Carrier', agency: 'Agency', product_line: 'Product',
  snp_type: 'SNP type', agent_cohort_month: 'Agent cohort', effective_month: 'Effective month',
});
export const GOLD_GROUP_NAMES = Object.freeze(Object.keys(GOLD_GROUP_LABELS));

export const IMPORT_KINDS = Object.freeze(['member_status', 'ctm']);
export const MEMBER_EVENT_TYPES = Object.freeze(['effectuated', 'disenrolled', 'reinstated', 'terminated_by_carrier']);
export const CTM_CATEGORIES = Object.freeze(['enrollment_disenrollment', 'marketing', 'benefits_access', 'pricing_premium',
  'pharmacy', 'provider_network', 'customer_service', 'plan_administration', 'other']);
export const CTM_STATUSES = Object.freeze(['open', 'resolved']);

/** Fields a carrier column map may name, per import kind. */
export const IMPORT_FIELDS = Object.freeze({
  member_status: Object.freeze(['confirmation', 'carrier_member_id', 'mbi', 'effective_date', 'event_type',
    'event_effective_date', 'disenroll_reason_code']),
  ctm: Object.freeze(['confirmation', 'carrier_member_id', 'mbi', 'effective_date', 'cms_complaint_id', 'received_date',
    'category', 'status', 'resolution_code']),
});
/** Mapped values for these fields translate through mapping.values. */
export const VALUE_FIELDS = Object.freeze({ member_status: ['event_type'], ctm: ['category', 'status'] });
export const DATE_FIELDS = Object.freeze(['effective_date', 'event_effective_date', 'received_date']);
export const DATE_FORMATS = Object.freeze(['iso', 'mdy']);

export const ACTIVATION_ITEM_LABELS = Object.freeze({
  member_card: 'Member card received', pcp: 'Primary care provider assigned', pharmacy: 'Preferred pharmacy confirmed',
  supplemental_benefit: 'Supplemental benefit', member_reachable: 'Member reached, questions answered',
});
export const ACTIVATION_OUTCOMES = Object.freeze({ done: 'Done', not_applicable: 'Not applicable', member_declined: 'Member declined',
  unreachable: 'Unreachable' });
export const ACTIVATION_STATUSES = Object.freeze({ open: 'Open', completed: 'Completed', unreachable: 'Unreachable', cancelled: 'Cancelled' });

/** Lifecycle event types added by migration 188, with their audit packet names. */
export const GOLD_LIFECYCLE_TYPES = Object.freeze({
  member_effectuated: 'MemberEffectuated', member_disenrolled: 'MemberDisenrolled', member_reinstated: 'MemberReinstated',
  member_terminated_by_carrier: 'MemberTerminatedByCarrier', complaint_recorded: 'ComplaintRecorded',
  complaint_resolved: 'ComplaintResolved', activation_task_opened: 'ActivationTaskOpened',
  activation_item_recorded: 'ActivationItemRecorded', activation_task_closed: 'ActivationTaskClosed',
});

const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const header = value => typeof value === 'string' && value.trim().length >= 1 && value.length <= 200;

/**
 * Validates a carrier column map. Returns a normalized copy or throws an Error
 * naming the first problem. Shape:
 * { columns: {field: header}, values: {field: {fileValue: closedValue}},
 *   date_format: 'iso'|'mdy', narrative_columns: [header] }
 */
export function validateColumnMap(kind, mapping) {
  if (!IMPORT_KINDS.includes(kind)) throw new Error('Unknown import kind');
  if (!plainObject(mapping) || !plainObject(mapping.columns)) throw new Error('Mapping needs columns');
  for (const key of Object.keys(mapping)) if (!['columns', 'values', 'date_format', 'narrative_columns'].includes(key)) throw new Error(`Unknown mapping key ${key.slice(0, 40)}`);
  const columns = {};
  for (const [field, name] of Object.entries(mapping.columns)) {
    if (!IMPORT_FIELDS[kind].includes(field)) throw new Error(`Unknown field ${field.slice(0, 40)}`);
    if (!header(name)) throw new Error(`Invalid column for ${field}`);
    columns[field] = name.trim();
  }
  const required = kind === 'ctm' ? ['cms_complaint_id', 'received_date'] : ['event_type', 'event_effective_date'];
  for (const field of required) if (!columns[field]) throw new Error(`Mapping needs ${field}`);
  if (!['confirmation', 'carrier_member_id', 'mbi'].some(field => columns[field])) throw new Error('Mapping needs a matching key column');
  const values = {};
  if (mapping.values !== undefined) {
    if (!plainObject(mapping.values)) throw new Error('Invalid values');
    for (const [field, table] of Object.entries(mapping.values)) {
      if (!VALUE_FIELDS[kind].includes(field) || !plainObject(table)) throw new Error(`Invalid values for ${field.slice(0, 40)}`);
      const allowed = field === 'event_type' ? MEMBER_EVENT_TYPES : field === 'category' ? CTM_CATEGORIES : CTM_STATUSES;
      values[field] = {};
      for (const [from, to] of Object.entries(table)) {
        if (!header(from) || !allowed.includes(to)) throw new Error(`Invalid value map for ${field}`);
        values[field][from.trim().toUpperCase()] = to;
      }
    }
  }
  const dateFormat = mapping.date_format ?? 'iso';
  if (!DATE_FORMATS.includes(dateFormat)) throw new Error('Invalid date format');
  const narrative = mapping.narrative_columns ?? [];
  if (!Array.isArray(narrative) || narrative.length > 50 || !narrative.every(header)) throw new Error('Invalid narrative columns');
  if (narrative.some(name => Object.values(columns).includes(name.trim()))) throw new Error('A narrative column cannot be mapped');
  return { columns, values, date_format: dateFormat, narrative_columns: narrative.map(name => name.trim()) };
}

/** A worksheet value as YYYY-MM-DD in the map's format, or '' (never guessed). */
export function normalizeDate(value, format = 'iso') {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  let y; let m; let d;
  if (format === 'iso' && iso) [, y, m, d] = iso.map(Number);
  else if (format === 'mdy' && mdy) [, m, d, y] = mdy.map(Number);
  else return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return date.toISOString().slice(0, 10);
}

// Headers that carry free text. They are dropped at import and only their
// names are recorded; the content never leaves the parser.
const NARRATIVE = /narrative|description|comment|note|summary|detail|text|explanation|verbatim/i;

/**
 * Applies a validated column map to parsed rows ({header: value}). Returns
 * { rows, dropped } where rows hold only mapped fields plus row_number, and
 * dropped lists every narrative header that was present.
 */
export function applyColumnMap(kind, map, sheetRows, headers = Object.keys(sheetRows[0] || {})) {
  const dropped = headers.filter(name => map.narrative_columns.includes(String(name).trim()) || (NARRATIVE.test(String(name))
    && !Object.values(map.columns).includes(String(name).trim())));
  const rows = sheetRows.map((source, index) => {
    const row = { row_number: index + 2 };
    for (const [field, column] of Object.entries(map.columns)) {
      let value = source[column];
      value = value === null || value === undefined ? '' : String(value).trim();
      if (DATE_FIELDS.includes(field)) value = normalizeDate(value, map.date_format);
      else if (map.values[field] && value) value = map.values[field][value.toUpperCase()] ?? (field === 'category' ? 'other' : value);
      if (value !== '') row[field] = value.slice(0, field === 'mbi' ? 20 : 64);
    }
    return row;
  });
  return { rows, dropped: [...new Set(dropped.map(name => String(name).slice(0, 200)))] };
}

/** Aggregate-only CSV for a Gold Standards result. Labels resolve agency and agent ids when given. */
export function goldCsv(result, { agencyNames = {}, agentNames = {} } = {}) {
  const groups = result.group_by || [];
  const label = (dim, value) => (value === null || value === undefined ? 'Unattributed'
    : dim === 'agency' ? agencyNames[value] || value : dim === 'agent' ? agentNames[value] || value : value);
  const rate = metric => [metric?.rate ?? '', metric?.lo ?? '', metric?.hi ?? ''];
  const head = [...groups.map(dim => GOLD_GROUP_LABELS[dim]), 'Calls', 'Applications', 'Effectuated', 'Effectuation per call', 'Low', 'High',
    'Matured', 'Pending', 'Retained', 'Retention at RDP end', 'Low', 'High', 'Below 70%', 'Retained per 1,000 calls', 'Low', 'High',
    'Member-months', 'CTMs', 'CTM per 1,000 member-months', 'Low', 'High', 'Cost', 'Cost per retained', 'D-SNP share', 'Low', 'High'];
  const line = row => [...groups.map(dim => label(dim, row.key?.[dim])), row.calls ?? '', row.applications, row.effectuated,
    ...rate(row.effectuation_per_call), row.matured, row.pending, row.retained, ...rate(row.r_rdp),
    row.below_threshold === null || row.below_threshold === undefined ? '' : row.below_threshold ? 'yes' : 'no',
    ...rate(row.retained_per_1000_calls), row.member_months, row.ctms, ...rate(row.ctm_rate_per_1000_mm), row.cost ?? '',
    row.cost_per_retained ?? '', ...rate(row.dsnp_share)];
  const cell = value => { const text = String(value ?? ''); return /[",\n]/.test(text) || /^[=+\-@]/.test(text) ? `"${text.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"` : text; };
  return [head, ...(result.groups || []).map(line)].map(row => row.map(cell).join(',')).join('\n') + '\n';
}
