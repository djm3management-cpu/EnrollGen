import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { previewTpmoRepair, applyTpmoRepair } from '../scripts/post-call/repair-tpmo-timing.mjs';
import { scoreCall } from '../src/compliance/engine/ScoringEngine.js';
import { MA_2027_POLICY_VERSION } from '../src/compliance/shared/scoringPolicy.js';

const transcript = [
  {speaker:'agent',text:'We do not offer every plan available in your area.',start_ms:186440,end_ms:190930},
  {speaker:'agent',text:'Currently, we represent, your about five, organizations which offer about 24, products in your area. Please contact medicare.gov to get information on all your products.',start_ms:190930,end_ms:205660},
  {speaker:'agent',text:'This plan includes dental coverage.',start_ms:600000,end_ms:610000},
  {speaker:'agent',text:'We do not offer every plan available in your area. Currently we represent seven organizations which offer 60 products in your area. Please contact Medicare.gov for information on all of your options.',start_ms:1200000,end_ms:1220000},
];
const codes=['CONDUCT_006_PROFESSIONAL_TONE','CALL_OPEN_009_TPMO_TIMING_2027','CALL_OPEN_008_TPMO_DISCLAIMER_2027',
  'CALL_OPEN_010_TPMO_ORG_COUNT','CALL_OPEN_011_TPMO_PLAN_COUNT','CALL_OPEN_013_TPMO_RESOURCE_2027'];

