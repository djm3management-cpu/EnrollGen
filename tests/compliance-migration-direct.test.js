import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=path=>readFileSync(new URL('../supabase/'+path,import.meta.url),'utf8');
test('142 → 144 → 145 restores 135 original-weight rules without the abandoned 143 or changing historical evidence',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  const schema=read('migrations/001_compliance_engine.sql');
  for(const table of ['compliance_intents','scoring_templates','scoring_template_items','call_records','compliance_scorecards']){
   const start=schema.indexOf('CREATE TABLE IF NOT EXISTS '+table+' (');
   await pg.exec(schema.slice(start,schema.indexOf('\n);',start)+4));
  }
  for(const path of ['seeds/001_compliance_intents.sql','seeds/002_scoring_template.sql','migrations/075_tpmo_grading_2027.sql','migrations/115_ma_cy2027_taxonomy.sql'])await pg.exec(read(path));
  await pg.exec(`CREATE TABLE compliance_runtime_control(id boolean PRIMARY KEY,enabled boolean);INSERT INTO compliance_runtime_control VALUES(true,false);
   INSERT INTO compliance_scorecards(template_id,overall_score,overall_grade,total_points_earned,total_points_possible,pass_fail,category_scores,risk_level)
   VALUES('00000000-0000-0000-0000-000000000115',75,'C',191,255,'FAIL','{}','medium');`);
  await pg.exec(read('migrations/141_approved_cy2027_retirements.sql'));
  await pg.exec(read('migrations/142_script_stage_applicability.sql'));
  const query=async(sql,args=[])=>(await pg.query(sql,args)).rows;
  assert.equal((await query("SELECT count(*)::int n FROM scoring_template_items WHERE template_id=(SELECT id FROM scoring_templates WHERE product_type='MA' AND is_active)"))[0].n,86);
  const cards=await query('SELECT * FROM compliance_scorecards ORDER BY id');
  const oldItems=await query('SELECT * FROM scoring_template_items ORDER BY id');
  const oldIds=new Set(oldItems.map(i=>i.id));
  const catalog=await query('SELECT * FROM compliance_intents ORDER BY id');
  await pg.exec(read('migrations/144_restore_full_compliance_rubric.sql'));
  await pg.exec(read('migrations/145_compliance_event_version.sql'));
  const active=await query("SELECT * FROM scoring_templates WHERE product_type='MA' AND is_active");
  assert.equal(active.length,1);assert.equal(active[0].total_possible_points,251);
  const items=await query('SELECT t.*,i.intent_code FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id WHERE t.template_id=$1',[active[0].id]);
  assert.equal(items.length,135);assert.equal(items.reduce((sum,i)=>sum+Number(i.points_possible),0),251);
  const original=await query("SELECT i.intent_code,t.points_possible FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id WHERE t.template_id='00000000-0000-0000-0000-000000000115'");
  for(const item of items)assert.equal(item.points_possible,original.find(i=>i.intent_code===item.intent_code).points_possible);
  for(const code of ['ELIG_010_ESRD_STATUS_CHECK','CONDUCT_013_NO_COMPARISON_BY_NAME','ENROLL_008_CMS_REVIEW_PERIOD'])assert.ok(!items.some(i=>i.intent_code===code));
  assert.deepEqual(await query('SELECT * FROM compliance_scorecards ORDER BY id'),cards);
  assert.deepEqual((await query('SELECT * FROM scoring_template_items ORDER BY id')).filter(i=>oldIds.has(i.id)),oldItems);
  assert.deepEqual(await query('SELECT * FROM compliance_intents ORDER BY id'),catalog);
  assert.equal((await query('SELECT enabled FROM compliance_runtime_control'))[0].enabled,false);
  const definition=(await query("SELECT pg_get_functiondef('public.mark_compliance_not_applicable(uuid,uuid,text,text)'::regprocedure) definition"))[0].definition;
  assert.match(definition,/cy2027-full-rubric-6/);assert.doesNotMatch(definition,/cy2027-cms-only-4|cy2027-full-rubric-5/);
  assert.equal((await query("SELECT count(*)::int n FROM scoring_templates WHERE template_name LIKE '%CMS-only%'"))[0].n,0);
 }finally{await pg.close();}
});
