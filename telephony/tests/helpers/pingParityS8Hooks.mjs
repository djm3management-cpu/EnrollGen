// Module hook for the S8 re-runs: the unchanged parity, S2, S3, S4, S5, S6 and
// S7 suites get the S8 stand-ins in place of their database helpers. Nothing
// else is redirected. The S7 screener suites build their database through
// helpers/screenerHarness.js, so that module's import of ./pingS7Db.js is the
// one redirected.
const PARITY = '/tests/pingParity.test.js';
const S2_SUITES = ['/tests/pingPublisherE2E.test.js', '/tests/pingS2Controls.test.js', '/tests/pingVoiceHook.test.js'];
const S3_SUITES = ['/tests/exchangeE2E.test.js', '/tests/exchangeV1Route.test.js'];
const S4_SUITES = ['/tests/pingFilterE2E.test.js', '/tests/exchangeRetention.test.js'];
const S5_SUITES = ['/tests/pingScorecardE2E.test.js', '/tests/pingPerformanceRouting.test.js'];
const S6_SUITES = ['/tests/pingCountyE2E.test.js', '/tests/pingRtsEligibilityE2E.test.js'];
const S7_HARNESS = '/tests/helpers/screenerHarness.js';

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  const to = file => nextResolve(new URL(file, import.meta.url).href, context);
  if (specifier === './helpers/pingDb.js' && parent.endsWith(PARITY)) return to('./pingDbS8Parity.js');
  if (specifier === './helpers/pingS2Db.js' && S2_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS2DbS8.js');
  if (specifier === './helpers/exchangeDb.js' && S3_SUITES.some(suite => parent.endsWith(suite))) return to('./exchangeDbS8.js');
  if (specifier === './helpers/pingS4Db.js' && S4_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS4DbS8.js');
  if (specifier === './helpers/pingS5Db.js' && S5_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS5DbS8.js');
  if (specifier === './helpers/pingS6Db.js' && S6_SUITES.some(suite => parent.endsWith(suite))) return to('./pingS6DbS8.js');
  if (specifier === './pingS7Db.js' && parent.endsWith(S7_HARNESS)) return to('./pingS7DbS8.js');
  return nextResolve(specifier, context);
}
