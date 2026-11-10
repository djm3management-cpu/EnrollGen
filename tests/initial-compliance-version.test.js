import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {prepareVersion} from '../netlify/lib/complianceVersions.js';
const read=n=>readFileSync(new URL(`../supabase/migrations/${n}`,import.meta.url),'utf8');
test('manual evaluation prepares every active template rule without an existing scorecard',async()=>{
 const seen=[];const db={from(t){seen.push(t);const rows={intent_detections:[],scoring_templates:[{id:'template'}],scoring_template_items:[{id:'item',intent_id:'intent',intent_code:'CALL_OPEN_001_RECORDING_ANNOUNCE',category:'CALL_OPENING',points_possible:2,display_order:1}],compliance_intents:[{id:'intent',intent_code:'CALL_OPEN_001_RECORDING_ANNOUNCE'}]};const q={select(){return q},eq(){return q},order(){return q},limit(){return q},single:async()=>({data:rows[t]?.[0]}),then(a,b){return Promise.resolve({data:rows[t]||[]}).then(a,b)}};return q;}};
 const payload=await prepareVersion(db,{id:'call',tenant_id:'tenant',product_type:'MA',call_duration_seconds:3026,transcript_diarized:[],metadata:{}});
 assert.equal(payload.scorecard.supersedes_id,null);assert.equal(payload.items.length,1);assert.equal(payload.scorecard.scoring_state,'incomplete');assert.equal(seen.includes('compliance_scorecards'),false);
});
test('148 saves an initial manual version, is idempotent and rejects a stale null source',async()=>{
 const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE tenants(id uuid PRIMARY KEY);');
 const schema=read('001_compliance_engine.sql');
 for(const t of ['compliance_intents','scoring_templates','scoring_template_items','call_records','intent_detections','compliance_scorecards','scorecard_items']){const start=schema.indexOf('CREATE TABLE IF NOT EXISTS '+t+' (');await pg.exec(schema.slice(start,schema.indexOf('\n);',start)+4));}
 await pg.exec(`ALTER TABLE call_records ADD tenant_id uuid,ADD compliance_scorecard_id uuid,ADD compliance_status text;
 ALTER TABLE compliance_scorecards ADD tenant_id uuid,ADD rules_version text,ADD scoring_state text,ADD supersedes_id uuid,ADD llm_pass_id uuid,ADD auto_fail_item_ids uuid[];
 CREATE TABLE compliance_llm_passes(id uuid,call_id uuid,tenant_id uuid,status text,mode text);
 CREATE TABLE compliance_review_decisions(scorecard_item_id uuid,tenant_id uuid,request_id uuid,decision text,decided_by text,note text,replacement_scorecard_id uuid);`);
 await pg.exec(read('135_compliance_admin_versions.sql'));await pg.exec(read('148_initial_manual_compliance_version.sql'));
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await pg.query('INSERT INTO tenants VALUES($1)',[id(1)]);
 await pg.query("INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start) VALUES($1,$2,$3,'Fixture','inbound','sales','MA',now())",[id(2),id(1),id(3)]);
 await pg.query("INSERT INTO scoring_templates(id,template_name,product_type,version,is_active,total_possible_points,passing_threshold,categories) VALUES($1,'Fixture','MA',1,true,2,85,'{}')",[id(4)]);
 await pg.query("INSERT INTO scoring_template_items(id,template_id,question_text,category,points_possible,display_order) VALUES($1,$2,'Fixture','CALL_OPENING',2,1)",[id(5),id(4)]);
 const payload={scorecard:{call_id:id(2),tenant_id:id(1),template_id:id(4),supersedes_id:null,rules_version:'fixture',scoring_state:'incomplete',overall_score:null,overall_grade:null,auto_fail_triggered:false,auto_fail_item_ids:[],category_scores:{},risk_level:'low'},items:[{id:id(6),template_item_id:id(5),question_text:'Fixture',category:'CALL_OPENING',result:'review',points_earned:0,points_possible:0,auto_fail_triggered:false,display_order:1}]};
 const save=async request=>(await pg.query('SELECT save_compliance_version($1,$2,NULL,$3,$4,$5,NULL) id',[id(2),id(1),request,'admin-fixture',JSON.stringify(payload)])).rows[0].id;
 const first=await save(id(7));assert.ok(first);assert.equal(await save(id(7)),first);await assert.rejects(save(id(8)),/Scorecard changed/);
 assert.equal((await pg.query('SELECT count(*)::int n FROM compliance_scorecards')).rows[0].n,1);
 }finally{await pg.close();}
});
