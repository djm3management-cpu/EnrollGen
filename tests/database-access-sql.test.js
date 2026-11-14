import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessDatabase,fixtureRoster,uuid,T,U,publicReferences} from './helpers/databaseAccessSchema.js';
let pg,realTables,agents;
const actualTables=()=>[...realTables];
const q=(s,args=[])=>pg.query(s,args).then(r=>r.rows);
const A=fixtureRoster[0], B=fixtureRoster[1], M=fixtureRoster[2], D=fixtureRoster[3];
const embedding='['+[1,...Array(1535).fill(0)].join(',')+']';
const own=uuid(1), other=uuid(2), foreign=uuid(3), ca=uuid(11),cb=uuid(12),cf=uuid(13),sa=uuid(21),sb=uuid(22),sf=uuid(23);
const as=async(sub,role='authenticated',extra={})=>{
 await pg.exec('RESET ROLE');
 await q("SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers','{}',false)",[JSON.stringify({sub,role,...extra})]);
 await pg.exec('SET ROLE '+role);
};
const denied=async work=>assert.rejects(work,e=>e.code==='42501');
const zero=async(table,columns='*')=>{
 try{assert.equal((await q(`SELECT ${columns} FROM ${table}`)).length,0,table);}catch(e){if(e.code!=='42501')throw e;}
};
before(async()=>{
 ({pg,realTables}=await buildAccessDatabase());
 agents=await q('SELECT id,clerk_user_id FROM enrolled_agents');
 const eid=a=>agents.find(e=>e.clerk_user_id===a.clerk_user_id).id;
 await q("UPDATE enrolled_agents SET role='principal' WHERE clerk_user_id=$1",[D.clerk_user_id]);
 await q("INSERT INTO deployment_authorities VALUES($1,$2,'manager',$3)",[T,M.clerk_user_id,[eid(B)]]);
 await q("INSERT INTO tenants(id,name,clerk_org_id) VALUES($1,'Foreign','org_foreign')",[U]);
 for(const [id,tenant,slug] of [[ca,T,A.agent_slug],[cb,T,B.agent_slug],[cf,U,'foreign']])await q('INSERT INTO contacts(id,tenant_id,first_name,last_name,phone,assigned_agent_id) VALUES($1,$2,$3,$4,$5,$6)',[id,tenant,'Private',slug,'+1202555'+id.slice(-4),slug]);
 for(const [call,session,contact,tenant,agent] of [[own,sa,ca,T,eid(A)],[other,sb,cb,T,eid(B)],[foreign,sf,cf,U,uuid(500)]]){
  if(tenant===U)await q("INSERT INTO enrolled_agents(id,tenant_id,clerk_user_id,name,is_active) VALUES($1,$2,'user_foreign','Foreign',true)",[agent,U]);
  await q("INSERT INTO sessions(id,tenant_id,agent_id,flow) VALUES($1,$2,$3,'ma')",[session,tenant,agent]);
  await q("INSERT INTO call_records(id,tenant_id,agent_id,session_id,contact_id,agent_name,call_direction,call_type,product_type,call_start,twilio_call_sid) VALUES($1,$2,$3,$4,$5,'Fixture','inbound','sales','MA',now(),$6)",[call,tenant,agent,session,contact,'CA'+call.replaceAll('-','').slice(0,32)]);
  await q('INSERT INTO agents(id,name) VALUES($1,$2)',[agent,'Reference Agent']);
  await q("INSERT INTO call_transcripts(id,tenant_id,session_id,owner_agent_id,transcript_text,call_date,product_line,phi_scrubbed,agent_id) VALUES($1,$2,$3,$4,$5,now(),'MA',true,$4)",[uuid(Number(call.slice(-3))+30),tenant,session,agent,'PRIVATE '+call]);
  await q('INSERT INTO transcript_chunks(transcript_id,chunk_text,chunk_index,embedding) VALUES($1,$2,0,$3::vector)',[uuid(Number(call.slice(-3))+30),'PRIVATE CHUNK',embedding]);
  await q("INSERT INTO compliance_flags(session_id,section_label,level,message) VALUES($1,'Intro','warn','PRIVATE FLAG')",[session]);
  await q('INSERT INTO section_scores(session_id,section_number,section_label) VALUES($1,1,\'Intro\')',[session]);
  await q('INSERT INTO enrollment_intakes(tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key) VALUES($1,$2,$3,\'{}\',\'{}\',\'aetna\')',[tenant,call,contact]);
  await q("INSERT INTO contact_notes(tenant_id,contact_id,agent_id,body) VALUES($1,$2,$3,'PRIVATE NOTE')",[tenant,contact,tenant===T?(agent===eid(A)?A:B).agent_slug:'foreign']);
  await q("INSERT INTO messages(id,tenant_id,contact_id,body) VALUES($1,$2,$3,'PRIVATE MESSAGE')",[call,tenant,contact]);
  await q('INSERT INTO message_media(tenant_id,message_id,storage_path) VALUES($1,$2,$3)',[tenant,call,call+'.gif']);
  await q("INSERT INTO storage.objects(bucket_id,name) VALUES('message-media',$1),('call-recordings',$2)",[call+'.gif',call+'.wav']);
 }
 await q('INSERT INTO training_completions(tenant_id,agent_id) VALUES($1,$2),($1,$3)',[T,eid(A),eid(B)]);
 await q("INSERT INTO sales_log(agent_id,clerk_user_id,product_type) VALUES($1,$2,'MA'),($3,$4,'MA')",[eid(A),A.clerk_user_id,eid(B),B.clerk_user_id]);

 await q("INSERT INTO pipelines(id,tenant_id,name,is_default) VALUES($1,$2,'Default',true)",[uuid(100),T]);
 await q("INSERT INTO pipeline_stages(id,tenant_id,pipeline_id,name,position,color) VALUES($1,$2,$3,'New',0,'#a78bfa')",[uuid(101),T,uuid(100)]);
 for(const [n,contact,roster] of [[110,ca,A],[111,cb,B]]){
  await q("INSERT INTO opportunities(id,tenant_id,pipeline_id,stage_id,contact_id,assigned_agent_id,line_of_business,pii_encrypted) VALUES($1,$2,$3,$4,$5,$6,'MA',jsonb_build_object('title',encrypt_pii_value('Private opportunity')))",[uuid(n),T,uuid(100),uuid(101),contact,roster.id]);
  await q("INSERT INTO contact_tags(id,tenant_id,contact_id,name_encrypted,created_by) VALUES($1,$2,$3,encrypt_pii_value('Private tag'),$4)",[uuid(n+10),T,contact,roster.id]);
 }
 await q("INSERT INTO opportunities(id,tenant_id,pipeline_id,stage_id,contact_id,line_of_business) VALUES($1,$2,$3,$4,$5,'MA')",[uuid(112),T,uuid(100),uuid(101),ca]);
 await q('INSERT INTO vendor_controls(tenant_id) VALUES($1)',[T]);
 await q("INSERT INTO carrier_rts(tenant_id,agent_id,channel,carrier,product_line,agent_name) VALUES($1,$2,'Sunfire','Carrier','MA','Own'),($1,$3,'Sunfire','Carrier','MA','Other')",[T,A.id,B.id]);
});
after(async()=>{if(pg)await pg.close();});

