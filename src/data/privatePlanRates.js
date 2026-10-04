// No current personalized premium/rating basis is established by the supplied sources.
export const MEDMAX_RATES = {};
export const MEDACCESS_RATES = {};
export const MEDPERFORMANCE_RATES = {};
export const PRIVATE_PLAN_RATE_OPTIONS = {};
export const DEFAULT_PRIVATE_PLAN_RATE_OPTIONS = {};
export function getMedMaxBand() { return null; }
export function getMedAccessBand() { return null; }
export function getMedPerformanceBand() { return null; }
export function getPrivatePlanAgeBand() { return null; }
export function getPrivatePlanRates() { return null; } // verify with carrier

export function parseCustomerDob(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const dashMatch = input.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);

  let year;
  let month;
  let day;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (slashMatch || dashMatch) {
    const match = slashMatch || dashMatch;
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function getCustomerAgeFromDob(value, asOf = new Date()) {
  const dob = parseCustomerDob(value);
  if (!dob) return null;

  let age = asOf.getFullYear() - dob.year;
  const birthdayHasPassed =
    asOf.getMonth() + 1 > dob.month ||
    (asOf.getMonth() + 1 === dob.month && asOf.getDate() >= dob.day);

  if (!birthdayHasPassed) age -= 1;
  return age;
}

export function formatPrivatePlanCurrency(value, wholeDollars = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: wholeDollars ? 0 : 2,
    maximumFractionDigits: wholeDollars ? 0 : 2,
  }).format(value);
}
