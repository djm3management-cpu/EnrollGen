import {mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceFiles} from './source-files.mjs';
const root = process.cwd(), copy = mkdtempSync(path.join(tmpdir(), 'enrollgen-verify-build-'));
try {
  // This legacy seed is not a Vite input and contains the still-active capability.
  // Do not reproduce it in a build copy; the repository and history stay intact.
  const legacySeed = 'supabase/migrations/007_multi_tenant_foundation.sql';
  for (const file of sourceFiles(root).filter(file => file !== legacySeed && !file.split('/').some(part => part.startsWith('.env')))) {
    const destination = path.join(copy, file);
    mkdirSync(path.dirname(destination), {recursive: true});
    copyFileSync(path.join(root, file), destination);
  }
  symlinkSync(path.join(root, 'node_modules'), path.join(copy, 'node_modules'), 'dir');
  const env = {PATH: process.env.PATH, DEPLOYMENT_PROFILE_JSON: readFileSync(path.join(root, 'config/deployment-profile.example.json'), 'utf8')};
  const result = spawnSync('npm', ['run','build'], {cwd: copy, env, stdio: 'inherit'});
  if (result.status !== 0) process.exitCode = 1;
  else {
    const check = spawnSync(process.execPath, [path.join(root, 'scripts/security/check-built-headers.mjs'), path.join(copy, 'dist')], {cwd: root, env, stdio: 'inherit'});
    process.exitCode = check.status === 0 ? 0 : 1;
  }
} finally { rmSync(copy, {recursive: true, force: true}); }
