// A deployment can override the buyer API admission limit (S9). The key was
// missing from the admissionLimits allowlist, so any override failed the profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDeploymentProfile } from '../src/lib/deploymentProfile.js';
import { limitsFor, PILOT_LIMITS } from '../src/lib/admission.js';

const base = JSON.parse(readFileSync(new URL('../../tests/fixtures/deployment-profile.json', import.meta.url), 'utf8'));
const withLimits = admissionLimits => parseDeploymentProfile({ ...base, admissionLimits });

test('admissionLimits accepts a buyerApi override and limitsFor applies it', () => {
  const profile = withLimits({ buyerApi: { minute: 45 } });
  assert.equal(profile.admissionLimits.buyerApi.minute, 45);
  assert.equal(limitsFor('buyerApi', profile).minute, 45);
});

test('without an override the pilot buyerApi limit stays in force', () => {
  const profile = withLimits({ vendorPing: { minute: 900 } });
  assert.equal(limitsFor('buyerApi', profile).minute, PILOT_LIMITS.buyerApi.minute);
  assert.equal(limitsFor('vendorPing', profile).minute, 900);
});

test('unknown routes and out of range buyerApi values are still refused', () => {
  assert.throws(() => withLimits({ buyerApiX: { minute: 10 } }), /admissionLimits/);
  assert.throws(() => withLimits({ buyerApi: { minute: 0 } }), /admissionLimits value/);
  assert.throws(() => withLimits({ buyerApi: { hourly: 10 } }), /admissionLimits value/);
});
