import {copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceFiles} from './security/source-files.mjs';
import {scanFiles} from './security/scan-secrets.mjs';
import {scanAgencyTerms} from './security/scan-agency-terms.mjs';
import {excludedTests} from './security/export-test-exclusions.mjs';

// Explicit reviewer-export exclusions. Sanitized bootstrap is the sole install definition.
export const exclusions = [
  // Root pilot audits/plans (including names now moved into the archive).
  /^(?:PILOT_.*|P0-\d+_.*|ENROLLGEN_FULL_AUDIT|THEME_AUDIT)\.md$/,
  /^CODEX_PROMPT[^/]*$/,
  // Pilot reports/evidence, old operations and private planning material.
  /^docs\/pilot-[^/]*\.(?:md|json)$/,
  /^docs\/internal-archive\//,
  /^docs\/legacy-operations\//,
  /^docs\/current-agency-profile\.example\.json$/,
  // Omit ALL upgrade history (including every migration <=149), standalone
  // seeds/validation and SQL operations. The checksummed bootstrap remains whole.
  /^supabase\/(?:migrations|seeds|validation)\//,
  /^scripts\/.*\.sql$/,
  // Identity-bearing operational references and service environment examples.
  /^(?:telephony\/README\.md|telephony\/\.env\.example|integrations\/\.env\.example|supabase\/functions\/get-availability\/README\.md)$/,
  // Other internal operational/audit docs can contain historical agency data.
  // Keep only the public vendor contract consumed by regression tests.
  /^docs\/(?!sunfire-ix-openapi\.json$)/,
  // Local tool state, repository metadata and scratch outputs, never source.
  /^(?:\.git|\.claude|\.codex|\.agents|\.vscode|\.idea|\.codesandbox|\.netlify|node_modules|dist|dist-ssr)(?:\/|$)/,
  /(?:^|\/)\.env(?:\.(?!example$)[^/]*)?$/,
  /(?:^|\/)(?:[^/]+\.local(?:\.json)?|\.DS_Store)$/,
  /^(?:calls_500\.jsonl|eval_report\.json|eval_runner\.py|CLAUDE\.md)$/,
];
export const exported = file => !Object.hasOwn(excludedTests,file) && !exclusions.some(rule => rule.test(file));
// Original identity-bearing fixtures never enter the export. These captured,
// sanitized fixtures preserve the shared schema and relationships for its tests.
export const capturedFixtures = Object.freeze({
  'tests/fixtures/deployment-profile.json':'tests/fixtures/clean-export/root-profile.json',
  'telephony/tests/fixtures/deployment-profile.json':'tests/fixtures/clean-export/telephony-profile.json',
  'tests/fixtures/deployment-roster.json':'tests/fixtures/clean-export/roster.json',
});
export function cleanExport(root, requested) {
  if (!requested || !path.isAbsolute(requested)) throw Error('Export requires an absolute new directory');
  const repository = realpathSync(root), parent = realpathSync(path.dirname(requested)), destination = path.join(parent, path.basename(requested));
  if (existsSync(destination) || destination === repository || destination.startsWith(repository+path.sep)) throw Error('Export destination must be new and outside the repository');
  mkdirSync(destination, {mode:0o700});
  try {
    const files = sourceFiles(repository).filter(exported);
    for (const file of files) {
      const origin = path.join(repository,capturedFixtures[file] || file);
      if (!lstatSync(origin).isFile()) throw Error('Export refuses nonregular source files');
      const target = path.join(destination,file);
      mkdirSync(path.dirname(target), {recursive:true});
      copyFileSync(origin,target);
    }
    for (const [label, scan] of [['secret scan',scanFiles], ['forbidden agency terms',scanAgencyTerms]]) {
      const findings = scan(destination,{directory:true,allFiles:true});
      for (const f of findings) console.error(`${f.path}:${f.line}: ${f.type}`);
      console.log(`${findings.length ? 'FAIL' : 'PASS'} export ${label}: ${findings.length} findings`);
      if (findings.length) throw Error('Export scan failed');
    }
    console.log(`PASS clean export: ${files.length} files`);
    return destination;
  } catch (error) { rmSync(destination,{recursive:true,force:true}); throw error; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error('Expected one destination');
    cleanExport(process.cwd(),process.argv[2]);
  } catch { console.error('FAIL clean export: destination rejected or scan incomplete; no export retained'); process.exitCode=1; }
}
