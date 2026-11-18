// Re-runs the unchanged golden parity suite (pingParity.test.js) against a
// database that also has migrations 173 and 174, so the S2 replacements of
// ping_decide and ping_hours_open keep every Paragon parity case green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('golden parity holds with migrations 173 and 174 applied', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Run as a standalone suite, not a subtest stream.
  const run = spawnSync(process.execPath, ['--import', './tests/fixtures/deployment-env.js',
    '--import', './tests/helpers/pingParityS2Register.mjs', '--test', '--test-reporter=tap', 'tests/pingParity.test.js'],
  { cwd, encoding: 'utf8', timeout: 240000, env });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.match(output, /ping-parity-s2-migrations-applied/, 'the S2 database was used');
  const count = name => Number(output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1]);
  assert.equal(count('fail'), 0, output.slice(-4000));
  assert.ok(count('pass') >= 35, `pass ${count('pass')}`);
  assert.equal(run.status, 0);
});
