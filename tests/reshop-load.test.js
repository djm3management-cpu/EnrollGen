import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with {type:'json'};
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {createReshopListHandler} from '../netlify/functions/reshop-list.js';
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),RESHOP_LIST_ENABLED:'true'};
test('5,000 enrolled clients: scoped server list, counts, ranking and name page within two seconds',async t=>{
 const pg=await freshDatabase(),db=freshInstallClient(pg);
 try{
  await pg.exec('SET ROLE service_role');await pg.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify({'x-enrollgen-features':JSON.stringify({...JSON.parse(featureHeaders(env)['x-enrollgen-features']),RESHOP_LIST_ENABLED:true})})]);
  await provisionDeployment(db,roster,env);
  const {rows:[writer]}=await pg.query('SELECT e.id agent,r.id roster FROM enrolled_agents e JOIN tenant_agents r USING(tenant_id,clerk_user_id) WHERE e.clerk_user_id=$1',[roster[1].clerk_user_id]);
  await pg.query("INSERT INTO contacts(id,tenant_id,assigned_agent_id,first_name,last_name,phone,county,state) SELECT md5('reshop-contact-'||n)::uuid,$1,$2,'Synthetic','Client '||n,'+1212'||lpad(n::text,7,'0'),'08005','NJ' FROM generate_series(1,5000) n",[profile.tenantId,roster[1].agent_slug]);
  await pg.query("INSERT INTO call_records(id,tenant_id,agent_id,contact_id,call_type,call_direction,product_type,call_start,ptc_on_file,ptc_date,ptc_expiry) SELECT md5('reshop-call-'||n)::uuid,$1,$2,md5('reshop-contact-'||n)::uuid,'enrollment','inbound','MA','2026-10-01',true,current_date-1,current_date+30 FROM generate_series(1,5000) n",[profile.tenantId,writer.agent]);
  await pg.query("INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,submitted_at) SELECT md5('reshop-intake-'||n)::uuid,$1,md5('reshop-call-'||n)::uuid,md5('reshop-contact-'||n)::uuid,jsonb_build_object('contractId','H'||lpad((n%100)::text,4,'0'),'planId','001','segmentId','000','planType','MA/MAPD/PDP','premium',10,'newCarrier','Synthetic Carrier','effectiveDate','2026-01-01','writingAgentId',$2::text),'{}','Other','2026-10-01' FROM generate_series(1,5000) n",[profile.tenantId,writer.roster]);
  await pg.exec("INSERT INTO cms_plans_py2027(category,state_code,county_name,county_fips,carrier,contract_id,plan_id,segment_id,contract_plan_segment_id,plan_name,plan_type,monthly_premium,source_file) SELECT 'MA','NJ','Synthetic County','08005','Synthetic Carrier','H'||lpad(n::text,4,'0'),'001','000','H'||lpad(n::text,4,'0')||'_001_000','Synthetic CMS Plan','HMO',20,'synthetic' FROM generate_series(0,99) n");
  await pg.exec("INSERT INTO plan_terminations(old_contract_id,old_plan_id,termination_type,new_contract_id,new_plan_id,county_fips,state_code,plan_year,source_key,source_status,county_mapping_status) SELECT 'H'||lpad(n::text,4,'0'),'001','renewal','H'||lpad(n::text,4,'0'),'001','08005','NJ',2027,'synthetic-'||n,'Renewal Plan','current_service_area' FROM generate_series(0,99) n");
  await pg.exec('ANALYZE');
  const handler=createReshopListHandler({env,getDb:()=>db,authenticate:async()=>({userId:roster[1].clerk_user_id,orgId:profile.organizationId,tokenPayload:{}})}),times=[];
  for(let i=0;i<3;i++){
   const start=performance.now(),response=await handler(new Request('https://example.invalid/api/reshop-list?limit=100')),data=await response.json(),ms=performance.now()-start;
   assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.total,5000);assert.equal(data.rows.length,100);assert.equal(data.counts.premium_increase,5000);assert.ok(data.rows.every(r=>r.client.startsWith('Synthetic Client ')&&r.agent_id===writer.agent));times.push(ms);
  }
  t.diagnostic(JSON.stringify({clients:5000,page:100,runs_ms:times.map(v=>+v.toFixed(2)),max_ms:+Math.max(...times).toFixed(2),database:'local PGlite; complete server handler including auth scope, admission, audit, counts, ranking and name decryption'}));
  assert.ok(Math.max(...times)<2000,JSON.stringify(times));
 }finally{await pg.close();}
});
