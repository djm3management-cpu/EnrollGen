export const OBJECTION_CATEGORIES = Object.freeze(['price','network_or_doctor','drug_coverage','wants_to_think','spouse_or_family','trust','already_covered','other']);
export const NO_COMPLIANT_SUGGESTION = 'No compliant suggestion was produced.';
export const COACHING_DEFAULTS = Object.freeze({minimum_talk_seconds:120,daily_cap:100});
export function coachingSettings(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid coaching settings');
  const value={...COACHING_DEFAULTS,...input};
  if(!Number.isInteger(value.minimum_talk_seconds)||value.minimum_talk_seconds<30||value.minimum_talk_seconds>21600||!Number.isInteger(value.daily_cap)||value.daily_cap<1||value.daily_cap>1000||Object.keys(value).some(k=>!Object.hasOwn(COACHING_DEFAULTS,k)))throw new Error('Invalid coaching settings');
  return value;
}
