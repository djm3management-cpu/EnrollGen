import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPagedRows } from '../src/lib/cmsPaging.js';

test('county inventory remains complete when the CMS API caps responses at 1000', async () => {
  const inventory = Array.from({ length: 1193 }, (_, id) => ({ id, county: Math.floor(id / 57) }));
  const actual = await fetchPagedRows(async (from, to) => ({ data: inventory.slice(from, Math.min(to + 1, from + 1000)), error: null }));
  assert.deepEqual(actual, inventory);
  assert.equal(new Set(actual.map(row => row.county)).size, 21);
});

test('a later page failure rejects an incomplete county inventory', async () => {
  await assert.rejects(fetchPagedRows(async (from) => from === 0
    ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
    : { data: null, error: new Error('CMS unavailable') }), /CMS unavailable/);
});
