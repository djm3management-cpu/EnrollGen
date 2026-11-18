// Re-runs the unchanged golden parity suite (pingParity.test.js), the S2
// suites, the S3 exchange suites, the S4 filter suites and the S5 scorecard
// and performance routing suites against a database that also has migrations
// 181 and 182, so RTS generation and county aware eligibility (manual source
// and both county switches off by default on every campaign) leave every
// Paragon parity case, direct generic ping, arrival, billing, pause, exchange
// auction, filter rule, scorecard and routing order exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
function run(files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Run as a standalone suite, not a subtest stream.
  const result = spawnSync(process.execPath, ['--import', './tests/fixtures/deployment-env.js',
    '--import', './tests/helpers/pingParityS6Register.mjs', '--test', '--test-reporter=tap', ...files],
  { cwd, encoding: 'utf8', timeout: 300000, env });
  const output = `${result.stdout}\n${result.stderr}`;
  const count = name => Number(output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1]);
  return { output, status: result.status, pass: count('pass'), fail: count('fail') };
}

test('golden parity holds with migrations 173 to 182 applied', () => {
  const { output, status, pass, fail } = run(['tests/pingParity.test.js']);
  assert.match(output, /ping-parity-s6-migrations-applied/, 'the S6 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass >= 35, `pass ${pass}`);
  assert.equal(status, 0);
});

test('the S2 publisher, controls and voice suites hold with 175 to 182 applied', () => {
  const { output, status, pass, fail } = run(['tests/pingPublisherE2E.test.js', 'tests/pingS2Controls.test.js',
    'tests/pingVoiceHook.test.js']);
  assert.match(output, /ping-s2-suite-s6-migrations-applied/, 'the S6 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass > 0, `pass ${pass}`);
  assert.equal(status, 0);
});

test('the S3 exchange end to end and route suites hold with 177 to 182 applied', () => {
  const { output, status, pass, fail } = run(['tests/exchangeE2E.test.js', 'tests/exchangeV1Route.test.js']);
  assert.match(output, /ping-s3-suite-s6-migrations-applied/, 'the S6 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass > 0, `pass ${pass}`);
  assert.equal(status, 0);
});

test('the S4 filter rule and exchange retention suites hold with 179 to 182 applied', () => {
  const { output, status, pass, fail } = run(['tests/pingFilterE2E.test.js', 'tests/exchangeRetention.test.js']);
  assert.match(output, /ping-s4-suite-s6-migrations-applied/, 'the S6 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass > 0, `pass ${pass}`);
  assert.equal(status, 0);
});

test('the S5 scorecard and performance routing suites hold with 181 and 182 applied', () => {
  const { output, status, pass, fail } = run(['tests/pingScorecardE2E.test.js', 'tests/pingPerformanceRouting.test.js']);
  assert.match(output, /ping-s5-suite-s6-migrations-applied/, 'the S6 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass > 0, `pass ${pass}`);
  assert.equal(status, 0);
});
