// All vendor exports are built from explicit allowlists, never CRM row spreads.
export const dispositionFields = ['aggregator_call_id', 'twilio_call_sid', 'publisher', 'call_start_time', 'caller_phone', 'duration', 'disposition_code', 'sale'];
const safeOutcomes = new Set(['enrolled','enrolled_pending_verification','partial_enrollment','callback_scheduled','interested_needs_info','spouse_poa_callback','transferred','application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere','customer_hung_up','do_not_call','requested_removal','no_answer','no-answer','voicemail_left','voicemail','wrong_number','bad_lead_data','language_barrier','third_party_needed','hostile_caller','suspected_fraud','dropped_call','test_call','duplicate_lead','not_enrolled','incomplete','completed','canceled','busy','failed','declined','ringing','accepted','other']);
const forbidden = /health|diagnos|medical|medicaid|medicare|cognitive|mentally|plan|carrier|mbi|dob|birth|address|notes?|transcript|recording/i;
export function dispositionPayload(row) {
  return {
    aggregator_call_id: identifier(row.aggregator_call_id), twilio_call_sid: identifier(row.twilio_call_sid),
    publisher: identifier(row.publisher), call_start_time: new Date(row.call_start_time).toISOString(),
    caller_phone: /^\+[1-9]\d{7,14}$/.test(row.caller_phone || '') ? row.caller_phone : null,
    duration: Number.isFinite(Number(row.duration)) ? Math.max(0, Math.floor(Number(row.duration))) : 0,
    disposition_code: safeOutcomes.has(row.disposition_code) ? row.disposition_code : 'other',
    sale: row.sale === true,
  };
}
function identifier(value) {
  return typeof value === 'string' && /^[\w .:@+-]{1,128}$/.test(value) ? value : null;
}
export function validateFieldMap(map = {}) {
  if (map === null) return {};
  if (typeof map !== 'object' || Array.isArray(map)) throw Error('Invalid field map');
  const names = new Set();
  for (const field of dispositionFields) {
    const name = map[field] ?? field;
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || forbidden.test(name) || names.has(name)) throw Error('Unsafe or duplicate field mapping');
    names.add(name);
  }
  if (Object.keys(map).some(k => !dispositionFields.includes(k))) throw Error('Unknown mapped field');
  return map;
}
export function mappedDisposition(row, map) {
  map = validateFieldMap(map);
  return Object.fromEntries(Object.entries(dispositionPayload(row)).map(([k,v]) => [map[k] || k,v]));
}
export function availabilityPayload(feed, format = 'json') {
  if (format === 'simple') return { available: feed.any_available === true, count: feed.available_count };
  return {
    any_available: feed.any_available === true, available_count: feed.available_count,
    unavailable_count: feed.unavailable_count, total_count: feed.total_count,
    available_states: feed.available_states,
    agents: feed.agents.map(a => ({ agent_id: a.agent_id, agent_name: a.agent_name,
      available: a.available, status: a.status, licensed_states: a.licensed_states })),
  };
}
export function csvReport(rows) {
  const cell = v => {
    let text = v == null ? '' : String(v);
    // Prevent spreadsheet formulas, including +E.164 phone numbers.
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  return [dispositionFields.join(','), ...rows.map(row => {
    const safe = dispositionPayload(row);
    return dispositionFields.map(k => cell(safe[k])).join(',');
  })].join('\r\n') + '\r\n';
}
export function assertPrivateFieldsAbsent(payload) {
  if (!payload || typeof payload !== 'object') return;
  for (const [key,value] of Object.entries(payload)) {
    if (forbidden.test(key)) throw Error('Forbidden vendor field');
    assertPrivateFieldsAbsent(value);
  }
}
