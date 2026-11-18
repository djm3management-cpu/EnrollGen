// Module hook for the S5 re-runs: the unchanged parity, S2, S3 and S4 suites
// get the S5 stand-ins in place of their database helpers. Nothing else is redirected.
const PARITY = '/tests/pingParity.test.js';
const S2_SUITES = ['/tests/pingPublisherE2E.test.js', '/tests/pingS2Controls.test.js', '/tests/pingVoiceHook.test.js'];
const S3_SUITES = ['/tests/exchangeE2E.test.js', '/tests/exchangeV1Route.test.js'];
const S4_SUITES = ['/tests/pingFilterE2E.test.js', '/tests/exchangeRetention.test.js'];

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  if (specifier === './helpers/pingDb.js' && parent.endsWith(PARITY)) {
    return nextResolve(new URL('./pingDbS5Parity.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS2Db.js' && S2_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS2DbS5.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/exchangeDb.js' && S3_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./exchangeDbS5.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS4Db.js' && S4_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS4DbS5.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
