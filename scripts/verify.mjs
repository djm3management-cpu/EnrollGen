import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
// Do not inherit real credentials or feature flags from the invoking shell.
// Tests import the external-network fence before loading application modules.
const env = {PATH: process.env.PATH, ...(process.env.SystemRoot ? {SystemRoot:process.env.SystemRoot} : {})};
const tests = dir => readdirSync(dir).filter(f => f.endsWith('.test.js')).sort().map(f => `${dir}/${f}`);
const node = process.execPath;
const steps = [
  ['root tests', node, ['--import','./tests/fixtures/deployment-env.js','--test','--test-concurrency=4',...tests('tests')]],
  ['telephony tests and import boundaries', 'npm', ['test','--prefix','telephony','--','--test-concurrency=4']],
  ['lint', 'npm', ['run','lint']],
  ['language model types', 'npm', ['run','typecheck:llm']],
  ['environment-free synthetic build and headers', node, ['scripts/security/environment-free-build.mjs']],
  ['root audit (all severities)', 'npm', ['audit','--audit-level=info','--registry=https://registry.npmjs.org']],
  ['telephony audit (all severities)', 'npm', ['audit','--prefix','telephony','--audit-level=info','--registry=https://registry.npmjs.org']],
  ['fresh bootstrap and catalog snapshot', node, ['--import','./tests/fixtures/deployment-env.js','--test','tests/fresh-install.test.js']],
  ['forbidden agency terms', node, ['scripts/security/scan-agency-terms.mjs']],
  ['tracked secret scan', node, ['scripts/security/scan-secrets.mjs']],
];
let failures = 0;
for (const [label, command, args] of steps) {
  console.log(`\nCHECK ${label}`);
  const result = spawnSync(command, args, {env, stdio:'inherit'});
  const ok = result.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
console.log(`\n${failures ? 'FAIL' : 'PASS'} verify: ${steps.length-failures}/${steps.length} steps`);
process.exitCode = failures ? 1 : 0;
