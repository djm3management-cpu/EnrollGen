import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { getDeterministicBlockers } from '../netlify/functions/_deterministicBlockers.js';

const state = {
  recordingOk: false, tpmoOk: true, tpmoZip: '08540', tpmoOrgs: '4', tpmoPlans: '24',
  soaOk: true, sobOk: true,
  enrollChecks: { epConfirmed: true, piiConsent: true, planConfirm: true, submitConsent: true },
  notes: { planName: 'Fixture plan', effectiveDate: '2027-01-01' },
};

test('server blocker helper supports a native ESM named import and returns the recording blocker', () => {
  assert.deepEqual(getDeterministicBlockers(state), [{
    id: 'recording_missing', severity: 'high', label: 'Recording disclosure incomplete',
    detail: 'Complete the recording disclosure before advancing the sale.',
  }]);
});

test('esbuild CommonJS function bundle preserves the named export without module-format warnings', async () => {
  const result = await build({
    entryPoints: ['netlify/functions/_deterministicBlockers.js'],
    bundle: true, platform: 'node', target: 'node22', format: 'cjs', write: false, logLevel: 'silent',
  });
  assert.deepEqual(result.warnings, []);
  const bundledModule = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(bundledModule, bundledModule.exports);
  assert.deepEqual(bundledModule.exports.getDeterministicBlockers(state), getDeterministicBlockers(state));
});
