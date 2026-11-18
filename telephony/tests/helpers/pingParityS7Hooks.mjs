// Module hook for the S7 re-runs: the unchanged parity, S2, S3, S4, S5 and S6
// suites get the S7 stand-ins in place of their database helpers. Nothing else is redirected.
const PARITY = '/tests/pingParity.test.js';
const S2_SUITES = ['/tests/pingPublisherE2E.test.js', '/tests/pingS2Controls.test.js', '/tests/pingVoiceHook.test.js'];
const S3_SUITES = ['/tests/exchangeE2E.test.js', '/tests/exchangeV1Route.test.js'];
const S4_SUITES = ['/tests/pingFilterE2E.test.js', '/tests/exchangeRetention.test.js'];
const S5_SUITES = ['/tests/pingScorecardE2E.test.js', '/tests/pingPerformanceRouting.test.js'];
const S6_SUITES = ['/tests/pingCountyE2E.test.js', '/tests/pingRtsEligibilityE2E.test.js'];

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  if (specifier === './helpers/pingDb.js' && parent.endsWith(PARITY)) {
    return nextResolve(new URL('./pingDbS7Parity.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS2Db.js' && S2_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS2DbS7.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/exchangeDb.js' && S3_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./exchangeDbS7.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS4Db.js' && S4_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS4DbS7.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS5Db.js' && S5_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS5DbS7.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS6Db.js' && S6_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS6DbS7.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
