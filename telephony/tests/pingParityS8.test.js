// Re-runs the unchanged golden parity suite (pingParity.test.js), the S2
// suites (including the /twilio/voice golden), the S3 exchange suites, the S4
// filter suites, the S5 scorecard and performance routing suites, the S6 RTS
// and county suites and the S7 screener suites against a database that also
// has migration 184. Lock narrowing, the agent re-check, the sandbox column
// (default false) and the buyer API objects must leave every Paragon parity
// case, generic ping, arrival, voice TwiML, billing, pause, exchange auction,
// filter rule, scorecard, routing order, county decision and screener flow
// exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
function run(files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Run as a standalone suite, not a subtest stream.
  const result = spawnSync(process.execPath, ['--import', './tests/fixtures/deployment-env.js',
    '--import', './tests/helpers/pingParityS8Register.mjs', '--test', '--test-reporter=tap', ...files],
  { cwd, encoding: 'utf8', timeout: 300000, env });
  const output = `${result.stdout}\n${result.stderr}`;
  const count = name => Number(output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1]);
  return { output, status: result.status, pass: count('pass'), fail: count('fail') };
}

function holds(files, marker, minimum = 1) {
  const { output, status, pass, fail } = run(files);
  assert.match(output, marker, 'the S8 database was used');
  assert.equal(fail, 0, output.slice(-4000));
  assert.ok(pass >= minimum, `pass ${pass}`);
  assert.equal(status, 0);
  return pass;
}

test('golden parity holds with migrations 173 to 184 applied', () => {
  holds(['tests/pingParity.test.js'], /ping-parity-s8-migrations-applied/, 35);
});

test('the S2 publisher, controls and voice suites hold with 175 to 184 applied', () => {
  holds(['tests/pingPublisherE2E.test.js', 'tests/pingS2Controls.test.js', 'tests/pingVoiceHook.test.js'],
    /ping-s2-suite-s8-migrations-applied/);
});

test('the S3 exchange end to end and route suites hold with 177 to 184 applied', () => {
  holds(['tests/exchangeE2E.test.js', 'tests/exchangeV1Route.test.js'], /ping-s3-suite-s8-migrations-applied/);
});

test('the S4 filter rule and exchange retention suites hold with 179 to 184 applied', () => {
  holds(['tests/pingFilterE2E.test.js', 'tests/exchangeRetention.test.js'], /ping-s4-suite-s8-migrations-applied/);
});

test('the S5 scorecard and performance routing suites hold with 181 to 184 applied', () => {
  holds(['tests/pingScorecardE2E.test.js', 'tests/pingPerformanceRouting.test.js'], /ping-s5-suite-s8-migrations-applied/);
});

test('the S6 county and RTS eligibility suites hold with 183 and 184 applied', () => {
  holds(['tests/pingCountyE2E.test.js', 'tests/pingRtsEligibilityE2E.test.js'], /ping-s6-suite-s8-migrations-applied/);
});

test('the S7 screener suites hold with 184 applied', () => {
  holds(['tests/screenerE2E.test.js', 'tests/screenerFlow.test.js', 'tests/screenerGating.test.js',
    'tests/screenerHygiene.test.js'], /ping-s7-suite-s8-migrations-applied/);
});
