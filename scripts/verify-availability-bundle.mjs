// Run after npm run build. Never print credential values or matching content.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const forbidden = new Set(['VITE_AGENT_API_KEY', '/functions/v1/set-availability']);
for (const name of ['VITE_AGENT_API_KEY', 'AGENT_API_KEY']) {
  if (process.env[name]) forbidden.add(process.env[name]);
}
// Check the actual legacy credential when retained in ignored local env files.
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^(?:export\s+)?(?:VITE_AGENT_API_KEY|AGENT_API_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      const value = match[1].replace(/^(['"])(.*)\1$/, '$2');
      if (value) forbidden.add(value);
    }
  }
}
const root = resolve('dist');
if (!existsSync(root)) throw new Error('Build dist before verifying availability credentials.');
let count = 0;
function scan(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, file.name);
    if (file.isDirectory()) { scan(path); continue; }
    const content = readFileSync(path);
    count++;
    for (const value of forbidden) {
      if (content.includes(value)) throw new Error('Availability shared credential or legacy writer found in built bundle.');
    }
  }
}
scan(root);
console.log(`Availability bundle check passed (${count} files; no shared credential or legacy writer).`);
