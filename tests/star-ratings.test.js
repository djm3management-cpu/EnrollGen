import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { applyCountyStarRatings, isFiveStarRating, normalizeFiveStarSepResult } from '../src/lib/starRatings.js';

test('plan ratings use overall rating evidence for the exact contract and county', () => {
  const plans = [
    { 'Contract ID': 'H0001', 'County FIPS': '34007', 'Part C Summary Star Rating': 5 },
    { 'Contract ID': 'H0001', 'County FIPS': '42017' },
    { 'Contract ID': 'H0002', 'County FIPS': '34007' },
  ];
  const result = applyCountyStarRatings(plans, [{ contract_id: 'H0001', county_fips: '34007', overall_star_rating: 4.5 }]);
  assert.equal(result[0]['Overall Star Rating'], 4.5);
  assert.equal(result[1]['Overall Star Rating'], undefined);
  assert.equal(result[2]['Overall Star Rating'], undefined);
});

test('five-star SEP requires exactly five overall stars', () => {
  for (const rating of [null, undefined, '', 0, 2, 3, 4, 4.5, 5.5, 6, 'Not Applicable']) {
    assert.equal(isFiveStarRating(rating), false);
  }
  assert.equal(isFiveStarRating(5), true);
  assert.equal(isFiveStarRating('5.0'), true);
});

test('mixed RPC results retain only five-star evidence without changing unrelated SEPs', () => {
  const other = { sep_type: 'Disaster / Emergency SEP', available: true };
  const result = normalizeFiveStarSepResult({ seps: [
    { sep_type: '5-Star Special Enrollment Period', available: true,
      plans: [{ contract_id: 'H0001', stars: 4.5 }, { contract_id: 'H0002', stars: 5 }] }, other,
  ] });
  assert.deepEqual(result.seps[0].plans, [{ contract_id: 'H0002', stars: 5 }]);
  assert.equal(result.seps[0].available, true);
  assert.equal(result.seps[1], other);
});

test('incorrect RPC availability cannot qualify a county with no five-star evidence', () => {
  const result = normalizeFiveStarSepResult({ seps: [
    { sep_type: '5-Star Special Enrollment Period', available: true, plans: [{ stars: 4 }] },
  ] });
  assert.equal(result.seps[0].available, false);
  assert.deepEqual(result.seps[0].plans, []);
  assert.equal(result.seps[0].evidence, 'No five-star plans in this area');
});

test('SQL migration preserves the wrapper and rejects non-five ratings with distinct contracts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE star_ratings_by_county(id int, contract_id text, overall_star_rating numeric);
      INSERT INTO star_ratings_by_county VALUES (1,'H0001',5),(2,'H0001',5),(3,'H0002',4.5),(4,'H0003',6);
      CREATE FUNCTION get_available_seps_before_fema_078(input_zip text) RETURNS jsonb
      LANGUAGE sql AS 'SELECT jsonb_build_object(''count'', COUNT(sr.id)) FROM star_ratings_by_county sr WHERE sr.overall_star_rating >= 5.0';
      CREATE FUNCTION get_available_seps(input_zip text) RETURNS jsonb LANGUAGE sql AS
      'SELECT get_available_seps_before_fema_078(input_zip) || jsonb_build_object(''fema_preserved'',true)';
    `);
    const migration = readFileSync(new URL('../supabase/migrations/089_star_rating_sep_exact.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const { rows } = await db.query("SELECT get_available_seps('08016') result");
    assert.deepEqual(rows[0].result, { count: 1, fema_preserved: true });
  } finally { await db.close(); }
});