test('repair creates an atomic scorecard revision with review evidence, preserves the original and protects concurrent human review',async()=>{
  const pg=new PGlite(),db=evidenceDb(pg);
  const checked=async q=>{const r=await q;if(r.error)throw r.error;return r.data;};
  try {
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    const schema=await readFile(new URL('../supabase/migrations/001_compliance_engine.sql',import.meta.url),'utf8');
    for(const table of ['compliance_intents','scoring_templates','scoring_template_items','call_records','intent_detections',
      'compliance_scorecards','scorecard_items','corrective_actions','phi_redactions']) {
      const start=schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      await pg.exec(schema.slice(start,schema.indexOf('\n);',start)+4));
    }
    await pg.exec(`ALTER TABLE call_records ADD tenant_id uuid,ADD compliance_scorecard_id uuid,ADD call_outcome text;
      ALTER TABLE compliance_scorecards ADD tenant_id uuid;ALTER TABLE scoring_templates ADD policy_version text;`);
    await pg.exec(await readFile(new URL('../supabase/migrations/072_scoring_integrity.sql',import.meta.url),'utf8'));
    await pg.exec(await readFile(new URL('../supabase/migrations/103_resumable_scoring_jobs.sql',import.meta.url),'utf8'));
    const repairSql=await readFile(new URL('../supabase/migrations/116_tpmo_evidence_repair.sql',import.meta.url),'utf8');
    await pg.exec(repairSql);await pg.exec(repairSql);
    const permissions=(await pg.query("SELECT has_function_privilege('authenticated','public.persist_tpmo_timing_repair(uuid,uuid,uuid,jsonb,jsonb)','execute') AS allowed")).rows[0];
    assert.equal(permissions.allowed,false);
    const tenant=randomUUID(),callId=randomUUID(),templateId=randomUUID();
    const template=await checked(db.from('scoring_templates').insert({id:templateId,template_name:'MA fixture',product_type:'MA',
      version:3,policy_version:MA_2027_POLICY_VERSION,is_active:true,total_possible_points:115,passing_threshold:85,categories:{}}).select('*').single());
    const templateItems=[];
    for(const [order,code] of codes.entries()) {
      const intentId=randomUUID();
      await checked(db.from('compliance_intents').insert({id:intentId,intent_code:code,intent_name:code,category:'CALL_OPENING',description:'Fixture rule'}));
      const row=await checked(db.from('scoring_template_items').insert({id:randomUUID(),template_id:templateId,intent_id:intentId,
        question_text:'Fixture rule',category:'CALL_OPENING',points_possible:order===0?100:3,display_order:order}).select('*').single());
      templateItems.push({...row,compliance_intents:{intent_code:code}});
    }
    await checked(db.from('call_records').insert({id:callId,tenant_id:tenant,agent_id:randomUUID(),agent_name:'Fixture Agent',
      call_direction:'inbound',call_type:'enrollment',product_type:'MA',call_outcome:'enrolled',call_start:new Date().toISOString(),call_end:new Date().toISOString(),
      call_duration_seconds:1800,transcript_raw:transcript.map(u=>u.text).join(' '),transcript_diarized:transcript,metadata:{}}));
    let call=await checked(db.from('call_records').select('*').eq('id',callId).single());
    const detections=codes.map((code,i)=>({id:randomUUID(),intent_code:code,detected:i!==1,confidence:1,speaker:'agent',
      detection_method:i?'tpmo_2027_policy':'intent_classifier',anti_pattern_match:false,
      transcript_segment:i?'Later repeated disclaimer':'Professional conversation',segment_start_ms:i?1200000:0,
      segment_end_ms:i?1220000:1000,sequence_violation:i>1,llm_reasoning:'Original saved evaluation'}));
    const result=scoreCall({detections,templateItems,template});
    const {scorecard_items:items,corrective_bucket:bucket,...scorecard}=result;
    const job=await checked(db.rpc('begin_scoring_job',{p_call_id:callId,p_template_id:templateId,
      p_transcript:{raw:call.transcript_raw,diarized:call.transcript_diarized,duration:call.call_duration_seconds}}));
    const saved=await checked(db.rpc('persist_scoring_result',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_result:{
      scorecard,items,detections,actions:[{severity:'critical',category:'CALL_OPENING',bucket,title:'Old auto-fail',description:'Old finding',intent_codes:codes}],redactions:[],isShortCall:false}}));
    // Use the deployed completed-call guard and persistence, not the older 072
    // behavior that incorrectly allowed a new template to restart a scored call.
    await pg.exec('ALTER TABLE call_records ADD compliance_requested_at timestamptz DEFAULT now(), ADD compliance_run_at timestamptz, ADD compliance_transcript_hash text;');
    const deployed=await readFile(new URL('../supabase/migrations/110_sale_disposition_compliance.sql',import.meta.url),'utf8');
    for(const name of ['is_compliance_sale','compliance_content_hash','begin_scoring_job','persist_scoring_result']) {
      const pattern=new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`);
      const start=deployed.search(pattern);await pg.exec(deployed.slice(start,deployed.indexOf('$$;',start)+3));
    }
    await pg.query('UPDATE call_records SET compliance_run_at=now(),compliance_transcript_hash=public.compliance_content_hash(call_records) WHERE id=$1',[callId]);
    const guarded=await checked(db.rpc('begin_scoring_job',{p_call_id:callId,p_template_id:randomUUID(),
      p_transcript:{raw:call.transcript_raw,diarized:call.transcript_diarized,duration:call.call_duration_seconds}}));
    assert.equal(guarded.status,'complete');
    call=await checked(db.from('call_records').select('*').eq('id',callId).single());
    const originalCard=await checked(db.from('compliance_scorecards').select('*').eq('id',saved.scorecard.id).single());
    const originalDetections=await checked(db.from('intent_detections').select('*').eq('scoring_job_id',job.jobId));
    const snapshot={call,card:originalCard,detections:originalDetections,template,templateItems};
    const originalJson=JSON.stringify(snapshot),preview=previewTpmoRepair(snapshot);
    assert.equal(preview.summary.original_grade,'F');assert.equal(preview.summary.auto_fail,false);
    assert.equal(preview.summary.manual_review_required,true);assert.equal(JSON.stringify(snapshot),originalJson);
    assert.throws(()=>previewTpmoRepair({...snapshot,card:{...originalCard,reviewed:true}}),/Human-reviewed/);
    assert.throws(()=>previewTpmoRepair({...snapshot,card:{...originalCard,overall_score:1}}),/does not reproduce/);
    await checked(db.from('compliance_scorecards').update({reviewed:true}).eq('id',originalCard.id));
    await assert.rejects(applyTpmoRepair(snapshot,db),/review changed/);
    await checked(db.from('compliance_scorecards').update({reviewed:false}).eq('id',originalCard.id));
    const brokenDb={...db,rpc(name,args){
      if(name==='persist_tpmo_timing_repair')args={...args,p_result:{...args.p_result,items:args.p_result.items.slice(1)}};
      return db.rpc(name,args);
    }};
    await assert.rejects(applyTpmoRepair(snapshot,brokenDb),/Incomplete scoring/);
    assert.equal(Number((await pg.query('SELECT count(*) n FROM compliance_scorecards WHERE call_id=$1',[callId])).rows[0].n),1);
    assert.equal(Number((await pg.query("SELECT count(*) n FROM scoring_jobs WHERE call_id=$1 AND status='pending'",[callId])).rows[0].n),0);
    const applied=await applyTpmoRepair(snapshot,db);
    assert.notEqual(applied.scorecard_id,originalCard.id);assert.equal(applied.auto_fail,false);
    assert.deepEqual(await checked(db.from('compliance_scorecards').select('*').eq('id',originalCard.id).single()),originalCard);
    assert.deepEqual(await checked(db.from('intent_detections').select('*').eq('scoring_job_id',job.jobId)),originalDetections);
    const current=await checked(db.from('call_records').select('*').eq('id',callId).single());
    assert.equal(current.compliance_scorecard_id,applied.scorecard_id);assert.equal(current.call_direction,'inbound');
    const updated=await checked(db.from('scorecard_items').select('*').eq('scorecard_id',applied.scorecard_id));
    const review=updated.find(i=>/Manual review required/.test(i.notes||''));
    assert.equal(review.result,'na');assert.equal(review.evidence_timestamp_ms,186440);assert.equal(review.auto_fail_triggered,false);
    const actions=await checked(db.from('corrective_actions').select('*').eq('call_id',callId));
    assert.equal(actions.find(a=>a.scorecard_id===originalCard.id).status,'superseded');
    assert.match(actions.find(a=>a.scorecard_id===applied.scorecard_id).title,/Review early TPMO/);
    await assert.rejects(applyTpmoRepair(snapshot,db),/Call or review changed/);
  }finally{await pg.close();}
});
