// Offline key provisioning only: never connects to a database.
// node scripts/availability/consumer-key.mjs NAME /private/tmp/vendor-key.txt
// Add --import to hash an existing key file (e.g. the EnrollGen read credential).
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const [name, path, mode] = process.argv.slice(2);
if (!name || !path || (mode && mode !== '--import') || !/^[a-z0-9_-]{1,100}$/.test(name)) {
  throw new Error('Usage: consumer-key.mjs NAME KEY_FILE [--import]');
}
const key = mode === '--import' ? readFileSync(path, 'utf8').trim() : `av_${randomBytes(32).toString('base64url')}`;
if (key.length < 32 || key.length > 512) throw new Error('Use a high-entropy key between 32 and 512 characters');
if (!mode) writeFileSync(path, key + '\n', { flag: 'wx', mode: 0o600 });
const hash = createHash('sha256').update(key).digest('hex');
console.log(`-- Apply manually; raw key remains in ${path}\nINSERT INTO public.availability_consumers(name, key_hash) VALUES ('${name}', '${hash}');`);
