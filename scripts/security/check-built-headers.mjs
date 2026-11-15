import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {frontendHeaders} from './browser-headers.mjs';
const dist = process.argv[2];
const source = readFileSync(path.join(dist, '_headers'), 'utf8');
for (const [name, value] of Object.entries(frontendHeaders)) assert.ok(source.includes(`  ${name}: ${value}\n`), name);
assert.match(source, /Content-Security-Policy-Report-Only: .*frame-ancestors 'none'/);
const terms = JSON.parse(readFileSync(new URL('../../tests/fixtures/forbidden-deployment-terms.json', import.meta.url), 'utf8'));
assert.ok(!terms.some(term => source.toLowerCase().includes(term.toLowerCase())), 'Policy must be agency-independent');
const walk = dir => readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : e.name.endsWith('.html') ? [path.join(dir,e.name)] : []);
for (const file of walk(dist)) for (const match of readFileSync(file, 'utf8').matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  assert.ok(source.includes(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`), 'Built inline script hash');
}
console.log('PASS built security headers');
