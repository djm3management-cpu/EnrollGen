// docs/api/ping-platform.openapi.yaml covers every route mounted under
// /api/ping, /api/exchange and /api/buyer, and documents nothing that is not
// mounted. Routes come from the routers' own Express stacks; the server must
// mount every one of those routers, and no other telephony source may declare
// a route under those prefixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPingV1Router } from '../src/routes/pingV1.js';
import { createExchangeV1Router } from '../src/routes/exchangeV1.js';
import { createBuyerV1Router, BUYER_ROUTES } from '../src/routes/buyerV1.js';

const PREFIX = /^\/api\/(ping|exchange|buyer)(\/|$)/;
const spec = readFileSync(new URL('../../docs/api/ping-platform.openapi.yaml', import.meta.url), 'utf8');
const src = fileURLToPath(new URL('../src/', import.meta.url));

/** "METHOD /path" for every operation under paths:, read by indentation. */
function documented() {
  const lines = spec.split('\n');
  const start = lines.indexOf('paths:');
  assert.ok(start >= 0, 'paths: section');
  const found = []; let path = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // next top level key
    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) { path = pathMatch[1]; continue; }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch && path) found.push(`${methodMatch[1].toUpperCase()} ${path}`);
  }
  return found.sort();
}

/** "METHOD /path" for every route on the three routers, with :id as {id}. */
function mounted() {
  const db = () => assert.fail('no database in a coverage test');
  const routers = [createPingV1Router({ db }), createExchangeV1Router({ db }), createBuyerV1Router({ db })];
  const found = [];
  for (const router of routers) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const path = layer.route.path.replace(/:([A-Za-z_]+)/g, '{$1}');
      for (const method of Object.keys(layer.route.methods)) found.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return found.sort();
}

test('every mounted ping, exchange and buyer route is documented, and vice versa', () => {
  const routes = mounted();
  assert.ok(routes.length >= 12, routes.join('\n'));
  assert.ok(routes.every(route => PREFIX.test(route.split(' ')[1])), routes.join('\n'));
  assert.deepEqual(documented(), routes);
  assert.deepEqual(new Set(routes).size, routes.length, 'no duplicate routes');
});

test('the buyer route table matches the router and names a scope for every endpoint', () => {
  const buyer = BUYER_ROUTES.map(r => `${r.method.toUpperCase()} ${r.path.replace(/:([A-Za-z_]+)/g, '{$1}')}`).sort();
  assert.deepEqual(buyer, mounted().filter(route => route.includes('/api/buyer/')));
  const scopes = ['campaigns:read', 'campaigns:write', 'reports:read', 'alerts:write', 'screener:write'];
  for (const route of BUYER_ROUTES) {
    assert.ok(scopes.includes(route.scope), route.path);
    const fromPath = spec.slice(spec.indexOf(`\n  ${route.path.replace(/:([A-Za-z_]+)/g, '{$1}')}:\n`) + 1);
    const operation = fromPath.slice(fromPath.indexOf(`\n    ${route.method}:\n`) + 1);
    const end = operation.slice(1).search(/\n( {2}\/| {4}(get|post|put|patch|delete):\n|\S)/);
    assert.ok(operation.slice(0, end + 1).includes(`\`${route.scope}\``), `${route.method} ${route.path} documents ${route.scope}`);
  }
});

test('server.js mounts all three routers and no other source declares a route under these prefixes', () => {
  const server = readFileSync(join(src, 'server.js'), 'utf8');
  for (const name of ['pingV1Router', 'exchangeV1Router', 'buyerV1Router']) {
    assert.match(server, new RegExp(`app\\.use\\(await ${name}\\(\\)\\)`), name);
  }
  const owners = new Set(['pingV1.js', 'exchangeV1.js', 'buyerV1.js']);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : []);
  for (const file of walk(src)) {
    const text = readFileSync(file, 'utf8');
    const declares = /\.(get|post|put|patch|delete|all|use)\(\s*[`'"]\/api\/(ping|exchange|buyer)\//.test(text);
    if (declares) assert.ok(owners.has(file.split('/').pop()), `${file} declares a ping platform route`);
  }
});

test('the spec is OpenAPI 3.1 with x-api-key auth and the documented rate limits', () => {
  assert.match(spec, /^openapi: 3\.1\.0$/m);
  assert.match(spec, /name: x-api-key/);
  assert.match(spec, /600 requests for a publisher/);
  assert.match(spec, /120 for a buyer key/);
  assert.ok(!spec.includes('\u2014'), 'no em dashes');
});
