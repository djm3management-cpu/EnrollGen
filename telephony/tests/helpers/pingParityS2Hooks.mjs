// Module hook for the S2 parity re-run: the unchanged pingParity.test.js gets
// pingDbS2Parity.js in place of ./helpers/pingDb.js. Nothing else is redirected.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === './helpers/pingDb.js' && context.parentURL?.endsWith('/tests/pingParity.test.js')) {
    return nextResolve(new URL('./pingDbS2Parity.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
