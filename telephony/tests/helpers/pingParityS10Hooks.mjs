// Module hook for the S10 re-runs (migration 190): the unchanged parity, S2,
// S3, S4, S5, S6, S7, S8a and S9 suites get the S10 stand-ins in place of their database helpers.
// Nothing else is redirected. The S7 screener suites build their database
// through helpers/screenerHarness.js and the load baseline through
// helpers/pingLoadPglite.js, so those modules' imports are the ones redirected.
const PARITY = '/tests/pingParity.test.js';
const S2_SUITES = ['/tests/pingPublisherE2E.test.js', '/tests/pingS2Controls.test.js', '/tests/pingVoiceHook.test.js'];
const S3_SUITES = ['/tests/exchangeE2E.test.js', '/tests/exchangeV1Route.test.js'];
const S4_SUITES = ['/tests/pingFilterE2E.test.js', '/tests/exchangeRetention.test.js'];
const S5_SUITES = ['/tests/pingScorecardE2E.test.js', '/tests/pingPerformanceRouting.test.js'];
const S6_SUITES = ['/tests/pingCountyE2E.test.js', '/tests/pingRtsEligibilityE2E.test.js'];
const S7_HARNESS = '/tests/helpers/screenerHarness.js';
const S8_SUITES = ['/tests/pingSandbox.test.js', '/tests/pingLockNarrowing.test.js', '/tests/buyerV1Route.test.js'];
const S8_LOAD = '/tests/helpers/pingLoadPglite.js';
const S9_SUITES = ['/tests/leadPingPost.test.js', '/tests/leadV1Route.test.js', '/tests/dataVendors.test.js'];

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  const to = file => nextResolve(new URL(file, import.meta.url).href, context);
  if (specifier === './helpers/pingDb.js' && parent.endsWith(PARITY)) return to('./pingDbS10Parity.js');
  if (specifier === './helpers/pingS2Db.js' && S2_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS2DbS10.js');
  if (specifier === './helpers/exchangeDb.js' && S3_SUITES.some(suite => parent.endsWith(suite))) return to('./exchangeDbS10.js');
  if (specifier === './helpers/pingS4Db.js' && S4_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS4DbS10.js');
  if (specifier === './helpers/pingS5Db.js' && S5_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS5DbS10.js');
  if (specifier === './helpers/pingS6Db.js' && S6_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS6DbS10.js');
  if (specifier === './pingS7Db.js' && parent.endsWith(S7_HARNESS)) return to('./pingS7DbS10.js');
  if (specifier === './helpers/pingS8Db.js' && S8_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS8DbS10.js');
  if (specifier === './pingS8Db.js' && parent.endsWith(S8_LOAD)) return to('./pingS8DbS10.js');
  if (specifier === './helpers/pingS9Db.js' && S9_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS9DbS10.js');
  return nextResolve(specifier, context);
}
