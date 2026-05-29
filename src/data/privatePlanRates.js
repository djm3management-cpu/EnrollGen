export const MEDMAX_RATES = {
  "18-29": {
    250: { employee: 369, spouse: 689, children: 709, family: 959 },
    500: { employee: 349, spouse: 669, children: 659, family: 909 },
    750: { employee: 329, spouse: 649, children: 639, family: 889 },
    1000: { employee: 309, spouse: 629, children: 619, family: 869 },
    1500: { employee: 289, spouse: 609, children: 599, family: 849 },
  },
  "30-44": {
    250: { employee: 439, spouse: 759, children: 739, family: 999 },
    500: { employee: 409, spouse: 709, children: 699, family: 969 },
    750: { employee: 389, spouse: 679, children: 669, family: 939 },
    1000: { employee: 369, spouse: 659, children: 649, family: 909 },
    1500: { employee: 339, spouse: 639, children: 623, family: 889 },
  },
  "45-54": {
    250: { employee: 469, spouse: 769, children: 759, family: 1049 },
    500: { employee: 439, spouse: 749, children: 739, family: 1019 },
    750: { employee: 419, spouse: 719, children: 709, family: 999 },
    1000: { employee: 399, spouse: 699, children: 689, family: 979 },
    1500: { employee: 379, spouse: 689, children: 669, family: 959 },
  },
  "55-64": {
    250: { employee: 519, spouse: 789, children: 769, family: 1079 },
    500: { employee: 489, spouse: 769, children: 749, family: 1059 },
    750: { employee: 469, spouse: 749, children: 729, family: 1019 },
    1000: { employee: 449, spouse: 729, children: 719, family: 999 },
    1500: { employee: 429, spouse: 719, children: 679, family: 979 },
  },
};

export const MEDACCESS_RATES = {
  mvp_basic: {
    "18-45": { employee: 432.84, spouse: 776.12, children: 670.15, family: 997.01 },
    "46-64": { employee: 550, spouse: 878.57, children: 777.14, family: 1090 },
  },
  mvp_pro: {
    "18-45": { employee: 567.16, spouse: 1097.01, children: 886.57, family: 1455.22 },
    "46-64": { employee: 714.29, spouse: 1221.43, children: 1020, family: 1564.29 },
  },
};

export const MEDPERFORMANCE_RATES = {
  "7350_value": {
    "18-29": { employee: 621.5, spouse: 1116.74, children: 1027.79, family: 1611.99 },
    "30-39": { employee: 639.29, spouse: 1152.32, children: 1059.81, family: 1665.36 },
    "40-49": { employee: 661.48, spouse: 1196.7, children: 1099.76, family: 1731.94 },
    "50-59": { employee: 683.3, spouse: 1240.33, children: 1139.02, family: 1797.38 },
    "60-64": { employee: 707.06, spouse: 1287.85, children: 1181.79, family: 1868.66 },
  },
  "5000_classic": {
    "18-29": { employee: 694.11, spouse: 1259.45, children: 1156.48, family: 1824.8 },
    "30-39": { employee: 714.7, spouse: 1300.64, children: 1193.55, family: 1886.59 },
    "40-49": { employee: 740.4, spouse: 1352.02, children: 1239.8, family: 1963.66 },
    "50-59": { employee: 765.65, spouse: 1402.52, children: 1285.25, family: 2039.41 },
    "60-64": { employee: 793.15, spouse: 1457.54, children: 1334.76, family: 2121.94 },
  },
  "3500_classic": {
    "18-29": { employee: 731.44, spouse: 1332.82, children: 1222.64, family: 1934.21 },
    "30-39": { employee: 753.47, spouse: 1376.89, children: 1262.31, family: 2000.32 },
    "40-49": { employee: 780.96, spouse: 1431.87, children: 1311.79, family: 2082.79 },
    "50-59": { employee: 807.98, spouse: 1485.91, children: 1360.42, family: 2163.84 },
    "60-64": { employee: 837.42, spouse: 1544.77, children: 1413.4, family: 2252.14 },
  },
};

export const PRIVATE_PLAN_RATE_OPTIONS = {
  medperformance: [
    { key: "7350_value", label: "7350 Value" },
    { key: "5000_classic", label: "5000 Classic" },
    { key: "3500_classic", label: "3500 Classic" },
  ],
  medmax: [
    { key: 250, label: "$250", rateLabel: "$250 Deductible" },
    { key: 500, label: "$500", rateLabel: "$500 Deductible" },
    { key: 750, label: "$750", rateLabel: "$750 Deductible" },
    { key: 1000, label: "$1,000", rateLabel: "$1,000 Deductible" },
    { key: 1500, label: "$1,500", rateLabel: "$1,500 Deductible" },
  ],
  medaccess: [
    { key: "mvp_basic", label: "MVP Basic" },
    { key: "mvp_pro", label: "MVP Pro" },
  ],
};

export const DEFAULT_PRIVATE_PLAN_RATE_OPTIONS = {
  medperformance: "5000_classic",
  medmax: 750,
  medaccess: "mvp_pro",
};

export function getMedMaxBand(age) {
  if (age >= 18 && age <= 29) return "18-29";
  if (age >= 30 && age <= 44) return "30-44";
  if (age >= 45 && age <= 54) return "45-54";
  if (age >= 55 && age <= 64) return "55-64";
  return null;
}

export function getMedAccessBand(age) {
  if (age >= 18 && age <= 45) return "18-45";
  if (age >= 46 && age <= 64) return "46-64";
  return null;
}

export function getMedPerformanceBand(age) {
  if (age >= 18 && age <= 29) return "18-29";
  if (age >= 30 && age <= 39) return "30-39";
  if (age >= 40 && age <= 49) return "40-49";
  if (age >= 50 && age <= 59) return "50-59";
  if (age >= 60 && age <= 64) return "60-64";
  return null;
}

export function getPrivatePlanAgeBand(productId, age) {
  if (!Number.isInteger(age)) return null;
  if (productId === "medmax") return getMedMaxBand(age);
  if (productId === "medaccess") return getMedAccessBand(age);
  if (productId === "medperformance") return getMedPerformanceBand(age);
  return null;
}

export function getPrivatePlanRates(productId, optionKey, ageBand) {
  if (!ageBand) return null;
  if (productId === "medmax") return MEDMAX_RATES[ageBand]?.[Number(optionKey)] || null;
  if (productId === "medaccess") return MEDACCESS_RATES[optionKey]?.[ageBand] || null;
  if (productId === "medperformance") return MEDPERFORMANCE_RATES[optionKey]?.[ageBand] || null;
  return null;
}

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
