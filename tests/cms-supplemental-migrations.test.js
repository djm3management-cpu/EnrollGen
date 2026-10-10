import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('crosswalk migration preserves FEMA wrapper and excludes renewal/current SAR counties', async () => {
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE plan_terminations(old_contract_id text,old_plan_id text,county_fips text,plan_year integer,termination_type text);
  CREATE UNIQUE INDEX uq_term_plan_county_year ON plan_terminations(old_contract_id,old_plan_id,county_fips,plan_year);
  CREATE FUNCTION get_available_seps_before_fema_078(input_zip text) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('count',count(*)) FROM plan_terminations pt WHERE true AND pt.plan_year = 2027 $$;
  CREATE FUNCTION get_available_seps(input_zip text) RETURNS jsonb LANGUAGE sql AS $$ SELECT get_available_seps_before_fema_078(input_zip) || '{"fema":"preserved"}'::jsonb $$;`);
  const sql=await fs.readFile(new URL('../supabase/migrations/093_crosswalk_2027_statuses.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.exec(`INSERT INTO plan_terminations(source_key,plan_year,termination_type,county_mapping_status) VALUES ('renew',2027,'renewal','current_service_area'),('sar',2027,'service_area_reduction','current_service_area'),('term',2027,'terminated','affected_service_area');`);
  const result=await db.query("SELECT get_available_seps('08102') AS result");
  assert.deepEqual(result.rows[0].result,{count:1,fema:'preserved'});
  await assert.rejects(()=>db.exec("INSERT INTO plan_terminations(source_key,plan_year) VALUES ('renew',2027)"),/duplicate key/);
 } finally { await db.close(); }
});
