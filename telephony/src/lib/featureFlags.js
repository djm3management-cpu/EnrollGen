// Environment-safe feature parsing shared with the browser LLM client.
export const FEATURE_NAMES = Object.freeze([
  'CLIENT_RECAP_ENABLED', 'POST_CALL_COACHING_ENABLED',
  'CONSUMER_LIFECYCLE_ENABLED', 'RETENTION_PURGE_ENABLED', 'PARAGON_ENABLED', 'PARAGON_STATE_ROUTING_ENABLED', 'GHL_ENABLED',
  'STRIPE_BILLING_ENABLED', 'DAILY_VERSE_ENABLED', 'CONVERSELY_UPLOAD_ENABLED',
  'IX_UPLOAD_ENABLED', 'IX_REPORT_ENABLED', 'CONFERENCE_CALLING_ENABLED',
  'SCORING_ENABLED', 'TRANSCRIPT_GAP_FILL_ENABLED',
  'TRANSCRIPT_AUTO_RECOVERY_ENABLED', 'OPERATIONAL_EMAIL_ENABLED',
]);

export function parseFeatureFlag(value, name = 'feature flag') {
  if (value === undefined || value === null || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  // Never include the value: misconfigured settings can contain credentials.
  throw new Error(`Invalid deployment feature flag ${name}: expected exactly true or false (unset means false)`);
}
export function serverFeatureEnvironment() {
  return globalThis.process?.env || Object.fromEntries(FEATURE_NAMES.map(name => [name, globalThis.Deno?.env.get(name)]));
}
export function deploymentFeatures(env = serverFeatureEnvironment()) {
  return Object.freeze(Object.fromEntries(FEATURE_NAMES.map(name => [name, parseFeatureFlag(env[name], name)])));
}
export function featureEnabled(name, env = serverFeatureEnvironment()) {
  if (!FEATURE_NAMES.includes(name)) throw new Error(`Unknown deployment feature flag ${name}`);
  return parseFeatureFlag(env[name], name);
}
