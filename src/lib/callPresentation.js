function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCallTime(value) {
  return validDate(value)?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) || '--';
}

export function formatCallDateTime(value) {
  const date = validDate(value);
  return date ? `${date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })} ${formatCallTime(value)}` : '--';
}

export function formatTalk(seconds) {
  if (seconds == null || seconds === '' || !Number.isFinite(Number(seconds))) return '--';
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function summarizeContactCalls(rows) {
  const latest = rows.reduce((last, row) => !last || new Date(row.occurred_at) > new Date(last.occurred_at) ? row : last, null);
  return { total: rows.length, lastDisposition: latest?.disposition || null, lastAgent: latest?.agent || null, lastCallTime: latest?.occurred_at || null };
}
