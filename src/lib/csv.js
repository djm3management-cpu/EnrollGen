// Neutralize formulas even when spreadsheet parsers ignore leading whitespace.
export function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function callsCsv(rows) {
  const headers = ['Date/time', 'Direction', 'Contact', 'Phone', 'Duration (seconds)', 'Agent', 'Disposition', 'Compliance (%)'];
  return [headers, ...rows.map(row => [row.occurred_at, row.direction, row.contact_name, row.contact_phone,
    row.duration_seconds, row.agent, row.disposition, row.compliance_score])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function downloadCsv(csv, filename) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
