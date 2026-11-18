// Module hook for the S4 re-runs: the unchanged parity, S2 and S3 suites get
// the S4 stand-ins in place of their database helpers. Nothing else is redirected.
const PARITY = '/tests/pingParity.test.js';
const S2_SUITES = ['/tests/pingPublisherE2E.test.js', '/tests/pingS2Controls.test.js', '/tests/pingVoiceHook.test.js'];
const S3_SUITES = ['/tests/exchangeE2E.test.js', '/tests/exchangeV1Route.test.js'];

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  if (specifier === './helpers/pingDb.js' && parent.endsWith(PARITY)) {
    return nextResolve(new URL('./pingDbS4Parity.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS2Db.js' && S2_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS2DbS4.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/exchangeDb.js' && S3_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./exchangeDbS4.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
