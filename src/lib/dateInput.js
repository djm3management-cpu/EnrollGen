// Date-only values must never pass through local-time/UTC conversions.
export function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) {
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!us) return '';
    match = [raw, us[3], us[1].padStart(2, '0'), us[2].padStart(2, '0')];
  }
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number(year) >= 1900 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}