for(const [label,subject,claims] of [['unprovisioned','user_unknown',{}],['different org',A.clerk_user_id,{org_id:'org_foreign'}],['foreign tenant','user_foreign',{}],['anon',A.clerk_user_id,{role:'anon'}]]) {
 test(`${label}: direct REST projections, mutations and protected RPCs deny across the entire public catalog`,async()=>{
  await as(subject,claims.role||'authenticated',claims);
  for(const name of actualTables().filter(n=>!n.includes('.')&&!publicReferences.includes(n)&&!['cms_plans_py2026','ghl_sync_log'].includes(n))) {
   await zero(name,name==='contacts'?'id':'*');
   await denied(q(`INSERT INTO ${name} DEFAULT VALUES`));
   await denied(q(`DELETE FROM ${name}`));
   const first=(await pg.query("SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attidentity='' ORDER BY attnum LIMIT 1",[name])).rows[0].attname;
   await denied(q(`UPDATE ${name} SET ${first}=${first}`));
  }
  for(const call of ["decrypt_pii('"+ca+"','"+A.id+"')","read_contact_details(ARRAY['"+ca+"'::uuid],'"+A.id+"')","create_workspace_record('contacts','{}')","provision_deployment_roster('{}','[]')","configure_deployment_vendor('{}')","commit_rts_ingestion(NULL,NULL,NULL,NULL,NULL,0,0,'[]','[]')"]){
   await assert.rejects(q('SELECT '+call));
  }
  await zero('storage.objects');
  await denied(q("UPDATE contacts SET zip='00000'"));
  await denied(q("UPDATE call_records SET call_outcome='enrolled'"));
  await denied(q("UPDATE contact_notes SET body='forged'"));
 });
}
test('inactive roster, inactive enrolled mapping and removed subject independently revoke every row and content RPC',async()=>{
 for(const change of ["UPDATE tenant_agents SET is_active=false WHERE id='"+A.id+"'","UPDATE enrolled_agents SET is_active=false WHERE clerk_user_id='"+A.clerk_user_id+"'","DELETE FROM availability_agent_subjects WHERE clerk_user_id='"+A.clerk_user_id+"'"]){
  await pg.exec('RESET ROLE');
  const mapping=(await q('SELECT * FROM availability_agent_subjects WHERE clerk_user_id=$1',[A.clerk_user_id]))[0];
  await pg.exec(change);await as(A.clerk_user_id);
  for(const table of [...actualTables().filter(n=>!n.includes('.')&&!publicReferences.includes(n)&&!['cms_plans_py2026','ghl_sync_log'].includes(n)),'storage.objects'])await zero(table,table==='contacts'?'id':'*');
  await denied(q("SELECT create_workspace_record('contacts','{}')"));
  await denied(q('SELECT deployment_timezone()'));
  await pg.exec('RESET ROLE');await q('UPDATE tenant_agents SET is_active=true WHERE id=$1',[A.id]);await q('UPDATE enrolled_agents SET is_active=true WHERE clerk_user_id=$1',[A.clerk_user_id]);
  await q('INSERT INTO availability_agent_subjects(agent_slug,tenant_id,clerk_org_id,clerk_user_id,is_active) VALUES($1,$2,$3,$4,true) ON CONFLICT(agent_slug) DO UPDATE SET is_active=true',[mapping.agent_slug,mapping.tenant_id,mapping.clerk_org_id,mapping.clerk_user_id]);
 }
});
test('ordinary active agent: own calls, evidence, notes and assigned CRM; no peer PII or intakes',async()=>{
 await as(A.clerk_user_id);
 assert.deepEqual((await q('SELECT id FROM call_records')).map(r=>r.id),[own]);
 assert.deepEqual((await q('SELECT call_record_id AS id FROM v_daily_activity')).map(r=>r.id),[own]);
 for(const table of ['call_transcripts','transcript_chunks','compliance_flags','section_scores','contact_notes','messages','message_media'])assert.equal((await q('SELECT * FROM '+table)).length,1,table);
 assert.deepEqual((await q('SELECT id FROM contacts')).map(r=>r.id),[ca]);
 assert.equal((await q('SELECT * FROM training_completions')).length,1);
 assert.equal((await q('SELECT * FROM sales_log')).length,1);
 assert.equal((await q('SELECT * FROM search_transcript_chunks($1::vector,5,NULL,NULL,NULL,NULL,0.7)',[embedding])).length,1);
 assert.equal((await q('SELECT * FROM search_transcript_chunks($1::vector,0.7::double precision,5)',[embedding])).length,1);
 await denied(q('SELECT first_name FROM contacts'));
 await denied(q('SELECT pii_encrypted FROM contacts'));
 assert.equal((await q('SELECT decrypt_pii($1,$2) result',[ca,A.id]))[0].result.first_name,'Private');
 await denied(q('SELECT decrypt_pii($1,$2)',[cb,A.id]));
 await denied(q('SELECT decrypt_pii($1,$2)',[ca,B.id]));
 assert.equal((await q('SELECT * FROM read_contact_details($1,$2)',[[ca,cb],A.id])).length,1);
 assert.equal((await q('SELECT * FROM storage.objects')).length,1);
 assert.equal((await q("UPDATE contact_notes SET body='Owned edit' RETURNING id")).length,1);
 await zero('enrollment_intakes');await zero('vendor_controls');await zero('vendor_control_audit');
 await denied(q("SELECT set_vendor_pause($1,true,'forged')",[T]));
});
test('direct contact, PII, opportunity, tag and follow-up RPCs use protected actors and assigned resources',async()=>{
 await as(A.clerk_user_id);
 assert.equal((await q('SELECT * FROM read_opportunities($1,$2)',[T,A.id])).length,1);
 const tags=(await q('SELECT read_contact_tags($1,$2,$3) r',[T,A.id,[ca,cb]]))[0].r;
 assert.equal(tags.length,1);assert.equal(tags[0].contact_id,ca);
 for(const [sql,args] of [
  ['SELECT move_opportunity_stage($1,$2,$3,$2)',[uuid(111),uuid(101),A.id]],
  ['SELECT move_opportunity_stage($1,$2,$3,$2)',[uuid(112),uuid(101),A.id]],
  ['SELECT delete_opportunity($1,$2,now())',[uuid(111),A.id]],
  ['SELECT remove_contact_tag($1,$2)',[uuid(121),A.id]],
  ["SELECT add_contact_tag($1,$2,$3,'forged')",[T,cb,A.id]],
  ['SELECT save_follow_up($1,$2,$3,now())',[T,A.id,cb]],
  ["SELECT log_pii_access($1,$2,'export')",[cb,A.id]],
  ["SELECT update_pii_field($1,$2,'ssn','forged')",[cb,A.id]]
 ])await denied(q(sql,args));
 assert.equal((await q('SELECT * FROM match_contacts_by_phone($1,$2)',[['+12025550012'],A.id])).length,0);
 await denied(q("SELECT decrypt_pii_value('{}')"));
 const fields={contact_id:cb,assigned_agent_id:A.id,pipeline_id:uuid(100),stage_id:uuid(101),title:'forged',line_of_business:'MA'};
 await denied(q('SELECT save_opportunity($1,$2,$3)',[T,A.id,JSON.stringify(fields)]));
 fields.contact_id=ca;
 assert.ok((await q('SELECT save_opportunity($1,$2,$3) id',[T,A.id,JSON.stringify(fields)]))[0].id);
 assert.ok((await q('SELECT save_follow_up($1,$2,$3,now()) id',[T,A.id,ca]))[0].id);
});
test('protected principal sees agency evidence and assigned contacts, protected manager sees only approved team evidence',async()=>{
 await as(D.clerk_user_id);
 assert.equal((await q('SELECT id FROM call_records')).length,2);
 assert.equal((await q('SELECT id FROM contacts')).length,2);
 assert.equal((await q('SELECT * FROM call_transcripts')).length,2);
 await denied(q('UPDATE tenant_agents SET role=\'admin\''));
 await denied(q('SELECT save_opportunity_pipeline(NULL,NULL,NULL,NULL,NULL,NULL)'));
 await as(M.clerk_user_id);
 assert.deepEqual((await q('SELECT id FROM call_records')).map(r=>r.id),[other]);
 assert.equal((await q('SELECT * FROM call_transcripts')).length,1);
 assert.equal((await q("UPDATE call_records SET call_outcome='not_interested' RETURNING id")).length,0);
 await zero('contacts','id');
 await denied(q('SELECT decrypt_pii($1,$2)',[cb,M.id]));
});
test('all escalation paths fail: table/column grants, roster role, mapping, org, headers, provisioning',async()=>{
 await as(A.clerk_user_id);
 for(const query of ["UPDATE tenant_agents SET role='admin'","UPDATE tenant_agents SET clerk_user_id='attacker'","UPDATE tenant_agents SET tenant_id='"+U+"'","UPDATE tenants SET clerk_org_id='org_evil'","UPDATE enrolled_agents SET role='principal'","INSERT INTO availability_agent_subjects(agent_slug) VALUES('evil')","INSERT INTO recording_agent_subjects(agent_slug) VALUES('evil')","INSERT INTO deployment_authorities VALUES('"+T+"','"+A.clerk_user_id+"','admin','{}')","UPDATE contacts SET assigned_agent_id='"+A.agent_slug+"'","UPDATE call_records SET agent_id='"+agents[0].id+"'"] )await denied(q(query));
 await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-org-role':'admin','x-clerk-user-id':D.clerk_user_id,'x-enrollgen-features':'{"GHL_ENABLED":true}',role:'service_role'})]);
 assert.equal((await q('SELECT id FROM call_records')).length,1);
 await denied(q('SELECT deployment_feature_enabled(\'GHL_ENABLED\')'));
 await denied(q('SELECT * FROM resolve_deployment_subject($1,NULL)',[D.clerk_user_id]));
 await denied(q("SELECT create_workspace_record('contacts',$1)",[JSON.stringify({tenant_id:U,role:'admin',actor:D.clerk_user_id})]));
});
test('owned creates derive tenant and actor, cannot link peer resources, preserve column-protected content updates',async()=>{
 await as(A.clerk_user_id);
 const result=(await q("SELECT create_workspace_record('contacts',$1) r",[JSON.stringify({first_name:'New',phone:'+12025550999'})]))[0].r;
 assert.equal(result.tenant_id,T);assert.equal(result.assigned_agent_id,A.agent_slug);assert.equal(result.first_name,undefined);
 await denied(q("SELECT create_workspace_record('contact_notes',$1)",[JSON.stringify({contact_id:cb,body:'Forbidden'})]));
 const note=(await q("SELECT create_workspace_record('contact_notes',$1) r",[JSON.stringify({contact_id:ca,body:'Own note'})]))[0].r;
 assert.equal(note.agent_id,A.agent_slug);assert.equal(note.tenant_id,T);
 await denied(q("SELECT create_workspace_record('cross_sell_attempts',$1)",[JSON.stringify({session_id:sb,primary_product:'MA',cross_sell_product:'Dental'})]));
});
test('catalog: all public tables RLS; no broad browser policies; no browser grants on protected identity or mapping columns; every SD function pinned and allowlisted',async()=>{
 await pg.exec('RESET ROLE');
 const browserRpcs=new Set(['current_deployment_identity','is_current_tenant','deployment_timezone','deployment_is_admin','deployment_can_read_agent','deployment_can_access_contact','deployment_row_visible','deployment_row_writable','evidence_tenant_member','evidence_owns_agent','evidence_can_read_transcript','opportunities_is_tenant','follow_up_access','is_org_admin','decrypt_pii','search_contacts_secure','log_pii_access','match_contacts_by_phone','update_pii_field','read_contact_details','merge_contacts_secure','search_transcript_chunks','read_opportunities','save_opportunity','move_opportunity_stage','delete_opportunity','read_opportunity_sources','read_contact_tags','add_contact_tag','remove_contact_tag','save_follow_up','get_available_seps','get_counties_for_state','get_plans_for_county','get_county_plan_counts','match_cms_plans_py2027_area','normalize_phone_e164','ensure_opportunities_pipeline','create_workspace_record']);
 for(const r of await q("SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")){
  assert.equal((await q("SELECT has_function_privilege('anon',$1,'EXECUTE') ok",[r.oid]))[0].ok,false,r.proname);
  assert.equal((await q("SELECT has_function_privilege('authenticated',$1,'EXECUTE') ok",[r.oid]))[0].ok,browserRpcs.has(r.proname),r.proname);
 }
 assert.deepEqual(await q("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind IN ('r','p') AND NOT relrowsecurity"),[]);
 const policies=await q("SELECT * FROM pg_policies WHERE schemaname='public'");
 for(const p of policies){
  if(publicReferences.includes(p.tablename)){assert.equal(p.cmd,'SELECT');continue;} // reviewed public-reference allowlist above, no writes
  assert.doesNotMatch(p.qual||'',/^\(?\s*true\s*\)?$|auth\.role\(\).*authenticated|auth\.uid\(\) IS NOT NULL/i,p.tablename);
  assert.match(p.qual||'',/deployment_row_(visible|writable)/,p.tablename);
 }
 const protectedColumns=/^(id|tenant_id|clerk_.*|org.*|role|authority|team_agent_ids|agent_id|agent_slug|assigned_agent_id|writing_agent_id|created_by|owner_agent_id|subject)$/;
 for(const col of await q("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'"))for(const role of ['anon','authenticated'])for(const op of ['INSERT','UPDATE']){
  if(protectedColumns.test(col.column_name))assert.equal((await q('SELECT has_column_privilege($1,$2,$3,$4) ok',[role,'public.'+col.table_name,col.column_name,op]))[0].ok,false,`${role} ${op} ${col.table_name}.${col.column_name}`);
 }
 for(const routine of await q("SELECT p.oid::regprocedure::text name,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND prosecdef"))assert.ok(routine.proconfig?.some(c=>c.startsWith('search_path=')),routine.name);
 assert.deepEqual(await q("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='v' AND NOT coalesce(reloptions @> ARRAY['security_invoker=true'],false)"),[]);
});
test('150/151 survive: service-only provisioning, payload roles cannot promote, service pause works while browser vendor access stays revoked',async()=>{
 await as(A.clerk_user_id,'service_role');
 assert.equal((await q("SELECT deployment_feature_enabled('GHL_ENABLED') ok"))[0].ok,false);
 await q("SELECT set_vendor_pause($1,true,'verified-operator')",[T]);
 assert.equal((await q('SELECT vendor_pause FROM vendor_controls WHERE tenant_id=$1',[T]))[0].vendor_pause,true);
 await pg.exec('RESET ROLE');
 const before=(await q('SELECT role FROM enrolled_agents WHERE clerk_user_id=$1',[A.clerk_user_id]))[0].role;
 const {default:profile}=await import('./fixtures/deployment-profile.json',{with:{type:'json'}});
 await as(null,'service_role');
 await q('SELECT provision_deployment_roster($1,$2)',[JSON.stringify({...profile,tenantId:T}),JSON.stringify(fixtureRoster.map(a=>({...a,role:'principal'})))]);
 assert.equal((await q('SELECT role FROM enrolled_agents WHERE clerk_user_id=$1',[A.clerk_user_id]))[0].role,before);
 await as(A.clerk_user_id);await denied(q("UPDATE tenant_agents SET name='hacked'"));
});
