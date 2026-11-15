import {securityEvent} from './logger.js';
import {FEATURE_NAMES,serverFeatureEnvironment,parseFeatureFlag as parseFlag} from './featureFlags.js';
export {FEATURE_NAMES,serverFeatureEnvironment};
export function parseFeatureFlag(value,name){try{return parseFlag(value,name);}catch(error){securityEvent('configuration_failed');throw error;}}
export function deploymentFeatures(env = serverFeatureEnvironment()) {
  return Object.freeze(Object.fromEntries(FEATURE_NAMES.map(name => [name, parseFeatureFlag(env[name], name)])));
}
export function featureEnabled(name, env = serverFeatureEnvironment()) {
  if (!FEATURE_NAMES.includes(name)) throw new Error(`Unknown deployment feature flag ${name}`);
  return parseFeatureFlag(env[name], name);
}
export function disabledResponse(feature) {
  securityEvent("feature_disabled");
  return Response.json({ status: 'disabled', error: 'Feature disabled for this deployment', feature },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
export function featureHeaders(env = serverFeatureEnvironment()) {
  return { 'x-enrollgen-features': JSON.stringify(deploymentFeatures(env)) };
}
export function billingDisabledEntitlement(tenantId) {
  return { tenant_id: tenantId, plan: 'billing_disabled', status: 'active', seat_count: 1000000, billing_disabled: true };
}
// Fail before any service starts its timers, clients or handlers.
deploymentFeatures();
