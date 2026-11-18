// Display helpers for the exchange screens: dense numbers, 12-hour times and
// dates in the tenant timezone.
const integer = new Intl.NumberFormat('en-US');

export const fmtInt = value => (value === null || value === undefined || value === '' ? '' : integer.format(Number(value)));
export const fmtMoney = (value, digits = 2) => (value === null || value === undefined || value === '' ? ''
  : `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`);
export const fmtRate = value => (value === null || value === undefined ? '' : `${(Number(value) * 100).toFixed(1)}%`);
export const fmtCap = value => (value === null || value === undefined ? 'None' : integer.format(value));

export function fmtDateTime(value, timeZone) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true });
}

export function fmtDate(value, timeZone) {
  if (!value) return '';
  // A bare YYYY-MM-DD is already a tenant calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  }
  return new Date(value).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
}

/** YYYY-MM-DD for `date` (default now) in the tenant timezone. */
export function dayIn(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export const monthIn = (timeZone, date = new Date()) => dayIn(timeZone, date).slice(0, 7);

export function addDays(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant a tenant calendar day starts, as ISO. */
export function dayStart(day, timeZone) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = at => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first)).toISOString();
}

export const shortId = value => (value ? String(value).slice(0, 8) : '');

/** '' means no value (null); anything else must be a whole number. */
export function nullableInt(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

export function nullableMoney(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export const titleCase = value => String(value ?? '').replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());
