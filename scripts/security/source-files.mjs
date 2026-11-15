import {existsSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

// Exports have no Git metadata. Walk source there; never traverse installed or
// generated trees. In a checkout, Git is authoritative (including staged files).
const generated = new Set(['.git', 'node_modules', 'dist', 'dist-ssr', '.netlify']);
export function directoryFiles(root, relative = '', {includeGenerated = false} = {}) {
  return readdirSync(path.join(root, relative), {withFileTypes: true}).flatMap(entry => {
    const file = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error('Source symlink refused');
    return entry.isDirectory() ? !includeGenerated && generated.has(entry.name) ? [] : directoryFiles(root, file, {includeGenerated}) : [file];
  }).sort();
}
export function sourceFiles(root = process.cwd()) {
  if (existsSync(path.join(root, '.git'))) {
    return execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean);
  }
  return directoryFiles(root);
}
