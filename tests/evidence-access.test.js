import { debugLog } from "../src/lib/debugLog.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import process from "node:process";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { evidenceDb } from "./helpers/evidenceDb.js";
import { createSessionHandler } from "../netlify/functions/evidence-session.js";
import { createTranscriptImportHandler } from "../netlify/functions/transcript-import.js";
import { createPostCallHandler } from "../netlify/functions/post-call.js";
import { createScoreCallHandler } from "../netlify/functions/score-call-background.js";
import { getEvidenceServiceClient, resolveEvidenceIdentity } from "../netlify/functions/_evidenceAccess.js";
import { createEvidenceSupabase } from "../src/lib/evidenceSupabase.js";
import { evidenceRequest } from "../src/lib/evidenceApi.js";

const tables = ["call_transcripts","transcript_chunks","sessions","compliance_flags","section_scores",
  "agents","enrolled_agents","agent_availability","agent_availability_log"];
const pg = new PGlite();
const sqlErrors = [];
const db = evidenceDb(pg,error=>sqlErrors.push(error));
const tenant = "00000000-0000-4000-8000-000000000001";
const otherTenant = "00000000-0000-4000-8000-000000000002";
const agent = "10000000-0000-4000-8000-000000000001";
const peer = "10000000-0000-4000-8000-000000000002";
const foreign = "10000000-0000-4000-8000-000000000003";
const legacy = "20000000-0000-4000-8000-000000000001";
const session = "30000000-0000-4000-8000-000000000001";
const peerSession = "30000000-0000-4000-8000-000000000002";
const foreignSession = "30000000-0000-4000-8000-000000000003";
const transcript = "40000000-0000-4000-8000-000000000001";
const peerTranscript = "40000000-0000-4000-8000-000000000002";
const foreignTranscript = "40000000-0000-4000-8000-000000000003";
const orphan = "40000000-0000-4000-8000-000000000004";
const inactive = "10000000-0000-4000-8000-000000000004";
const auth = { userId: "user-agent", orgId: "org-a", tokenPayload: { org_role: "org:member" } };
const query = async (sql, args = []) => (await pg.query(sql,args)).rows;
const role = async (name, sub = "user-agent") => {
  await pg.exec("RESET ROLE; SET ROLE " + name);
  await query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,role:name})]);
};
const bodyRequest = (body, method = "POST") => new Request("https://example.invalid/.netlify/functions/evidence", {
  method, headers: { "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
});
const handlers = identity => ({
  session: createSessionHandler({ authenticate: async () => identity, getDb: () => db }),
  postCall: createPostCallHandler({ authenticate: async () => identity, getDb: () => db }),
  import: createTranscriptImportHandler({ authenticate: async () => identity, getDb: () => db,
    embed: async chunks => chunks.map(() => Array(1536).fill(0)) }),
});
const call = async (handler, body, expected = 200, method) => {
  const response = await handler(bodyRequest(body, method), {});
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
};
const importForm = overrides => ({ agentId: agent, agentName: "Agent A", callDate: "2026-10-03", duration: "3:00",
  direction: "inbound", productLine: "MA", carrier: "Fixture Carrier", enrollmentPeriod: "AEP", disposition: "enrolled",
  sourceSystem: "manual", transcriptText: "Agent: This call is being recorded. My SSN is 123-45-6789.", ...overrides });
const snapshot = async () => {
  await role("postgres");
  const data = {};
  for (const table of tables) data[table] = await query("SELECT to_jsonb(t)-'owner_agent_id' AS row FROM " + table + " t ORDER BY id");
  return data;
};
let windowImport, windowCall, windowSession;
let preMigrationScoring;
const originalJobSecret = process.env.SCORE_CALL_JOB_SECRET;

before(async () => {
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE outsider;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role,outsider;
  `);
  await pg.exec(readFileSync(new URL("./fixtures/evidence-live-schema.sql",import.meta.url),"utf8"));
  const routing = readFileSync(new URL("../supabase/migrations/047_availability_feed.sql",import.meta.url),"utf8");
  await pg.exec(`CREATE TABLE telephony_presence_policy(singleton boolean PRIMARY KEY,enforced boolean);
    INSERT INTO telephony_presence_policy VALUES(true,true);`);
  await pg.exec(routing.slice(routing.indexOf("CREATE FUNCTION public.agent_phone_routable"),
    routing.indexOf("CREATE OR REPLACE FUNCTION public.claim_call_agent")));
  await pg.exec(`REVOKE ALL ON FUNCTION agent_phone_routable(text),agent_inbound_routable(text,text,boolean,text)
    FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION agent_phone_routable(text),agent_inbound_routable(text,text,boolean,text) TO service_role;`);
  // Scoring uses its real table definitions and the real classifier/scorer.
  const scoring = readFileSync(new URL("../supabase/migrations/001_compliance_engine.sql",import.meta.url),"utf8");
  for (const table of ["compliance_intents","scoring_templates","scoring_template_items","intent_detections",
    "compliance_scorecards","scorecard_items","corrective_actions","agent_compliance_profiles","phi_redactions"]) {
    const start = scoring.indexOf("CREATE TABLE IF NOT EXISTS " + table + " (");
    await pg.exec(scoring.slice(start, scoring.indexOf("\n);",start)+4));
  }
  await pg.exec(`ALTER TABLE compliance_scorecards ADD tenant_id uuid REFERENCES tenants;
    CREATE TABLE subscriptions(tenant_id uuid PRIMARY KEY,plan text,status text,seat_count integer);
    CREATE TABLE usage_records(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,record_type text,quantity integer,metadata jsonb);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT,UPDATE ON tenant_agents,call_records TO authenticated;
    INSERT INTO tenants(id,name,clerk_org_id) VALUES('${tenant}','A','org-a'),('${otherTenant}','B','org-b');
    INSERT INTO enrolled_agents(id,tenant_id,clerk_user_id,name,is_active) VALUES
      ('${agent}','${tenant}','user-agent','Agent A',true),('${peer}','${tenant}','user-peer','Agent B',true),
      ('${foreign}','${otherTenant}','user-foreign','Agent C',true),('${inactive}','${tenant}','user-inactive','Inactive',false);
    INSERT INTO tenant_agents(tenant_id,name,clerk_user_id,agent_slug,is_active,role) VALUES
      ('${tenant}','Agent A','user-agent','agent_a',true,'agent');
    INSERT INTO agents(id,name,agency) VALUES('${legacy}','Agent A','A');
    INSERT INTO sessions(id,agent_id,tenant_id,flow,product_line) VALUES
      ('${session}','${agent}','${tenant}','ma','MA'),('${peerSession}','${peer}','${tenant}','ma','MA'),
      ('${foreignSession}','${foreign}','${otherTenant}','ma','MA');
    INSERT INTO call_transcripts(id,tenant_id,agent_id,session_id,transcript_text,phi_scrubbed,product_line,source_system,call_date) VALUES
      ('${transcript}','${tenant}','${legacy}','${session}','own reference',true,'MA','manual',now()),
      ('${peerTranscript}','${tenant}','${legacy}','${peerSession}','peer reference',true,'MA','manual',now()),
      ('${foreignTranscript}','${otherTenant}','${legacy}','${foreignSession}','foreign reference',true,'MA','manual',now()),
      ('${orphan}','${tenant}','${legacy}',NULL,'unverifiable ownership',true,'MA','manual',now());
    INSERT INTO transcript_chunks(transcript_id,chunk_index,chunk_text,embedding) SELECT id,0,transcript_text,ARRAY[0,0]::vector FROM call_transcripts;
    INSERT INTO compliance_flags(session_id,section_label,level) SELECT id,'Opening','warn' FROM sessions;
    INSERT INTO section_scores(session_id,section_label,score,max_score) SELECT id,'Opening',1,2 FROM sessions;
    INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES('agent_a','Agent A','offline',false);
    INSERT INTO agent_availability_log(agent_id,agent_name,status,available) VALUES('agent_a','Agent A','offline',false);
    INSERT INTO subscriptions VALUES('${tenant}','internal','active',100);
    INSERT INTO scoring_templates(template_name,product_type,total_possible_points,passing_threshold,categories)
      VALUES('Fixture','MA',10,80,'{}');
    INSERT INTO compliance_intents(intent_code,intent_name,category,description)
      VALUES('CALL_OPEN_001_RECORDING_ANNOUNCE','Recording','CALL_OPENING','Announce recording');
    INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,display_order)
      SELECT t.id,i.id,'Recording announcement','CALL_OPENING',10,1 FROM scoring_templates t CROSS JOIN compliance_intents i;
  `);
});
after(async () => {
  if (originalJobSecret === undefined) delete process.env.SCORE_CALL_JOB_SECRET;
  else process.env.SCORE_CALL_JOB_SECRET = originalJobSecret;
  await pg.close();
});

test("compatible handlers work before 063, including imported ownership and checkpoint retries", async () => {
  await role("service_role");
  const h = handlers(auth);
  windowSession = (await call(h.session,{action:"start",flow:"ma"})).session_id;
  await call(h.session,{action:"flag",session_id:windowSession,section_label:"Opening",level:"warn",message:"Fixture"});
  await call(h.session,{action:"section",session_id:windowSession,section_label:"Opening",checklist_done:1,checklist_total:2});
  windowCall = await call(h.postCall,{action:"checkpoint",session_id:windowSession,transcript_text:"This call is recorded. SSN 123-45-6789.",product_type:"MA"});
  const retry = await call(h.postCall,{action:"checkpoint",session_id:windowSession,transcript_text:"Updated fixture transcript",product_type:"MA"});
  assert.equal(retry.transcript_id,windowCall.transcript_id);
  assert.equal(retry.call_record_id,windowCall.call_record_id);
  windowImport = await call(h.import,importForm());
  assert.equal(windowImport.chunksCreated,1);
  const row = (await query("SELECT * FROM call_transcripts WHERE id=$1",[windowImport.transcriptId]))[0];
  assert.ok(row.session_id); assert.ok(!row.transcript_text.includes("123-45-6789"));
  await call(h.session,{action:"end",session_id:windowSession,completed:true,final_section:2,duration_seconds:180});
  assert.equal((await call(h.session,null,200,"GET")).sessions.some(row=>row.id===windowSession),true);
});

test("072 scoring before 063 saves the long intent and complete evidence", async () => {
  await role("postgres");
  await pg.exec(readFileSync(new URL("../supabase/migrations/072_scoring_integrity.sql",import.meta.url),"utf8"));
  preMigrationScoring = await scoreFixtureCall();
});

test("063 applies over the captured drift without changing existing evidence rows", async () => {
  const before = await snapshot();
  await pg.exec(readFileSync(new URL("../supabase/migrations/063_evidence_access.sql",import.meta.url),"utf8"));
  assert.deepEqual(await snapshot(),before);
  const policies = await query("SELECT tablename,roles,cmd,qual FROM pg_policies WHERE tablename=ANY($1)",[tables]);
  assert.equal(policies.length,16);
  assert.equal(policies.some(row=>row.roles.includes("public")),false);
  assert.equal(policies.some(row=>row.roles.includes("anon")),false);
  assert.equal(policies.some(row=>row.roles.includes("authenticated") && row.cmd!=="SELECT"),false);
  const proof = await query(readFileSync(new URL("../supabase/validation/063_anon_grants.sql",import.meta.url),"utf8"));
  assert.equal(proof.length,9);
  assert.ok(proof.every(row=>row.table_present && !row.anon_has_table_privileges && !row.anon_has_column_privileges));
});

for (const table of tables) test("anon has no read/write or inherited PUBLIC access: " + table, async () => {
  for (const principal of ["anon","outsider"]) {
    await role(principal);
    for (const sql of ["SELECT * FROM "+table, "INSERT INTO "+table+" DEFAULT VALUES",
      "UPDATE "+table+" SET id=id", "DELETE FROM "+table, "TRUNCATE "+table+" CASCADE"]) {
      await assert.rejects(()=>query(sql),/permission denied/);
    }
  }
  await role("postgres");
  for (const permission of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER","MAINTAIN"]) {
    assert.equal((await query("SELECT has_table_privilege('anon',$1,$2) AS allowed",[table,permission]))[0].allowed,false);
  }
  assert.equal((await query("SELECT has_any_column_privilege('anon',$1,'SELECT,INSERT,UPDATE,REFERENCES') AS allowed",[table]))[0].allowed,false);
});

test("signed-in agent reads own evidence and tenant roster, excludes peers, other tenants, and orphan imports", async () => {
  await role("authenticated");
  const ids = async table => (await query("SELECT id FROM "+table)).map(row=>row.id);
  const transcripts = await ids("call_transcripts");
  for (const own of [transcript,windowImport.transcriptId,windowCall.transcript_id]) assert.ok(transcripts.includes(own));
  for (const hidden of [peerTranscript,foreignTranscript,orphan]) assert.ok(!transcripts.includes(hidden));
  assert.ok((await ids("sessions")).includes(session));
  assert.ok(!(await ids("sessions")).includes(peerSession));
  for (const table of ["compliance_flags","section_scores"]) {
    const sessions = (await query("SELECT session_id FROM "+table)).map(row=>row.session_id);
    assert.ok(sessions.includes(session)); assert.ok(!sessions.includes(peerSession)); assert.ok(!sessions.includes(foreignSession));
  }
  assert.ok((await ids("enrolled_agents")).includes(peer));
  assert.ok(!(await ids("enrolled_agents")).includes(foreign));
  assert.deepEqual(await query("SELECT id,name FROM agents"),[{id:legacy,name:"Agent A"}]);
  await assert.rejects(()=>query("SELECT * FROM agents"),/permission denied/);
  for (const table of tables) {
    await assert.rejects(()=>query("INSERT INTO "+table+" DEFAULT VALUES"),/permission denied/);
    await assert.rejects(()=>query("UPDATE "+table+" SET id=id"),/permission denied/);
    await assert.rejects(()=>query("DELETE FROM "+table),/permission denied/);
  }
  for (const table of ["agent_availability","agent_availability_log"]) await assert.rejects(()=>query("SELECT * FROM "+table),/permission denied/);
});

test("both search RPCs enforce RLS and deny anonymous EXECUTE; Co-Pilot includes only readable metadata", async () => {
  await role("authenticated");
  const first = await query("SELECT * FROM search_transcript_chunks(ARRAY[0,0]::vector,0.7::double precision,100)");
  const second = await query("SELECT * FROM search_transcript_chunks(ARRAY[0,0]::vector,100,NULL,NULL,NULL,NULL,0.7)");
  for (const rows of [first,second]) {
    assert.ok(rows.some(row=>row.transcript_id===transcript));
    assert.ok(rows.every(row=>![peerTranscript,foreignTranscript,orphan].includes(row.transcript_id)));
  }
  const source = readFileSync(new URL("../src/lib/transcriptSearch.js",import.meta.url),"utf8")
    .replace(/^import .*;\n/gm,"").replace("export async function","async function");
  const context = vm.createContext({ debugLog, getEvidenceSupabase:()=>db, getQueryEmbedding:async()=>[0,0], console });
  vm.runInContext(source+";globalThis.run=fetchTranscriptReferences",context);
  const references = await context.run({getToken:async()=>"fixture-jwt",query:"recording",matchCount:100});
  assert.equal(references.error,null); assert.ok(references.contextBlock.includes("[R"));
  assert.ok(references.results.some(row=>row.transcript_id===transcript && row.agent_name==="Agent A"));
  assert.ok(references.results.every(row=>![peerTranscript,foreignTranscript,orphan].includes(row.transcript_id)));
  await role("anon");
  for (const sql of ["SELECT * FROM search_transcript_chunks(ARRAY[0,0]::vector,0.7::double precision,100)",
    "SELECT * FROM search_transcript_chunks(ARRAY[0,0]::vector,100,NULL,NULL,NULL,NULL,0.7)"]) {
    await assert.rejects(()=>query(sql),/permission denied/);
  }
});

test("empty, unknown, and inactive JWT subjects cannot read evidence", async () => {
  for (const sub of ["","user-unknown","user-inactive"]) {
    await role("authenticated",sub);
    for (const table of ["call_transcripts","transcript_chunks","sessions","compliance_flags","section_scores","enrolled_agents"]) {
      assert.equal((await query("SELECT id FROM "+table)).length,0);
    }
  }
});

test("mutable CRM membership/record claims cannot authorize an evidence read or membership change", async () => {
  await role("authenticated");
  await query("UPDATE tenant_agents SET role='admin',clerk_user_id='user-agent'");
  await assert.rejects(()=>query("UPDATE enrolled_agents SET clerk_user_id='user-agent' WHERE id=$1",[peer]),/permission denied/);
  assert.equal((await query("SELECT id FROM call_transcripts WHERE id=ANY($1)",[[peerTranscript,foreignTranscript,orphan]])).length,0);
  await role("service_role");
  const h = handlers(auth);
  await call(h.import,importForm({agentId:peer,agentName:"Agent B"}),403);
  await query("UPDATE tenant_agents SET role='agent'");
});

test("post-063 session, flag, score, history, diagnostic, checkpoint and finalization use service writes", async () => {
  await role("service_role");
  const h = handlers(auth);
  const created = await call(h.session,{action:"start",flow:"ma"});
  await call(h.session,{action:"flag",session_id:created.session_id,section_label:"Opening",level:"critical",confidence:99});
  await call(h.session,{action:"section",session_id:created.session_id,section_label:"Opening",section_number:1,completed:true,
    duration_seconds:12,checklist_done:2,checklist_total:3});
  const checkpoint = await call(h.postCall,{action:"checkpoint",session_id:created.session_id,transcript_text:"This call is recorded.",product_type:"MA"});
  const finalized = await call(h.postCall,{action:"finalize",session_id:created.session_id,transcript_text:"Final recorded call.",call_duration_seconds:180});
  assert.equal(finalized.transcript_id,checkpoint.transcript_id);
  const saved = (await query("SELECT * FROM call_transcripts WHERE id=$1",[checkpoint.transcript_id]))[0];
  assert.equal(saved.owner_agent_id,agent);
  assert.equal(saved.transcript_text,"Final recorded call.");
  assert.equal((await query("SELECT count(*)::integer AS n FROM call_transcripts WHERE session_id=$1",[created.session_id]))[0].n,1);
  await call(h.session,{action:"end",session_id:created.session_id,completed:true,final_section:2,duration_seconds:180});
  const history = await call(h.session,null,200,"GET");
  const row = history.sessions.find(row=>row.id===created.session_id);
  assert.equal(row.completed,true); assert.equal(row.compliance_flags[0].count,1); assert.equal(row.section_scores[0].count,1);
  assert.ok(history.sessions.every(row=>row.id!==peerSession && row.id!==foreignSession));
  const score = (await query("SELECT * FROM section_scores WHERE session_id=$1",[created.session_id]))[0];
  assert.equal(score.score,2); assert.equal(score.max_score,3);
  assert.deepEqual(JSON.parse(score.notes),{section_number:1,completed:true,duration_seconds:12});
  const response = await h.session(new Request("https://example.invalid/?diagnostic=1"));
  assert.deepEqual(await response.json(),{ready:true});
});

test("server handlers deny absent auth, forged identities, cross-agent IDs and transcript substitution before writes", async () => {
  await role("service_role");
  const h = handlers(auth);
  const before = await snapshot(); await role("service_role");
  for (const action of ["end","flag","section"]) await call(h.session,{action,session_id:peerSession,section_label:"Opening",level:"warn"},403);
  await call(h.session,{action:"start",flow:"ma",agent_id:peer},400);
  await call(h.postCall,{action:"checkpoint",session_id:peerSession,transcript_text:"overwrite"},403);
  await call(h.postCall,{action:"checkpoint",session_id:session,transcript_id:peerTranscript,transcript_text:"overwrite"},403);
  await call(h.postCall,{action:"checkpoint",session_id:session,agent_id:peer},403);
  await call(h.postCall,{action:"checkpoint",session_id:session,tenant_id:otherTenant},403);
  await call(h.postCall,{action:"checkpoint",session_id:session,call_record_id:windowCall.call_record_id},403);
  // CRM writes are outside 063 and still mutable. Even a caller who forges
  // its call-record transcript pointer cannot make the service adopt evidence.
  await role("authenticated");
  await query("UPDATE call_records SET transcript_id=$1 WHERE id=$2",[peerTranscript,windowCall.call_record_id]);
  await role("service_role");
  await call(h.postCall,{action:"checkpoint",session_id:windowSession,transcript_text:"overwrite"},403);
  await query("UPDATE call_records SET transcript_id=$1 WHERE id=$2",[windowCall.transcript_id,windowCall.call_record_id]);
  for (const name of ["session","postCall","import"]) {
    await call(handlers({response:new Response('{"error":"Unauthorized"}',{status:401})})[name],{action:"start",flow:"ma"},401);
  }
  await call(handlers({userId:"dev-bypass",orgId:null}).session,{action:"start",flow:"ma"},401);
  assert.deepEqual(await snapshot(),before);
});

test("service import accepts own/admin target, rejects foreign IDs and unverified roster-admin escalation", async () => {
  await role("service_role");
  const h = handlers(auth);
  const imported = await call(h.import,importForm());
  assert.equal((await query("SELECT owner_agent_id FROM call_transcripts WHERE id=$1",[imported.transcriptId]))[0].owner_agent_id,agent);
  const roster = await call(h.import,null,200,"GET");
  assert.deepEqual(roster.agents,[{id:agent,name:"Agent A"}]);
  await call(h.import,importForm({agentId:peer,agentName:"Agent B"}),403);
  await call(h.import,importForm({agentId:foreign,agentName:"Agent C"}),403);
  await call(h.import,importForm({agentName:"Agent B"}),400);
  const admin = handlers({...auth,tokenPayload:{org_role:"org:admin"}});
  const assigned = await call(admin.import,importForm({agentId:peer,agentName:"Agent B"}));
  assert.equal((await query("SELECT owner_agent_id FROM call_transcripts WHERE id=$1",[assigned.transcriptId]))[0].owner_agent_id,peer);
  await call(admin.import,importForm({agentId:foreign,agentName:"Agent C"}),403);
  await role("authenticated");
  assert.equal((await query("SELECT id FROM call_transcripts WHERE id=$1",[assigned.transcriptId])).length,0);
});

test("self provisioning needs a signed configured organization; inactive, duplicate and wrong-org identities fail closed", async () => {
  await role("service_role");
  await call(handlers({userId:"new-user",orgId:null}).session,{action:"start",flow:"ma"},403);
  await call(handlers({...auth,userId:"new-user",orgId:"org-unknown"}).session,{action:"start",flow:"ma"},403);
  await call(handlers({...auth,userId:"user-inactive"}).session,{action:"start",flow:"ma"},403);
  await call(handlers({...auth,orgId:"org-b"}).session,{action:"start",flow:"ma"},403);
  const provisioned = await call(handlers({...auth,userId:"new-user",tokenPayload:{name:"New Agent"}}).session,{action:"start",flow:"ma"});
  const row = (await query("SELECT * FROM enrolled_agents WHERE id=$1",[provisioned.agent_id]))[0];
  assert.equal(row.clerk_user_id,"new-user"); assert.equal(row.tenant_id,tenant); assert.equal(row.role,"agent");
  const duplicate = (await query("INSERT INTO enrolled_agents(clerk_user_id,name,tenant_id) VALUES('user-agent','Duplicate',$1) RETURNING id",[tenant]))[0];
  await assert.rejects(()=>resolveEvidenceIdentity(db,auth),/ambiguous/);
  await query("DELETE FROM enrolled_agents WHERE id=$1",[duplicate.id]); // fixture cleanup only
});

test("unrelated SQL errors do not trigger anonymous/ownership fallbacks or disclose submitted content", async () => {
  await role("service_role");
  const before = await snapshot(); await role("service_role");
  const invalidEmbeddings = createTranscriptImportHandler({authenticate:async()=>auth,getDb:()=>db,embed:async()=>[[1]]});
  await call(invalidEmbeddings,importForm(),503);
  assert.deepEqual(await snapshot(),before); await role("service_role");
  const unavailable = createSessionHandler({authenticate:async()=>auth,getDb:()=>{throw new Error("secret fixture transcript");}});
  const response = await unavailable(bodyRequest({action:"start",flow:"ma"}));
  assert.equal(response.status,503); assert.ok(!(await response.text()).includes("secret fixture transcript"));
  assert.throws(()=>getEvidenceServiceClient({SUPABASE_URL:"https://example.invalid",SUPABASE_ANON_KEY:"anon"}),/not configured/);
});

async function scoreFixtureCall() {
  await role("service_role");
  await query("UPDATE call_records SET call_duration_seconds=180,transcript_raw='This call is recorded.',transcript_diarized='[]' WHERE id=$1",[windowCall.call_record_id]);
  process.env.SCORE_CALL_JOB_SECRET = "fixture-only-job-secret";
  const firstError = sqlErrors.length;
  const priorScores = (await query("SELECT count(*)::int AS n FROM scoring_jobs WHERE call_id=$1 AND status='complete'",[windowCall.call_record_id]))[0].n;
  let llmCalls = 0;
  const scoring = createScoreCallHandler({getDb:()=>db,classify:async()=> {
    llmCalls++;
    return { detections:[{intent_code:"CALL_OPEN_001_RECORDING_ANNOUNCE",detected:true,confidence:0.99,speaker:"agent",
      evidence_text:"This call is recorded.",sequence_position:1}],risk_indicators:[],sentiment:{agent:"neutral",beneficiary:"neutral"} };
  }});
  assert.equal((await scoring(bodyRequest({callId:windowCall.call_record_id,tenantId:tenant}))).status,401);
  await scoring(new Request("https://example.invalid", {method:"POST",headers:{"x-enrollgen-job-secret":"fixture-only-job-secret"},
    body:JSON.stringify({callId:windowCall.call_record_id,tenantId:tenant})}),{});
  if (priorScores) assert.equal(llmCalls,0);
  else assert.ok(llmCalls>0);
  const record = (await query("SELECT * FROM call_records WHERE id=$1",[windowCall.call_record_id]))[0];
  assert.equal(record.metadata.scoring_status,"complete");
  assert.ok(record.compliance_scorecard_id);
  const score = (await query("SELECT * FROM compliance_scorecards WHERE id=$1",[record.compliance_scorecard_id]))[0];
  assert.equal(Number(score.overall_score),100); assert.equal(score.pass_fail,"PASS");
  assert.equal((await query("SELECT count(*)::integer AS n FROM scorecard_items WHERE scorecard_id=$1",[score.id]))[0].n,1);
  const detections = (await query("SELECT id FROM intent_detections WHERE call_id=$1",[record.id])).length;
  const errors = sqlErrors.slice(firstError);
  assert.ok(detections > 0);
  assert.deepEqual(errors, []);
  assert.equal((await query("SELECT count(*)::integer AS n FROM compliance_scorecards WHERE call_id=$1 AND transcript_revision IS NOT NULL",[record.id]))[0].n,1);
  return { overallScore:Number(score.overall_score),passFail:score.pass_fail,scoringStatus:record.metadata.scoring_status,
    detections,errorCodes:errors.map(error=>error.code) };
}

test("service scoring stays intact after 063 and repeats reuse the 072 versioned result", async () => {
  assert.deepEqual(await scoreFixtureCall(),preMigrationScoring);
});

test("current service-key availability toggle, logging, heartbeat, claim/retry/release and expiry survive 063", async () => {
  await role("service_role");
  const phone = "50000000-0000-4000-8000-000000000001";
  await query("SELECT update_agent_phone_session('agent_a',$1,true)",[phone]);
  await query("UPDATE agent_availability SET status='available',available=true WHERE agent_id='agent_a'");
  assert.equal((await query("SELECT status FROM agent_availability WHERE agent_id='agent_a'"))[0].status,"available");
  assert.ok((await query("SELECT id FROM agent_availability_log WHERE status='available'")).length>0);
  const claim = await query("SELECT * FROM claim_call_agent('fixture-call',ARRAY[]::text[],NULL)");
  assert.equal(claim[0].agent_id,"agent_a");
  assert.deepEqual(await query("SELECT * FROM claim_call_agent('fixture-call',ARRAY[]::text[],NULL)"),claim);
  await query("UPDATE agent_availability SET status='available',available=true WHERE agent_id='agent_a'");
  assert.equal((await query("SELECT status FROM agent_availability WHERE agent_id='agent_a'"))[0].status,"busy");
  assert.equal((await query("SELECT release_call_agent('fixture-call') AS released"))[0].released,true);
  assert.equal((await query("SELECT status FROM agent_availability WHERE agent_id='agent_a'"))[0].status,"available");
  await query("UPDATE agent_phone_sessions SET expires_at=now()-interval '1 minute'");
  await query("SELECT expire_agent_phone_sessions()");
  assert.equal((await query("SELECT status FROM agent_availability WHERE agent_id='agent_a'"))[0].status,"offline");
  await role("anon");
  await assert.rejects(()=>query("SELECT release_call_agent('fixture-call')"),/permission denied/);
});

test("browser clients refresh subject tokens per request and never send an anon bearer after sign-out", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  let token = "signed-agent-a";
  let templates = 0;
  globalThis.fetch = async (url, options) => {
    sent.push(new Headers(options.headers).get("authorization"));
    return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
  };
  try {
    const client = createEvidenceSupabase(async options=>{assert.equal(options.template,"supabase");templates++;return token;},
      "https://example.invalid","anon-fixture");
    assert.equal((await client.from("call_transcripts").select("id")).error,null);
    token = "signed-agent-b";
    assert.equal((await client.from("call_transcripts").select("id")).error,null);
    token = null;
    assert.match((await client.from("call_transcripts").select("id")).error.message,/Sign in/);
    token = "anon-fixture";
    assert.match((await client.from("call_transcripts").select("id")).error.message,/Sign in/);
    assert.deepEqual(sent,["Bearer signed-agent-a","Bearer signed-agent-b"]); assert.ok(templates>=4);
    await assert.rejects(()=>evidenceRequest(async()=>null,"evidence-session"),/Sign in/);
    assert.equal(sent.length,2);
  } finally { globalThis.fetch = originalFetch; }
});

test("explicit transcript owner takes precedence and tenant-mismatched session links remain hidden", async () => {
  await role("service_role");
  await query("UPDATE call_transcripts SET owner_agent_id=$1 WHERE id=$2",[peer,transcript]);
  await role("authenticated");
  assert.equal((await query("SELECT id FROM call_transcripts WHERE id=$1",[transcript])).length,0);
  await role("service_role");
  await query("UPDATE call_transcripts SET owner_agent_id=NULL,tenant_id=$1 WHERE id=$2",[otherTenant,transcript]);
  await role("authenticated");
  assert.equal((await query("SELECT id FROM call_transcripts WHERE id=$1",[transcript])).length,0);
  await role("service_role");
  await query("UPDATE call_transcripts SET tenant_id=$1 WHERE id=$2",[tenant,transcript]);
});

test("session hook waits for server ownership before flags/checkpoints and retains session on a failed end", async () => {
  let finishStart;
  const start = new Promise(resolve=>{finishStart=resolve;});
  const calls = [];
  let failEnd = true;
  const source = readFileSync(new URL("../src/hooks/useSessionTracker.js",import.meta.url),"utf8")
    .replace(/^import .*;\n/gm,"").replaceAll('import.meta.env.VITE_DISABLE_CLERK_AUTH === "true"',"false")
    .replaceAll("import.meta.env.DEV","false").replace(/^export /gm,"");
  const context = vm.createContext({ debugLog,
    useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:()=>{},
    useAppAuth:()=>({getToken:async()=>"fixture-clerk-session"}),runSessionTrackingDiagnostic:()=>{},
    evidenceRequest:async (_token,endpoint,body)=>{
      calls.push({endpoint,body});
      if (body.action==="start") { await start; return {session_id:session,agent_id:agent,agent_name:"Agent A"}; }
      if (body.action==="end" && failEnd) throw Error("Fixture service failure");
      return {ok:true};
    },console:{error:()=>{}},setTimeout,
  });
  vm.runInContext(source+";globalThis.tracker=useSessionTracker();globalThis.metadata=getActiveSessionMetadata;globalThis.wait=waitForActiveSessionMetadata",context);
  const tracker = context.tracker;
  const starting = tracker.startSession("ma");
  const flag = tracker.logComplianceFlag("Opening","warn","fixture",80,"Check disclosure");
  const section = tracker.logSectionScore(1,"Opening",true,10,2,1);
  const metadata = context.wait();
  assert.equal(calls.length,1);
  finishStart(); await starting; await flag; await section;
  assert.equal((await metadata).sessionId,session);
  assert.ok(calls.every(call=>call.body.action==="start" || call.body.session_id===session));
  assert.ok(calls.every(call=>!call.body.agent_id && !call.body.tenant_id));
  await tracker.endSession(2,true); assert.equal(context.metadata().sessionId,session);
  failEnd = false;
  await tracker.endSession(2,true); assert.equal(context.metadata().sessionId,null);
});


test("browser finalization preserves server-owned transcript while wrap-up remains editable", async () => {
  await role("service_role");
  const h = handlers(auth);
  const created = await call(h.session,{action:"start",flow:"ma"});
  const saved = await call(h.postCall,{action:"checkpoint",session_id:created.session_id,transcript_text:"Server complete transcript"});
  await query("UPDATE call_records SET metadata=metadata || '{\"transcript_source\":\"deepgram_server\"}'::jsonb WHERE id=$1",[saved.call_record_id]);
  const final = await call(h.postCall,{action:"finalize",session_id:created.session_id,transcript_text:"Browser partial"});
  assert.equal(final.transcript_id,saved.transcript_id);
  assert.equal((await query("SELECT transcript_text FROM call_transcripts WHERE id=$1",[saved.transcript_id]))[0].transcript_text,"Server complete transcript");
  const wrap = await call(h.postCall,{action:"wrap_up",session_id:created.session_id,transcript_text:"Browser partial",
    call_outcome:"callback_scheduled",agent_notes:"Follow up tomorrow"});
  const row=(await query("SELECT * FROM call_records WHERE id=$1",[wrap.call_record_id]))[0];
  assert.equal(row.transcript_raw,"Server complete transcript");assert.equal(row.agent_notes,"Follow up tomorrow");
  assert.equal(row.call_outcome,"callback_scheduled");
});
