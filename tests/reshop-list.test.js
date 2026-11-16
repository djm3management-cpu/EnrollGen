import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with {type:'json'};
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {reshopFeatures,RESHOP_REASONS,RESHOP_OUTCOMES,permissionLabel} from '../src/lib/reshopList.js';
import {createReshopListHandler} from '../netlify/functions/reshop-list.js';
import {createConsumerLifecycleHandler} from '../netlify/functions/consumer-lifecycle.js';
import {createDeploymentFeaturesHandler} from '../netlify/functions/deployment-features.js';
import {admitReshop,RESHOP_ADMISSION} from '../netlify/functions/_admission.js';
import {TABLE_CLASS} from '../scripts/retention/inventory.js';
import {runRetention} from '../scripts/retention/job.js';
let pg,db,agents,rows,seq=100;
const T=profile.tenantId,id=n=>`e1700000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),RESHOP_LIST_ENABLED:'true',CONSUMER_LIFECYCLE_ENABLED:'true'};
const auth=n=>({userId:roster[n].clerk_user_id,orgId:profile.organizationId,tokenPayload:{}}),aid=n=>agents.find(a=>a.clerk_user_id===roster[n].clerk_user_id).id;
const q=(s,args=[])=>pg.query(s,args).then(r=>r.rows);
async function service(flags=env){await pg.exec('SET ROLE service_role');await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify({'x-enrollgen-features':JSON.stringify({...JSON.parse(featureHeaders(flags)['x-enrollgen-features']),...reshopFeatures(flags)})})]);}
const handler=(n=1,client=db,flags=env)=>createReshopListHandler({env:flags,getDb:()=>client,authenticate:async()=>typeof n==='number'?auth(n):n});
const req=(body,params='')=>new Request('https://example.invalid/api/reshop-list'+(params?'?'+params:''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
const read=(n=1,filters={},extra={})=>db.rpc('read_reshop_list',{p_actor:auth(n).userId,p_org:profile.organizationId,p_filters:filters,p_limit:200,...extra});
async function list(n=1,filters={}){const r=await read(n,filters);assert.ifError(r.error);return r.data;}
async function action(e,kind='review',outcome='kept_plan',n=1,client=db){return handler(n,client)(req({id:e,action:kind,outcome}));}
async function seed({owner=1,writer=owner,data={},county='08005',state='NJ',completed=true,isTest=false,submitted='2026-10-01',dnc=false,contract}={}){
 const contact=id(seq++),call=id(seq++),e=id(seq++),key=contract||'H'+String(seq).padStart(4,'0');
 await q('INSERT INTO contacts(id,tenant_id,assigned_agent_id,phone,first_name,last_name,county,state,do_not_call) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[contact,T,roster[owner].agent_slug,'+1212555'+String(seq).padStart(4,'0'),'Synthetic','Client',county,state,dnc]);
 await q("INSERT INTO call_records(id,tenant_id,agent_id,contact_id,call_type,call_direction,product_type,call_start,ptc_on_file,ptc_date,ptc_expiry) VALUES($1,$2,$3,$4,'enrollment','inbound','MA',clock_timestamp(),true,current_date-1,current_date+30)",[call,T,aid(owner),contact]);
 const d={planType:'MA/MAPD/PDP',contractId:key,planId:'1',segmentId:'0',newCarrier:'Synthetic Carrier',premium:'20.00',effectiveDate:'2026-01-01',writingAgentId:rows.find(a=>a.clerk_user_id===roster[writer].clerk_user_id).id,...data};
 await q('INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,completed_at,submitted_at,is_test_enrollment) VALUES($1,$2,$3,$4,$5,\'{}\',\'Other\',$6,$7,$8)',[e,T,call,contact,JSON.stringify(d),completed?'2026-10-01':null,submitted,isTest]);
 return {e,call,contact,key,data:d};
}
async function landscape(key,{plan='001',segment='000',premium=20,type='HMO',carrier='Synthetic Carrier',county='08005',state='NJ',stars,low=false}={}){
 await q("INSERT INTO cms_plans_py2027(plan_year,category,state_code,county_name,county_fips,carrier,contract_id,plan_id,segment_id,contract_plan_segment_id,plan_name,plan_type,monthly_premium,source_file) VALUES(2027,'MA',$1,'Synthetic County',$2,$3,$4,$5,$6,$4||'_'||$5||'_'||$6,'Synthetic CMS Plan',$7,$8,'synthetic')",[state,county,carrier,key,plan,segment,type,premium]);
 if(stars!==undefined||low)await q("INSERT INTO star_ratings_by_county(contract_id,overall_star_rating,county_fips,state_code,plan_year,low_performing) VALUES($1,$2,$3,$4,2027,$5) ON CONFLICT(contract_id,county_fips,plan_year) DO UPDATE SET overall_star_rating=excluded.overall_star_rating,low_performing=excluded.low_performing",[key,stars??null,county,state,low]);
}
async function cross(key,{status='renewal',next=key,plan='001',county='08005',mapping='current_service_area',year=2027}={}){
 await q('INSERT INTO plan_terminations(old_contract_id,old_plan_id,termination_type,new_contract_id,new_plan_id,county_fips,state_code,plan_year,source_key,source_status,county_mapping_status) VALUES($1,\'001\',$2,$3,$4,$5,\'NJ\',$6,$7,$8,$9)',[key,status,next,plan,county,year,'synthetic-'+seq++,status,mapping]);
}
async function row(e,n=1){return (await list(n)).rows.find(r=>r.id===e);}
const current={coverage:'MA',year:2026,county_fips:'08005',contract_id:'H0001',plan_id:'001',plan_type:'HMO',premium:'20.00'};
const transition={termination_type:'renewal',county_fips:'08005',county_mapping_status:'current_service_area',new_contract_id:'H0001',new_plan_id:'001'};
const successor={contract_id:'H0001',plan_id:'001',segment_id:'000',plan_type:'HMO',monthly_premium:20,overall_star_rating:4,low_performing:false};
async function evaluate(c=current,t=[transition],s=[successor],loaded=true){await pg.exec('RESET ROLE');try{return (await q('SELECT reshop_evaluate($1,$2,$3,$4) result',[c,t,s,loaded]))[0].result;}finally{await service();}}
before(async()=>{
 pg=await freshDatabase();db=freshInstallClient(pg);await service();await provisionDeployment(db,roster,env);agents=await q('SELECT id,clerk_user_id FROM enrolled_agents');rows=await q('SELECT id,clerk_user_id FROM tenant_agents');
 await q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)",[T,auth(0).userId,auth(2).userId,[aid(1)]]);
});
after(async()=>{await pg?.close();});
beforeEach(async()=>{await service();await q('DELETE FROM admission_counters');});

for(const [code,t,s] of [
 ['terminated',[{termination_type:'terminated',county_mapping_status:'unavailable'}],[]],
 ['county_dropped',[{...transition,termination_type:'service_area_reduction',county_mapping_status:'affected_service_area'}],[]],
 ['crosswalked',[{...transition,termination_type:'consolidated_renewal',new_plan_id:'002'}],[]],
 ['low_performing',[transition],[{...successor,low_performing:true}]],
 ['stars_below_3',[transition],[{...successor,overall_star_rating:2.5}]],
 ['premium_increase',[transition],[{...successor,monthly_premium:20.01}]],
 ['type_changed',[transition],[{...successor,plan_type:'PPO'}]],
 ['renewing',[transition],[successor]],
])test('constructed CMS reason: '+code,async()=>{const result=await evaluate(current,t,s);assert.deepEqual(result.reasons,[code]);await pg.exec('RESET ROLE');try{assert.equal((await q('SELECT reshop_reason_label($1) label',[code]))[0].label,RESHOP_REASONS[code]);}finally{await service();}});
test('all applicable reasons have fixed severity order and maximum premium increase',async()=>{
 const r=await evaluate(current,[{...transition,termination_type:'terminated'},{...transition,termination_type:'service_area_reduction',county_mapping_status:'affected_service_area'},{...transition,termination_type:'consolidated_renewal',new_plan_id:'002'}],[{...successor,monthly_premium:45,low_performing:true,overall_star_rating:2,plan_type:'PPO'},{...successor,monthly_premium:90}]);
 assert.deepEqual(r.reasons,Object.keys(RESHOP_REASONS).slice(0,7));assert.equal(r.premium_increase,70);
});
test('terminated plan without county evidence is never a dropped-county assertion',async()=>{const r=await evaluate(current,[{termination_type:'terminated',county_mapping_status:'unavailable'}],[]);assert.deepEqual(r.reasons,['terminated']);assert.equal(r.county_confirmed,false);});
for(const mapping of ['unavailable','current_service_area',null])test('SAR without affected historical county evidence: '+mapping,async()=>{const r=await evaluate(current,[{...transition,termination_type:'service_area_reduction',county_mapping_status:mapping}],[]);assert.ok(!r.reasons.includes('county_dropped'));});
test('affected evidence for another county does not mark this county dropped',async()=>{assert.ok(!(await evaluate(current,[{...transition,termination_type:'service_area_reduction',county_mapping_status:'affected_service_area',county_fips:'42095'}],[])).reasons.includes('county_dropped'));});
test('missing following-year data suppresses every reason and premium difference',async()=>{const r=await evaluate(current,[{termination_type:'terminated'}],[{...successor,monthly_premium:100}],false);assert.equal(r.group,'next_year_not_loaded');assert.deepEqual(r.reasons,[]);assert.equal(r.premium_increase,0);});
test('unsupported coverage has no CMS reasons even if IDs happen to match',async()=>{const r=await evaluate({...current,coverage:'Medicare Supplement'},[{termination_type:'terminated'}]);assert.equal(r.group,'not_covered');assert.deepEqual(r.reasons,[]);});
test('unknown transition never claims renewing; missing premium and rating stay unknown',async()=>{assert.deepEqual((await evaluate(current,[],[])).reasons,[]);const r=await evaluate({...current,premium:null,plan_type:null},[transition],[{...successor,monthly_premium:100,overall_star_rating:null,plan_type:null}]);assert.deepEqual(r.reasons,['renewing']);});
test('effective years use the exact date and reject malformed or impossible dates',async()=>{
 await pg.exec('RESET ROLE');try{for(const [date,year] of [['2026-12-31',2026],['2027-01-01',2027],['2030-04-12',2030],['2026-02-30',null],['2026junk',null],[null,null]])assert.equal((await q('SELECT reshop_year($1) y',[date]))[0].y,year);}finally{await service();}
});
let basic;
test('real enrollment and CMS join normalizes plan/segment IDs and returns audited names and PTC',async()=>{
 basic=await seed();await landscape(basic.key);await cross(basic.key);
 const response=await handler()(req());assert.equal(response.status,200,await response.clone().text());const r=(await response.json()).rows.find(r=>r.id===basic.e);
 assert.deepEqual(r.reasons,['renewing']);assert.equal(r.client,'Synthetic Client');assert.equal(r.current.segment_id,'000');assert.equal(r.successors[0].contract_id,basic.key);assert.equal(r.year,2026);assert.equal(r.target_year,2027);assert.equal(permissionLabel(r.permission),'Permission on file');
 const logs=await q("SELECT * FROM evidence_access_log WHERE resource_type='reshop_list'");assert.equal(logs.length,1);assert.equal(logs[0].action,'list');
});
test('each enrollment uses its following year rather than a fixed loaded year',async()=>{const s=await seed({data:{effectiveDate:'2027-01-01'}});await landscape(s.key);await cross(s.key);const r=await row(s.e);assert.equal(r.target_year,2028);assert.equal(r.group,'next_year_not_loaded');assert.deepEqual(r.reasons,[]);assert.deepEqual(r.successors,[]);});
test('completed latest intake is selected per coverage, before scope; drafts and test enrollments are excluded',async()=>{
 const old=await seed(),newId=id(seq++);await q("INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,submitted_at) SELECT $1,tenant_id,call_id,contact_id,jsonb_set(data,'{writingAgentId}',to_jsonb($2::text)),pii_encrypted,carrier_key,'2026-11-01' FROM enrollment_intakes WHERE id=$3",[newId,rows.find(a=>a.clerk_user_id===roster[3].clerk_user_id).id,old.e]);
 assert.equal(await row(old.e),undefined);assert.equal(await row(newId),undefined);assert.ok(await row(newId,3));
 for(const options of [{completed:false},{isTest:true}]){const s=await seed(options);assert.equal(await row(s.e),undefined);}
});
test('structured writing agent supersedes call owner and contact assignment',async()=>{const s=await seed({owner:3,writer:1});assert.equal((await row(s.e)).agent_id,aid(1));assert.equal(await row(s.e,3),undefined);});
for(const [name,n] of [['agent',1],['manager',2],['admin',0]])test('database and HTTP enforce '+name+' scope',async()=>{
 const s=await seed({owner:3});const direct=await list(n),response=await handler(n)(req());assert.equal(response.status,200,await response.clone().text());const remote=await response.json();
 for(const result of [direct,remote]){assert.equal(result.rows.some(r=>r.id===s.e),n===0);if(n!==0)assert.ok(result.rows.every(r=>r.agent_id===aid(1)));}
});
for(const kind of ['unprovisioned','inactive','foreign_org','foreign_agency'])test('direct database and endpoint deny '+kind,async()=>{
 let who=auth(1);if(kind==='unprovisioned')who={...who,userId:'user_not_provisioned'};if(kind==='foreign_org')who={...who,orgId:'org_foreign'};
 if(kind==='inactive')await q('UPDATE enrolled_agents SET is_active=false WHERE id=$1',[aid(1)]);
 if(kind==='foreign_agency'){await pg.exec('RESET ROLE');await q('ALTER TABLE enrolled_agents DISABLE TRIGGER USER');await q('INSERT INTO tenants(id,name,clerk_org_id) VALUES($1,\'Synthetic Foreign\',\'org_foreign\')',[id(9999)]);await q('UPDATE enrolled_agents SET tenant_id=$1 WHERE id=$2',[id(9999),aid(1)]);await q('ALTER TABLE enrolled_agents ENABLE TRIGGER USER');await service();}
 try{assert.equal((await db.rpc('read_reshop_list',{p_actor:who.userId,p_org:who.orgId})).error?.code,'42501');assert.equal((await handler(who)(req())).status,403);}
 finally{if(kind==='inactive')await q('UPDATE enrolled_agents SET is_active=true WHERE id=$1',[aid(1)]);if(kind==='foreign_agency'){await pg.exec('RESET ROLE');await q('ALTER TABLE enrolled_agents DISABLE TRIGGER USER');await q('UPDATE enrolled_agents SET tenant_id=$1 WHERE id=$2',[T,aid(1)]);await q('ALTER TABLE enrolled_agents ENABLE TRIGGER USER');await service();}}
});
test('empty explicit manager team sees no rows and cannot act on a former team member',async()=>{await q('UPDATE deployment_authorities SET team_agent_ids=\'{}\' WHERE clerk_user_id=$1',[auth(2).userId]);try{assert.equal((await list(2)).total,0);assert.equal((await action(basic.e,'review','kept_plan',2)).status,403);}finally{await q('UPDATE deployment_authorities SET team_agent_ids=$1 WHERE clerk_user_id=$2',[[aid(1)],auth(2).userId]);}});
test('browser roles cannot read, mutate, impersonate the service actor or invoke private source',async()=>{
 for(const role of ['anon','authenticated']){await pg.exec('SET ROLE '+role);for(const sql of ['SELECT * FROM reshop_reviews',"UPDATE reshop_reviews SET reviewed_by='forged'",'DELETE FROM reshop_reviews',`SELECT * FROM reshop_rows('${auth(0).userId}','${profile.organizationId}')`])await assert.rejects(q(sql),e=>e.code==='42501');assert.ok((await read()).error);}
 await service();await assert.rejects(q(`SELECT * FROM reshop_rows('${auth(0).userId}','${profile.organizationId}')`),e=>e.code==='42501');await assert.rejects(q('INSERT INTO reshop_reviews DEFAULT VALUES'),e=>e.code==='42501');
});
for(const samePhone of [false,true])test('DNC contact and matching phone identity excluded: '+samePhone,async()=>{
 const s=await seed({dnc:!samePhone});if(samePhone){const d=await seed({dnc:true});const [c]=await q('SELECT phone_hash FROM contacts WHERE id=$1',[s.contact]);await q('UPDATE contacts SET phone_hash=$1 WHERE id=$2',[c.phone_hash,d.contact]);}
 assert.equal(await row(s.e),undefined);assert.equal((await action(s.e)).status,403);
});
test('Disenrolled opportunity excludes contact independently of other opportunities',async()=>{
 const s=await seed();const pipeline=id(seq++),stage=id(seq++);await q("INSERT INTO pipelines(id,tenant_id,name) VALUES($1,$2,'Synthetic')",[pipeline,T]);await q("INSERT INTO pipeline_stages(id,tenant_id,pipeline_id,name,position) VALUES($1,$2,$3,'Disenrolled',1)",[stage,T,pipeline]);await q("INSERT INTO opportunities(id,tenant_id,pipeline_id,stage_id,contact_id,assigned_agent_id,line_of_business) VALUES($1,$2,$3,$4,$5,$6,'MA')",[id(seq++),T,pipeline,stage,s.contact,rows.find(a=>a.clerk_user_id===roster[1].clerk_user_id).id]);assert.equal(await row(s.e),undefined);assert.equal((await action(s.e)).status,403);
});
test('successors expose only source-linked same-carrier plans and exact renewal segment',async()=>{
 const s=await seed();await landscape(s.key);await landscape(s.key,{segment:'001',premium:100});await cross(s.key);
 const competing='H'+String(seq++).padStart(4,'0');await landscape(competing,{carrier:'Competing Carrier',premium:100});await cross(s.key,{next:competing});const r=await row(s.e);assert.equal(r.successors.length,1);assert.equal(r.successors[0].segment_id,'000');assert.equal(r.successors[0].contract_id,s.key);assert.ok(!JSON.stringify(r).includes('Competing Carrier'));
});
test('ranking uses reason severity then descending increase then oldest enrollment, with renewing separate',async()=>{
 const a=await seed({submitted:'2026-09-01'}),b=await seed({submitted:'2026-08-01'}),c=await seed({submitted:'2026-07-01'}),term=await seed();
 for(const s of [a,b,c]){await landscape(s.key,{premium:s===c?40:50});await cross(s.key);}
 await cross(term.key,{status:'terminated',next:null,plan:null,county:null,mapping:'unavailable'});
 const items=(await list()).rows,ix=e=>items.findIndex(r=>r.id===e);assert.ok(ix(term.e)<ix(b.e));assert.ok(ix(b.e)<ix(a.e));assert.ok(ix(a.e)<ix(c.e));assert.equal(items.find(r=>r.id===basic.e).group,'renewing');
});
test('every filter, reason counts and pagination use the authorized collection',async()=>{
 const s=await seed();await landscape(s.key,{premium:30,stars:2.5,low:true});await cross(s.key);const r=await row(s.e);
 for(const filter of [{reason:'premium_increase'},{agent:aid(1)},{carrier:'Synthetic Carrier'},{state:'NJ'},{review:'unreviewed'}])assert.ok((await list(1,filter)).rows.some(row=>row.id===s.e));
 const data=await list(1,{reason:'low_performing'});assert.equal(data.counts.low_performing,data.total);assert.ok(data.counts.stars_below_3>=1);assert.ok(data.options.agents.every(a=>a.id===aid(1)));assert.deepEqual(r.reasons,['low_performing','stars_below_3','premium_increase']);
 const first=(await read(1,{}, {p_limit:2,p_offset:0})).data,second=(await read(1,{}, {p_limit:2,p_offset:2})).data;assert.equal(first.total,second.total);assert.ok(first.rows.every(a=>second.rows.every(b=>a.id!==b.id)));
});
let reviewed;
test('Add task is exactly once, belongs to writing agent, links the contact and has top fixed reason',async()=>{
 reviewed=await seed({owner:3,writer:1});await cross(reviewed.key,{status:'terminated',next:null,plan:null,county:null,mapping:'unavailable'});
 const a=await action(reviewed.e,'task'),b=await action(reviewed.e,'task');assert.equal(a.status,200,await a.clone().text());assert.equal(b.status,200);assert.equal((await a.json()).task_id,(await b.json()).task_id);
 const tasks=await q('SELECT * FROM follow_ups WHERE contact_id=$1',[reviewed.contact]);assert.equal(tasks.length,1);assert.equal(tasks[0].agent_id,roster[1].agent_slug);assert.equal(tasks[0].reason,RESHOP_REASONS.terminated);
});
test('review records fixed outcome, verified actor, server time once and appears once in lifecycle',async()=>{
 const start=Date.now();for(let i=0;i<2;i++)assert.equal((await action(reviewed.e,'review','reshopped')).status,200);
 const [r]=await q('SELECT * FROM reshop_reviews WHERE enrollment_id=$1',[reviewed.e]);assert.equal(r.outcome,'reshopped');assert.equal(r.reviewed_by,auth(1).userId);assert.ok(Date.parse(r.reviewed_at)>=start-1000);
 const lifecycle=createConsumerLifecycleHandler({env,getDb:()=>db,authenticate:async()=>auth(0)}),response=await lifecycle(new Request('https://example.invalid/api/consumer-lifecycle?contact_id='+reviewed.contact));assert.equal(response.status,200,await response.clone().text());const events=(await response.json()).events.filter(e=>e.type==='reshop_review');assert.equal(events.length,1);assert.equal(events[0].summary,'Annual re-shop reviewed');assert.equal(events[0].staff,auth(1).userId);assert.equal(events[0].details.outcome,'reshopped');
 assert.equal((await action(reviewed.e,'review','kept_plan')).status,409);
});
for(const outcome of Object.keys(RESHOP_OUTCOMES))test('fixed review outcome: '+outcome,async()=>{const s=await seed();const r=await action(s.e,'review',outcome);assert.equal(r.status,200,await r.clone().text());const data=await r.json();assert.equal(data.outcome,outcome);assert.equal(data.use_do_not_call_control,outcome==='asked_not_to_be_contacted');assert.equal((await q('SELECT do_not_call FROM contacts WHERE id=$1',[s.contact]))[0].do_not_call,false);});
test('administrator mutation uses the existing transactional administrator trail',async()=>{const s=await seed();assert.equal((await action(s.e,'review','kept_plan',0)).status,200);const logs=await q("SELECT * FROM admin_action_log WHERE action='reshop_list' AND target_id=$1",[s.e]);assert.equal(logs.length,1);assert.equal(logs[0].actor_id,auth(0).userId);});
test('audit failure withholds reads and prevents task/review writes',async()=>{
 const s=await seed();await cross(s.key,{status:'terminated',next:null,plan:null,county:null,mapping:'unavailable'});
 const fail={...db,from:table=>table==='evidence_access_log'?{insert:async()=>({error:Error('synthetic')})}:db.from(table)};
 assert.equal((await handler(1,fail)(req())).status,503);assert.equal((await action(s.e,'task','kept_plan',1,fail)).status,503);assert.equal((await action(s.e,'review','kept_plan',1,fail)).status,503);assert.equal((await q('SELECT * FROM reshop_reviews WHERE enrollment_id=$1',[s.e])).length,0);
});
test('source updates are visible immediately without any snapshot or background work',async()=>{
 const s=await seed();await landscape(s.key);await cross(s.key);assert.deepEqual((await row(s.e)).reasons,['renewing']);await q('UPDATE cms_plans_py2027 SET monthly_premium=40 WHERE contract_id=$1',[s.key]);assert.deepEqual((await row(s.e)).reasons,['premium_increase']);await q("UPDATE enrollment_intakes SET data=jsonb_set(data,'{premium}','\"50.00\"') WHERE id=$1",[s.e]);assert.deepEqual((await row(s.e)).reasons,['renewing']);
 const [stored]=await q("SELECT array_agg(column_name) columns FROM information_schema.columns WHERE table_name='reshop_reviews'");assert.deepEqual(stored.columns.sort(),['id','tenant_id','enrollment_id','contact_id','agent_id','target_year','task_id','outcome','reviewed_by','reviewed_at','retention_started_at'].sort());
});
test('no free-text plan, transcript, election, recommendation or competing-plan output',async()=>{
 const s=await seed({data:{planName:'election period recommendation Competing Carrier',notes:'secret transcript'}});await landscape(s.key);await cross(s.key);await q("UPDATE cms_plans_py2027 SET plan_name='recommendation election period competing plan' WHERE contract_id=$1",[s.key]);const r=await row(s.e);assert.doesNotMatch(JSON.stringify(r),/election period|recommendation|competing plan|transcript/i);
 for(const file of ['netlify/functions/reshop-list.js','src/lib/reshopList.js','src/components/contacts/ReshopList.jsx','supabase/migrations/170_reshop_list.sql'])assert.doesNotMatch(readFileSync(file,'utf8'),/from ['"].*(?:openai|llm|twilio|delivery)|fetch\(|messages\.create|calls\.create|INSERT INTO public\.(?:messages|.*deliveries|.*jobs)/i,file);
});
test('feature off refuses every HTTP method before auth/client work and database returns no data',async()=>{
 const disabled=createReshopListHandler({env:{},getDb:()=>assert.fail('DB touched'),authenticate:()=>assert.fail('auth touched')});for(const request of [req(),req({id:basic.e,action:'task'})])assert.equal((await disabled(request)).status,404);
 await service({});try{assert.equal((await read()).error.code,'42501');assert.equal((await db.rpc('act_on_reshop',{p_actor:auth(1).userId,p_org:profile.organizationId,p_id:basic.e,p_action:'task'})).error.code,'42501');}finally{await service();}
 assert.equal(reshopFeatures({}).RESHOP_LIST_ENABLED,false);assert.throws(()=>reshopFeatures({RESHOP_LIST_ENABLED:'TRUE'}));
 const response=await createDeploymentFeaturesHandler({env:{...env,RESHOP_LIST_ENABLED:'false'},authenticate:async()=>auth(1)})(new Request('https://example.invalid/api/deployment-features'));assert.equal((await response.json()).features.RESHOP_LIST_ENABLED,false);
 const ui=readFileSync('src/components/contacts/ContactsTab.jsx','utf8');assert.match(ui,/features\.RESHOP_LIST_ENABLED&&<button/);assert.match(ui,/features\.RESHOP_LIST_ENABLED&&location.view==='reshop'/);assert.match(readFileSync('src/components/contacts/ReshopList.jsx','utf8'),/useState\(false\).*|open=\{renewing\}/);
});
test('named admission routes share atomic counters and fail closed',async()=>{
 for(const route of Object.keys(RESHOP_ADMISSION)){await q('DELETE FROM admission_counters');for(let i=0;i<RESHOP_ADMISSION[route];i++)await admitReshop(db,route,auth(1).userId,profile);await assert.rejects(admitReshop(db,route,auth(1).userId,profile),e=>e.status===429);}
 await assert.rejects(admitReshop({rpc:async()=>({error:Error()})},'reshopRead',auth(1).userId,profile),e=>e.status===503);
});
test('invalid action, outcome, pagination and reasons are rejected without creating records',async()=>{
 for(const body of [{id:basic.e,action:'send'},{id:basic.e,action:'review',outcome:'arbitrary'},{id:'not-id',action:'task'}])assert.equal((await handler()(req(body))).status,400);
 for(const params of ['limit=201','offset=-1','reason=arbitrary','review=arbitrary'])assert.equal((await handler()(req(null,params))).status,400);
});
test('reviews use existing enrollment retention clock and purge with the enrollment',async()=>{
 const s=await seed();assert.equal((await action(s.e)).status,200);assert.equal(TABLE_CLASS.reshop_reviews,'enrollment');
 const [r]=await q('SELECT r.retention_started_at=e.retention_started_at same FROM reshop_reviews r JOIN enrollment_intakes e ON e.id=r.enrollment_id WHERE e.id=$1',[s.e]);assert.equal(r.same,true);
 await pg.exec('RESET ROLE; ALTER TABLE enrollment_intakes DISABLE TRIGGER retention_anchor_immutable; ALTER TABLE call_records DISABLE TRIGGER retention_anchor_immutable; ALTER TABLE reshop_reviews DISABLE TRIGGER retention_anchor_immutable');
 for(const table of ['enrollment_intakes','call_records','reshop_reviews'])await q(`UPDATE ${table} SET retention_started_at='2000-01-01' WHERE ${table==='reshop_reviews'?'enrollment_id':'id'}=$1`,[table==='call_records'?s.call:s.e]);
 await pg.exec('ALTER TABLE enrollment_intakes ENABLE TRIGGER retention_anchor_immutable; ALTER TABLE call_records ENABLE TRIGGER retention_anchor_immutable; ALTER TABLE reshop_reviews ENABLE TRIGGER retention_anchor_immutable');
 // The existing immutable evidence trail is aged only by the fixture owner.
 await pg.exec('ALTER TABLE evidence_access_log DISABLE TRIGGER USER');await q("UPDATE evidence_access_log SET occurred_at='2000-01-01'");await pg.exec('ALTER TABLE evidence_access_log ENABLE TRIGGER USER');await service({...env,RETENTION_PURGE_ENABLED:'true'});
 const result=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>new Date('2045-01-01'),batchSize:500,maxBatches:10});assert.equal((await q('SELECT * FROM reshop_reviews WHERE enrollment_id=$1',[s.e])).length,0,JSON.stringify(result));assert.equal((await q('SELECT * FROM enrollment_intakes WHERE id=$1',[s.e])).length,0);assert.equal((await q("SELECT * FROM retention_purge_items WHERE source_table='reshop_reviews' AND contact_id=$1",[s.contact])).length,1);
});

for(const reason of Object.keys(RESHOP_REASONS))test('canonical enrollment/CMS rows produce '+reason,async()=>{
 const s=await seed({data:{planType:'HMO'}});
 if(reason==='terminated')await cross(s.key,{status:'terminated',next:null,plan:null,county:null,mapping:'unavailable'});
 else{
  await landscape(s.key,{plan:reason==='crosswalked'?'002':'001',low:reason==='low_performing',stars:reason==='stars_below_3'?2.5:4,premium:reason==='premium_increase'?30:20,type:reason==='type_changed'?'PPO':'HMO'});
  await cross(s.key,{plan:reason==='crosswalked'?'002':'001',status:reason==='county_dropped'?'service_area_reduction':reason==='crosswalked'?'consolidated_renewal':'renewal',mapping:reason==='county_dropped'?'affected_service_area':'current_service_area'});
 }
 assert.deepEqual((await row(s.e)).reasons,[reason]);
});
test('future canonical annual landscape is discovered from effective year, without code or data relabeling',async()=>{
 const s=await seed({data:{effectiveDate:'2029-01-01',planType:'HMO'}});
 await pg.exec('RESET ROLE; CREATE TABLE public.cms_plans_py2030 AS SELECT * FROM public.cms_plans_py2027 WITH NO DATA; ALTER TABLE plan_terminations DROP CONSTRAINT plan_terminations_py2027_only');
 await q("INSERT INTO cms_plans_py2030(plan_year,category,state_code,county_name,county_fips,carrier,contract_id,plan_id,segment_id,contract_plan_segment_id,plan_name,plan_type,monthly_premium,source_file) VALUES(2030,'MA','NJ','Synthetic County','08005','Synthetic Carrier',$1,'001','000',$1||'_001_000','Synthetic Future Plan','PPO',25,'synthetic')",[s.key]);await service();await cross(s.key,{year:2030});
 const r=await row(s.e);assert.equal(r.year,2029);assert.equal(r.target_year,2030);assert.deepEqual(r.reasons,['premium_increase','type_changed']);assert.equal(r.successors[0].plan_type,'PPO');
});
test('county name resolves only with unambiguous explicit county/state; missing county stays unconfirmed',async()=>{
 const s=await seed({county:'Synthetic County'});await landscape(s.key);await cross(s.key);await q("INSERT INTO zip_county_crosswalk(zip,county_fips,county_name,state_code) VALUES('08016','08005','Synthetic County','NJ')");assert.equal((await row(s.e)).county_fips,'08005');await q('UPDATE contacts SET county=NULL,zip=\'08016\' WHERE id=$1',[s.contact]);const r=await row(s.e);assert.equal(r.county_fips,null);assert.equal(r.county_confirmed,false);assert.ok(!r.reasons.includes('county_dropped'));
});
test('a second coverage type remains alongside the latest MA enrollment',async()=>{
 const s=await seed(),second=id(seq++);await q("INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,submitted_at) SELECT $1,tenant_id,call_id,contact_id,jsonb_set(data,'{planType}','\"Medicare Supplement\"'),pii_encrypted,carrier_key,'2026-11-01' FROM enrollment_intakes WHERE id=$2",[second,s.e]);const items=(await list()).rows.filter(r=>r.contact_id===s.contact);assert.equal(items.length,2);const unsupported=items.find(r=>r.id===second);assert.equal(unsupported.group,'not_covered');assert.deepEqual(unsupported.reasons,[]);
});
