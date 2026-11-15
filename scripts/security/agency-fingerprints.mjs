import {createHash} from 'node:crypto';
import fingerprints from './agency-fingerprints.json' with {type:'json'};

// Captured from the private negative-term fixture. Only irreversible digests,
// lengths and rolling prefilters ship in a reviewer export, never the identities.
export function fingerprint(term) {
  const text = term.toLowerCase();
  let rolling = 0;
  for (let i = 0; i < text.length; i++) rolling = (Math.imul(rolling, 31) + text.charCodeAt(i)) >>> 0;
  return {length: text.length, rolling, sha256: createHash('sha256').update(text).digest('hex')};
}
const groups = new Map();
for (const item of fingerprints) {
  if (!groups.has(item.length)) groups.set(item.length, new Map());
  const group = groups.get(item.length);
  if (!group.has(item.rolling)) group.set(item.rolling, new Set());
  group.get(item.rolling).add(item.sha256);
}
export function forbiddenIdentityOffsets(content) {
  const text = content.toString().toLowerCase(), offsets = new Set();
  for (const [length, group] of groups) {
    let rolling = 0, power = 1;
    for (let i = 1; i < length; i++) power = Math.imul(power, 31) >>> 0;
    for (let i = 0; i < text.length; i++) {
      if (i >= length) rolling = (rolling - Math.imul(text.charCodeAt(i-length), power)) >>> 0;
      rolling = (Math.imul(rolling, 31) + text.charCodeAt(i)) >>> 0;
      const candidates = group.get(rolling);
      if (i >= length-1 && candidates?.has(createHash('sha256').update(text.slice(i-length+1, i+1)).digest('hex'))) offsets.add(i-length+1);
    }
  }
  return [...offsets].sort((a,b) => a-b);
}
