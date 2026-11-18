// Pure mirror of the S5 reporting math in migrations 179 and 180. No I/O.
// Money and rates are exact decimals: values are scaled to integers with
// BigInt so sums never pick up binary floating point error, and rounding is
// half away from zero, as PostgreSQL round(numeric, n) does.

export const SCORECARD_GROUPS = Object.freeze(['source', 'sub_id', 'campaign', 'state', 'day']);
export const OPERATOR_GROUPS = Object.freeze([...SCORECARD_GROUPS, 'buyer_tenant']);
export const USAGE_KINDS = Object.freeze(['ping', 'routed_call', 'screener_minute', 'screened_qualified']);

const SCALE = 8; // Digits kept before rounding; usage prices carry 4, quantities 4.
const TEN = 10n;
const pow = n => TEN ** BigInt(n);

/** Parses a number or numeric string into a BigInt scaled by 10^SCALE. */
function toScaled(value) {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(SCALE) : 'NaN')
    : typeof value === 'bigint' ? value.toString() : String(value ?? 0).trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && !match[3])) throw new Error(`Not a decimal: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > SCALE) throw new Error(`Too many decimal places: ${value}`);
  const scaled = BigInt(whole || '0') * pow(SCALE) + BigInt(fraction.padEnd(SCALE, '0') || '0');
  return sign ? -scaled : scaled;
}

/** Divides a by b and rounds half away from zero, both BigInt. */
function divRound(a, b) {
  const negative = (a < 0n) !== (b < 0n);
  const [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  const q = (2n * x + y) / (2n * y);
  return negative ? -q : q;
}

/** Formats a BigInt scaled by 10^places as a Number with exactly that precision. */
function fromScaled(scaled, places) {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(places + 1, '0');
  const text = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
  return Number(negative ? `-${text}` : text);
}

/** round(value, places) half away from zero on the exact decimal. */
export function roundDecimal(value, places = 2) {
  return fromScaled(divRound(toScaled(value), pow(SCALE - places)), places);
}

/** Cent rounding, as round(numeric, 2). */
export const roundCents = value => roundDecimal(value, 2);

/**
 * numerator / denominator rounded to places, or null when the denominator is
 * 0 or missing. Mirrors accept_rate (4 places), cost_per_app and
 * cost_per_enrollment (2 places) in 179 and conversion (6 places) in 180.
 */
export function ratio(numerator, denominator, places) {
  if (denominator == null || toScaled(denominator) === 0n) return null;
  return fromScaled(divRound(toScaled(numerator) * pow(places), toScaled(denominator)), places);
}

export const acceptRate = (accepts, pings) => ratio(accepts, pings, 4);
export const costPer = (cost, count) => ratio(cost, count, 2);

/** Exact sum of decimals, unrounded. */
export function sumDecimal(values) {
  return fromScaled(values.reduce((sum, value) => sum + toScaled(value), 0n), SCALE);
}

/** Validates a group list as ping_scorecard_rows does; returns the list. */
export function validateGroups(groups = [], { operator = false } = {}) {
  const allowed = operator ? OPERATOR_GROUPS : SCORECARD_GROUPS;
  for (const group of groups) if (!allowed.includes(group)) throw new Error('Unknown scorecard group');
  return groups;
}

/**
 * One invoice line from usage events of one kind, as platform_invoice_lines:
 * the amount is the exact sum of quantity times unit_price rounded to cents
 * once, never per event. Events at unit_price 0 are inside the allowance.
 */
export function invoiceLine(kind, events) {
  let quantity = 0n; let included = 0n; let charged = 0n; let amount = 0n;
  for (const event of events) {
    const q = toScaled(event.quantity);
    const unit = toScaled(event.unit_price);
    quantity += q;
    if (unit === 0n) included += q; else charged += q;
    amount += q * unit; // Scaled by 10^(2*SCALE).
  }
  return { kind, quantity: fromScaled(quantity, SCALE), included_quantity: fromScaled(included, SCALE),
    charged_quantity: fromScaled(charged, SCALE), amount: fromScaled(divRound(amount, pow(2 * SCALE - 2)), 2) };
}

/** Lines in invoice order for the kinds that have events, and their total. */
export function invoice(events) {
  const lines = USAGE_KINDS.map(kind => events.filter(event => event.kind === kind))
    .map((group, index) => group.length ? { line_no: index + 1, ...invoiceLine(USAGE_KINDS[index], group) } : null)
    .filter(Boolean);
  return { lines, total: sumDecimal(lines.map(line => line.amount)) };
}

/**
 * Mirror of refresh_agent_performance (180): per agent {connected, enrolled}
 * to the conversion used for routing. Agents below minCalls, or without
 * calls, get the campaign average (total enrolled over total connected).
 */
export function agentConversions(stats, { minCalls = 20 } = {}) {
  const rows = Object.entries(stats);
  const connected = rows.reduce((sum, [, row]) => sum + Number(row.connected || 0), 0);
  const enrolled = rows.reduce((sum, [, row]) => sum + Number(row.enrolled || 0), 0);
  const average = ratio(enrolled, connected, 6) ?? 0;
  const conversions = Object.fromEntries(rows.map(([agent, row]) => {
    const calls = Number(row.connected || 0);
    return [agent, calls > 0 && calls >= minCalls ? ratio(row.enrolled || 0, calls, 6) : average];
  }));
  return { average, conversions };
}
