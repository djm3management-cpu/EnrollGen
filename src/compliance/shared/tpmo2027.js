// Approved MA script policy: completed within 60 seconds AND before benefits.
// CY2027 CMS timing requires before benefits; the first-minute limit is agency policy.
export const TPMO_RULE_VERSION = 'MA-2027-TPMO-v2';
const number = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)';
const org = new RegExp(`represent\\s+${number}\\s+(?:organizations?|carriers?)`, 'i');
const plans = new RegExp(`${number}\\s+(?:products?|plans?)\\s+in your area`, 'i');
export function hasMedicareResource(text) {
  return /medicare(?:\s*\.\s*gov|\s+dot\s+gov)|1\s*[-–—]?\s*800\s*[-–—]?\s*medicare/i.test(text);
}
export const hasTpmoOrgCount = text => org.test(text);
export const hasTpmoPlanCount = text => plans.test(text);
export function hasTpmo2027(text) {
  return org.test(text) && plans.test(text) && hasMedicareResource(text) &&
    /(?:all of your options|help with plan choices)/i.test(text) &&
    /(?:do not offer every plan|don't offer every plan|you can always contact)/i.test(text);
}
// Specific benefit/price discussion, excluding disclosure and generic permission/SOA.
const benefits = /(?:\b(?:(?:monthly )?premium|copay(?:ment)?|deductible|out.of.pocket maximum)\b|\b(?:plan|your|this|it)\s+(?:also\s+)?(?:covers?|includes?|offers?|has|provides?)\b|\b(?:dental|vision|hearing|grocery|food)\s+(?:benefit|allowance|coverage)\b)/i;
export function evaluateTpmo2027(utterances) {
  let text = '', disclaimer = null, firstBenefit = null;
  const ordered = [...utterances].sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0));
  for (const u of ordered) {
    if (!['agent', 'unknown', ''].includes(String(u.speaker || '').toLowerCase())) continue;
    const value = String(u.text || '');
    const benefit = benefits.exec(value);
    // Restrict accumulation to the disclosure passage, preventing unrelated references
    // elsewhere in a call from filling a missing disclaimer component.
    if (/\b(?:currently we represent|we currently represent|we do not offer every plan|we don't offer every plan)\b/i.test(value) && org.test(text)) text = '';
    const previousText = text;
    text += ` ${value}`;
    if (!disclaimer && hasTpmo2027(text)) {
      disclaimer = { ...u, text: text.trim(), completion_ms: u.end_ms ?? u.start_ms ?? null };
      // A benefit in the same utterance before the completed disclosure is late.
      if (benefit && !hasTpmo2027(previousText + value.slice(0, benefit.index))) firstBenefit ??= u;
    } else if (benefit) firstBenefit ??= u;
    if (benefit) text = '';
  }
  const beforeBenefits = !!disclaimer && (!firstBenefit ||
    (disclaimer.completion_ms != null && firstBenefit.start_ms != null && disclaimer.completion_ms <= firstBenefit.start_ms));
  const withinMinute = !!disclaimer && disclaimer.completion_ms != null && disclaimer.completion_ms <= 60000;
  return { disclaimer, firstBenefit, beforeBenefits, withinMinute, timingOk: beforeBenefits && withinMinute };
}
