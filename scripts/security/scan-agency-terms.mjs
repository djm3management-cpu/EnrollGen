import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceFiles, directoryFiles} from './source-files.mjs';
import {forbiddenIdentityOffsets} from './agency-fingerprints.mjs';

// Repository checks preserve the P0-5 runtime boundary; exports scan EVERY
// shipped file, without path, extension, fixture or binary exemptions. The
// historical source and private negative fixtures stay in the repository only.
// No matched identity is ever logged.
const runtimeRoots = ['src/', 'netlify/', 'integrations/', 'telephony/src/', 'status-page/', 'supabase/seeds/', 'supabase/bootstrap/', 'supabase/functions/', 'scripts/', 'telephony/scripts/', 'infra/'];
export function scanAgencyTerms(root, {directory = false, allFiles = directory} = {}) {
  const files = directory ? directoryFiles(root, '', {includeGenerated: allFiles}) : sourceFiles(root);
  return files.filter(file => allFiles || (
    (runtimeRoots.some(prefix => file.startsWith(prefix)) || ['index.html','vite.config.js','netlify.toml','.env.example'].includes(file)) &&
    (/\.(?:[cm]?[jt]sx?|html|sql|json|ya?ml|py|toml)$/.test(file) || file === '.env.example') &&
    !file.split('/').includes('fixtures')
  )).flatMap(file => {
    // Read every selected file, including binary and extensionless files. No
    // content or identity appears in findings; read errors fail closed.
    const content = readFileSync(path.join(root, file)).toString();
    return [...new Set([...(allFiles && forbiddenIdentityOffsets(file).length ? [1] : []), ...forbiddenIdentityOffsets(content).map(offset => content.slice(0, offset).split('\n').length)])]
      .map(line => ({path: file, line, type: 'forbidden-agency-term'}));
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args[0] === '--directory' && args.length === 2 && existsSync(args[1]))) throw Error('Invalid scan arguments');
    const findings = scanAgencyTerms(args[1] ? path.resolve(args[1]) : process.cwd(), {directory: Boolean(args.length), allFiles: Boolean(args.length) || !existsSync(path.join(process.cwd(), '.git'))});
    for (const f of findings) console.log(`${f.path}:${f.line}: ${f.type}`);
    console.log(`${findings.length ? 'FAIL' : 'PASS'} forbidden agency terms: ${findings.length} findings`);
    process.exitCode = findings.length ? 1 : 0;
  } catch { console.error('FAIL forbidden agency terms: unable to complete'); process.exitCode = 1; }
}
