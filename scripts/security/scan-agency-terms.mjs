import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceFiles, directoryFiles} from './source-files.mjs';

// Preserve the P0-5 runtime boundary. Historical migrations, audit documents and
// negative-test fixtures intentionally retain historical identities; they are
// not deployable defaults. This scan never logs the matched term.
const runtimeRoots = ['src/', 'netlify/', 'integrations/', 'telephony/src/', 'status-page/', 'supabase/seeds/', 'supabase/bootstrap/', 'supabase/functions/', 'scripts/', 'telephony/scripts/', 'infra/'];
export function scanAgencyTerms(root, {directory = false} = {}) {
  const terms = JSON.parse(readFileSync(new URL('../../tests/fixtures/forbidden-deployment-terms.json', import.meta.url), 'utf8')).map(t => t.toLowerCase());
  const files = directory ? directoryFiles(root) : sourceFiles(root);
  return files.filter(file => runtimeRoots.some(prefix => file.startsWith(prefix)) || ['index.html','vite.config.js','netlify.toml','.env.example'].includes(file))
    .filter(file => /\.(?:[cm]?[jt]sx?|html|sql|json|ya?ml|py|toml)$/.test(file) || file === '.env.example')
    .filter(file => !file.split('/').includes('fixtures'))
    .flatMap(file => {
      const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
      return lines.flatMap((line, index) => terms.some(term => line.toLowerCase().includes(term)) ? [{path: file, line: index+1, type: 'forbidden-agency-term'}] : []);
    });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args[0] === '--directory' && args.length === 2 && existsSync(args[1]))) throw Error('Invalid scan arguments');
    const findings = scanAgencyTerms(args[1] ? path.resolve(args[1]) : process.cwd(), {directory: Boolean(args.length)});
    for (const f of findings) console.log(`${f.path}:${f.line}: ${f.type}`);
    console.log(`${findings.length ? 'FAIL' : 'PASS'} forbidden agency terms: ${findings.length} findings`);
    process.exitCode = findings.length ? 1 : 0;
  } catch { console.error('FAIL forbidden agency terms: unable to complete'); process.exitCode = 1; }
}
