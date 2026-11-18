// Module hook for the S3 re-runs: the unchanged parity and S2 suites get the
// S3 stand-ins in place of their database helpers. Nothing else is redirected.
const PARITY = '/tests/pingParity.test.js';
const S2_SUITES = ['/tests/pingPublisherE2E.test.js', '/tests/pingS2Controls.test.js', '/tests/pingVoiceHook.test.js'];

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  if (specifier === './helpers/pingDb.js' && parent.endsWith(PARITY)) {
    return nextResolve(new URL('./pingDbS3Parity.js', import.meta.url).href, context);
  }
  if (specifier === './helpers/pingS2Db.js' && S2_SUITES.some(suite => parent.endsWith(suite))) {
    return nextResolve(new URL('./pingS2DbS3.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
