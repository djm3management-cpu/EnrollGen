// Re-runs the unchanged golden parity suite (pingParity.test.js), the S2
// suites and the S3 exchange suites against a database that also has
// migrations 177 and 178, so the S4 filter rules leave every Paragon parity
// case, direct generic ping, arrival, billing, pause and exchange auction as
// before while every campaign keeps its S4 fields null, zero or false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
function run(files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Run as a standalone suite, not a subtest stream.
  const result = spawnSync(process.execPath, ['--import', './tests/fixtures/deployment-env.js',
    '--import', './tests/helpers/pingParityS4Register.mjs', '--test', '--test-reporter=tap', ...files],
  { cwd, encoding: 'utf8', timeout: 300000, env });
  const output = `${result.stdout}\n${result.stderr}`;
  const count = name => Number(output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1]);
  return { output, status: result.status, pass: count('pass'), fail: count('fail') };
}

test('golden parity holds with migrations 173 to 178 applied', () => {
  const { output, status, pass, fail } = run(['tests/pingParity.test.js']);
  assert.match(output, /ping-parity-s4-migrations-applied/, 'the S4 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass >= 35, `pass ${pass}`);
  assert.equal(status, 0);
});

test('the S2 publisher, controls and voice suites hold with 175 to 178 applied', () => {
  const { output, status, pass, fail } = run(['tests/pingPublisherE2E.test.js', 'tests/pingS2Controls.test.js',
    'tests/pingVoiceHook.test.js']);
  assert.match(output, /ping-s2-suite-s4-migrations-applied/, 'the S4 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass > 0, `pass ${pass}`);
  assert.equal(status, 0);
});

test('the S3 exchange end to end and route suites hold with 177 and 178 applied', () => {
  const { output, status, pass, fail } = run(['tests/exchangeE2E.test.js', 'tests/exchangeV1Route.test.js']);
  assert.match(output, /ping-s3-suite-s4-migrations-applied/, 'the S4 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass > 0, `pass ${pass}`);
  assert.equal(status, 0);
});
