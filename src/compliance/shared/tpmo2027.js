// CY2027: disclaimer completion must precede benefits, regardless of elapsed time.
export const TPMO_RULE_VERSION = 'MA-CY2027-2026-10-01';
const number = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)';
const gap = '[\\s,;:]+';
const fillers = `(?:(?:about|approximately|around|uh|um|your)${gap}){0,3}`;
const org = new RegExp(`represent${gap}${fillers}${number}${gap}(?:organizations?|carriers?)`, 'i');
const plans = new RegExp(`${number}${gap}(?:products?|plans?)\\s+in your area`, 'i');
export function hasMedicareResource(text) {
  return /medicare(?:\s*\.\s*gov|\s+dot\s+gov)|1\s*[-–—]?\s*800\s*[-–—]?\s*medicare/i.test(text);
}
export const hasTpmoOrgCount = text => org.test(text);
export const hasTpmoPlanCount = text => plans.test(text);
export function hasTpmo2027(text) {
  return org.test(text) && plans.test(text) && hasMedicareResource(text) &&
    /(?:all (?:of )?your options|help with plan choices)/i.test(text) &&
    /(?:do not offer every plan|don't offer every plan|you can always contact)/i.test(text);
}
// Specific benefit/price discussion, excluding disclosure and generic permission/SOA.
const benefits = /(?:\b(?:(?:monthly )?premium|copay(?:ment)?|deductible|out.of.pocket maximum)\b|\b(?:plan|your|this|it)\s+(?:also\s+)?(?:covers?|includes?|offers?|has|provides?)\b|\b(?:dental|vision|hearing|grocery|food)\s+(?:benefit|allowance|coverage)\b)/i;
export function evaluateTpmo2027(utterances) {
  let text = '', disclaimer = null, firstBenefit = null, earlyDisclosure = null;
  let passageStart = null, passageActive = false;
  const ordered = [...utterances].sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0));
  for (const u of ordered) {
    if (!['agent', 'unknown', ''].includes(String(u.speaker || '').toLowerCase())) continue;
    const value = String(u.text || '');
    const benefit = benefits.exec(value);
    // Restrict accumulation to the disclosure passage, preventing unrelated references
    // elsewhere in a call from filling a missing disclaimer component.
    const startsDisclosure = /\b(?:currently we represent|we currently represent|we do not offer every plan|we don't offer every plan)\b/i;
    if ((startsDisclosure.test(value) && (!passageActive || org.test(text))) ||
      (passageStart != null && u.start_ms != null && u.start_ms - passageStart > 90000)) {
      text = ''; passageActive = false; passageStart = null;
    }
    const previousText = text;
    text += ` ${value}`;
    if (!passageActive && startsDisclosure.test(text)) {
      passageActive = true;
      passageStart = u.start_ms ?? null;
    }
    // Avoid stitching distant counts and referrals into a single disclosure.
    if (!passageActive) text = text.slice(-600);
    if (!earlyDisclosure && !firstBenefit && org.test(text) && plans.test(text) && hasMedicareResource(text) &&
      /(?:do not offer every plan|don't offer every plan|you can always contact)/i.test(text)) {
      earlyDisclosure = { ...u, text: text.trim(), start_ms: passageStart ?? u.start_ms,
        completion_ms: u.end_ms ?? u.start_ms ?? null };
    }
    if (!disclaimer && hasTpmo2027(text)) {
      disclaimer = { ...u, text: text.trim(), start_ms: passageStart ?? u.start_ms,
        completion_ms: u.end_ms ?? u.start_ms ?? null };
      // A benefit in the same utterance before the completed disclosure is late.
      if (benefit && !hasTpmo2027(previousText + value.slice(0, benefit.index))) firstBenefit ??= u;
    } else if (benefit) firstBenefit ??= u;
    if (benefit) { text = ''; passageActive = false; passageStart = null; }
  }
  const beforeBenefits = !!disclaimer && (!firstBenefit ||
    (disclaimer.completion_ms != null && firstBenefit.start_ms != null && disclaimer.completion_ms <= firstBenefit.start_ms));
  // An earlier substantial disclosure with uncertain wording needs review. It
  // earns no automatic completion credit, but a later repeat cannot prove that
  // the first disclosure occurred late.
  const timingUncertain = !beforeBenefits && !!earlyDisclosure && !!firstBenefit &&
    earlyDisclosure.completion_ms != null && firstBenefit.start_ms != null &&
    earlyDisclosure.completion_ms <= firstBenefit.start_ms;
  return { disclaimer, firstBenefit, earlyDisclosure, beforeBenefits, timingOk: beforeBenefits, timingUncertain };
}
