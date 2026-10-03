import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { AUTO_CREATE_OPPS_FROM_CALLS, filterOpportunities, sortOpportunities, persistStageMove, opportunityKeyboardCoordinates, money, daysInStage, opportunityStatus, readOpportunityMetadata } from '../src/lib/opportunities.js';

// Real PostgreSQL (including RLS, FKs, PL/pgSQL and pgcrypto), no live credentials.
// Only Supabase's Vault key source and JWT provider are represented by fixtures.
const db = new PGlite({ extensions: { pgcrypto } });
const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const agentA = '10000000-0000-4000-8000-000000000001';
const agentB = '10000000-0000-4000-8000-000000000002';
const contactA = '20000000-0000-4000-8000-000000000001';
const contactB = '20000000-0000-4000-8000-000000000002';
const callA = '30000000-0000-4000-8000-000000000001';
const sourceA = '60000000-0000-4000-8000-000000000001';
const sourceB = '60000000-0000-4000-8000-000000000002';
const archivedSourceA = '60000000-0000-4000-8000-000000000003';
let pipelineA, pipelineB, stagesA, stagesB, opportunityA, opportunityB;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const asUser = async (sub = 'user-a') => {
  await db.exec('SET ROLE authenticated');
  await query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: 'authenticated' })]);
};
const fields = (tenant, overrides = {}) => ({ contact_id: tenant === tenantA ? contactA : contactB,
  pipeline_id: tenant === tenantA ? pipelineA : pipelineB, stage_id: tenant === tenantA ? stagesA[0].id : stagesB[0].id,
  title: 'MA application', notes: 'Private application notes', line_of_business: 'MA', est_value: 125.50,
  assigned_agent_id: tenant === tenantA ? agentA : agentB, lead_source_id: tenant === tenantA ? sourceA : sourceB, ...overrides });
const save = async (tenant, agent, input) => (await query('SELECT public.save_opportunity($1,$2,$3) AS id', [tenant, agent, input]))[0].id;
const move = async (id, destination, expected, agent = agentA) => (await query('SELECT public.move_opportunity_stage($1,$2,$3,$4) AS row', [id, destination, agent, expected]))[0].row;
const expectFailure = async (work, pattern) => {
  await db.exec('SAVEPOINT expected_failure');
  await assert.rejects(work, pattern);
  await db.exec('ROLLBACK TO SAVEPOINT expected_failure');
};

const quoteIdentifier = (name) => `"${name.replaceAll('"', '""')}"`;
// Thin Supabase-shaped adapter: every SELECT/RPC is executed by real PostgreSQL
// as the current role. There are no mocked permission or source-read results.
const authenticatedClient = {
  from(table) {
    let projection = '*';
    const filters = [], order = [], values = [];
    const chain = {
      select(columns) { projection = columns === '*' ? '*' : columns.split(',').map((column) => quoteIdentifier(column.trim())).join(','); return chain; },
      eq(column, value) { values.push(value); filters.push(`${quoteIdentifier(column)}=$${values.length}`); return chain; },
      order(column) { order.push(quoteIdentifier(column)); return chain; },
      then(resolve, reject) {
        const sql = `SELECT ${projection} FROM public.${quoteIdentifier(table)}${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''}${order.length ? ` ORDER BY ${order.join(',')}` : ''}`;
        return query(sql, values).then((data) => ({ data, error: null }), (error) => ({ data: null, error })).then(resolve, reject);
      },
    };
    return chain;
  },
  rpc(name, args) {
    const entries = Object.entries(args);
    const sql = `SELECT * FROM public.${quoteIdentifier(name)}(${entries.map(([key], index) => `${quoteIdentifier(key)}=>$${index + 1}`).join(',')})`;
    return query(sql, entries.map(([, value]) => value)).then((data) => ({ data, error: null }), (error) => ({ data: null, error }));
  },
};

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA vault; CREATE SCHEMA pii_vault;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE TABLE tenants(id uuid PRIMARY KEY, name text);
    CREATE TABLE tenant_agents(id uuid PRIMARY KEY,tenant_id uuid REFERENCES tenants, name text,role text,agent_slug text,clerk_user_id text,is_active boolean DEFAULT true,ghl_user_id text,npn text);
    CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid REFERENCES tenants,assigned_agent_id text,pii_encrypted jsonb,
      status text,source text,county text,state text,zip text,medicare_parts text,current_carrier text,current_plan text,mbi_last4 text,
      do_not_call boolean,ghl_contact_id text,first_initial text,last_initial text,phone_last4 text,email_set boolean,dob_set boolean,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid REFERENCES tenants,contact_id uuid REFERENCES contacts,call_start timestamptz,
      call_outcome text,product_type text,call_duration_seconds integer,transcript_raw text,transcript_diarized text,
      dg_sentiment jsonb,dg_intents jsonb,dg_topics jsonb,dg_summary jsonb,call_analytics jsonb,agent_assessment jsonb,beneficiary_risk jsonb,
      agent_notes text,carrier_name text,plan_name text,effective_date date);
    CREATE TABLE pii_access_log(id uuid DEFAULT gen_random_uuid(),contact_id uuid,agent_id uuid,clerk_user_id text,action text,ip_address text,user_agent text);
    CREATE TABLE vault.decrypted_secrets(id uuid PRIMARY KEY,decrypted_secret text);
    CREATE TABLE pii_vault.encryption_keys(key_id uuid PRIMARY KEY,vault_secret_id uuid,key_version integer,is_active boolean,created_at timestamptz DEFAULT now());
    INSERT INTO vault.decrypted_secrets VALUES('40000000-0000-4000-8000-000000000001','test-only-vault-secret');
    INSERT INTO pii_vault.encryption_keys VALUES('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,true,now());
    INSERT INTO tenants VALUES('${tenantA}','A'),('${tenantB}','B');
    INSERT INTO tenant_agents(id,tenant_id,name,role,agent_slug,clerk_user_id) VALUES('${agentA}','${tenantA}','Agent A','admin','agent_a','user-a'),('${agentB}','${tenantB}','Agent B','admin','agent_b','user-b');
    -- Production catalog: existing CRM reads are broad, but lead_sources
    -- is service-only. Never grant the authenticated fixture source access.
    GRANT SELECT ON tenants,tenant_agents,contacts,call_records TO authenticated;
  `);
  const integrations = readFileSync(new URL('../supabase/migrations/048_vendor_integrations.sql', import.meta.url), 'utf8');
  // Use the real source schema (including credentials/configuration), without
  // executing any integration workers, triggers or other vendor objects.
  await db.exec(integrations.slice(integrations.indexOf('CREATE TABLE public.lead_sources ('), integrations.indexOf('CREATE UNIQUE INDEX lead_source_number')));
  await db.exec(`ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON lead_sources FROM PUBLIC,anon,authenticated;
    GRANT ALL ON lead_sources TO service_role;
    INSERT INTO lead_sources(id,tenant_id,name,type,active,ping_key_hash,postback_url,postback_secret,postback_field_map,report_emails,twilio_number,external_id) VALUES
      ('${sourceA}','${tenantA}','Paragon Media','publisher',true,'test-only-hash-a','https://example.invalid/postback','test-only-secret-a','{"field":"private-config"}',ARRAY['test@example.invalid'],'+12025550100','test-external-a'),
      ('${sourceB}','${tenantB}','Other tenant source','publisher',true,'test-only-hash-b','https://example.invalid/other','test-only-secret-b','{}',ARRAY['other@example.invalid'],'+12025550101','test-external-b'),
      ('${archivedSourceA}','${tenantA}','Archived source','direct',false,NULL,NULL,NULL,NULL,'{}',NULL,NULL);`);
  const pii = readFileSync(new URL('../supabase/migrations/022_pii_protection_phase1.sql', import.meta.url), 'utf8');
  await db.exec(pii.slice(pii.indexOf('CREATE OR REPLACE FUNCTION pii_vault.get_active_key()'), pii.indexOf('-- Blind-index HMAC key')));
  const details = readFileSync(new URL('../supabase/migrations/044_agent_contact_details.sql', import.meta.url), 'utf8');
  await db.exec(details.slice(details.indexOf('CREATE OR REPLACE FUNCTION public.decrypt_pii('), details.indexOf('CREATE OR REPLACE FUNCTION public.search_contacts_secure(')));
  await db.exec(details.slice(details.indexOf('CREATE OR REPLACE FUNCTION public.read_contact_details('), details.indexOf('COMMIT;')));
  await db.exec(`INSERT INTO contacts(id,tenant_id,assigned_agent_id,pii_encrypted) VALUES('${contactA}','${tenantA}','agent_a',jsonb_build_object('first_name',encrypt_pii_value('Ada'),'last_name',encrypt_pii_value('Lovelace'))),('${contactB}','${tenantB}','agent_b',jsonb_build_object('first_name',encrypt_pii_value('Other'),'last_name',encrypt_pii_value('Tenant')));
    INSERT INTO call_records(id,tenant_id,contact_id,call_start) VALUES('${callA}','${tenantA}','${contactA}',now());`);
  await db.exec(readFileSync(new URL('../supabase/migrations/058_opportunities_board.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/059_opportunity_contact_tags.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/061_opportunity_source_reader.sql', import.meta.url), 'utf8'));
  pipelineA = (await query('SELECT id FROM pipelines WHERE tenant_id=$1', [tenantA]))[0].id;
  pipelineB = (await query('SELECT id FROM pipelines WHERE tenant_id=$1', [tenantB]))[0].id;
  stagesA = await query('SELECT * FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position', [pipelineA]);
  stagesB = await query('SELECT * FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position', [pipelineB]);
  await asUser(); opportunityA = await save(tenantA, agentA, fields(tenantA));
  await asUser('user-b'); opportunityB = await save(tenantB, agentB, fields(tenantB));
  await move(opportunityB,stagesB[1].id,stagesB[0].id,agentB);
  await move(opportunityB,stagesB[0].id,stagesB[1].id,agentB);
  await db.exec('RESET ROLE');
});
beforeEach(async () => { await db.exec('BEGIN'); await asUser(); });
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
after(async () => { await db.close(); });

test('seeded stages have the requested editable dark-theme colors and outcome flags', () => {
  assert.deepEqual(stagesA.map((row) => [row.name,row.color,row.is_won,row.is_lost]), [
    ['New Lead','#a78bfa',false,false],['Contacted','#facc15',false,false],['Pending','#fb923c',false,false],['Enrolled','#4ade80',true,false],['Disenrolled','#f87171',false,true],
  ]);
  assert.equal(AUTO_CREATE_OPPS_FROM_CALLS, false);
});

test('authenticated board metadata loads with production-like grants while direct source reads stay denied', async () => {
  assert.equal((await query('SELECT current_user AS role'))[0].role,'authenticated');
  await expectFailure(() => query('SELECT id,name,active FROM lead_sources WHERE tenant_id=$1',[tenantA]),/permission denied/);
  const meta = await readOpportunityMetadata(authenticatedClient,tenantA,agentA);
  assert.deepEqual(meta.pipelines.map((row) => row.id),[pipelineA]);
  assert.deepEqual(meta.stages.map((row) => row.id),stagesA.map((row) => row.id));
  assert.deepEqual(meta.sources,[{id:archivedSourceA,name:'Archived source'},{id:sourceA,name:'Paragon Media'}]);
  assert.deepEqual(meta.activeSources,[{id:sourceA,name:'Paragon Media'}]);
  for (const source of [...meta.sources,...meta.activeSources]) assert.deepEqual(Object.keys(source).sort(),['id','name']);
  const rows = await query('SELECT read_opportunities($1,$2) AS row',[tenantA,agentA]);
  assert.equal(rows.length,1); assert.equal(rows[0].row.lead_source_id,sourceA);
  for (const column of ['*','id,name','ping_key_hash','postback_secret','postback_url','postback_field_map','report_emails','twilio_number']) {
    await expectFailure(() => query(`SELECT ${column} FROM lead_sources`),/permission denied/);
  }
});

test('source reader binds tenant and agent identity, denies anonymous callers, and preserves service access', async () => {
  await expectFailure(() => query('SELECT * FROM read_opportunity_sources($1,$2)',[tenantB,agentB]),/Access denied/);
  await expectFailure(() => query('SELECT * FROM read_opportunity_sources($1,$2)',[tenantA,agentB]),/Access denied/);
  await asUser('user-b');
  assert.deepEqual(await query('SELECT * FROM read_opportunity_sources($1,$2)',[tenantB,agentB]),[{id:sourceB,name:'Other tenant source'}]);
  await expectFailure(() => query('SELECT * FROM read_opportunity_sources($1,$2)',[tenantA,agentA]),/Access denied/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await expectFailure(() => query('SELECT * FROM read_opportunity_sources($1,$2)',[tenantA,agentA]),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role');
  const serviceRows = await query('SELECT postback_secret FROM lead_sources WHERE id=$1',[sourceA]);
  assert.equal(serviceRows[0].postback_secret,'test-only-secret-a');
});

test('remaining Opportunity contact, agent, call and timeline projections work as authenticated', async () => {
  const contactsHook = readFileSync(new URL('../src/hooks/useContacts.js', import.meta.url), 'utf8');
  const contactColumns = contactsHook.match(/const CONTACT_SAFE_COLUMNS =\s*"([^"]+)"/)[1];
  // Also exercise the intended stronger contact column boundary. The UI must
  // continue to use the audited detail reader, even if table grants narrow.
  await db.exec(`RESET ROLE; REVOKE SELECT ON contacts FROM authenticated;
    GRANT SELECT (${contactColumns}) ON contacts TO authenticated`);
  await asUser();
  assert.equal((await query(`SELECT ${contactColumns} FROM contacts WHERE tenant_id=$1`,[tenantA])).length,1);
  await expectFailure(() => query('SELECT pii_encrypted FROM contacts'),/permission denied/);
  const detail = (await query('SELECT * FROM read_contact_details($1,$2)',[[contactA],agentA]))[0];
  assert.equal(detail.fields.first_name,'Ada');
  assert.equal((await query('SELECT id,name,ghl_user_id,npn,clerk_user_id,agent_slug,role FROM tenant_agents WHERE tenant_id=$1 AND is_active',[tenantA])).length,1);
  // Read each actual call projection used by the picker and drawer; a later
  // frontend change cannot silently depend on a missing/locked call column.
  for (const file of ['OpportunityEditor.jsx','OpportunityDrawer.jsx']) {
    const source = readFileSync(new URL(`../src/components/opportunities/${file}`, import.meta.url), 'utf8');
    const projections = [...source.matchAll(/from\('call_records'\)\s*\.select\('([^']+)'\)/g)];
    assert.ok(projections.length > 0,`${file}: expected to exercise its actual call projections`);
    for (const match of projections) {
      assert.equal((await query(`SELECT ${match[1]} FROM call_records WHERE tenant_id=$1 AND contact_id=$2`,[tenantA,contactA])).length,1);
    }
  }
  assert.equal((await query('SELECT * FROM opportunity_stage_history WHERE tenant_id=$1',[tenantA])).length,1);
});

test('list display always has a valid status and numeric days, including incomplete rows and zero', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  assert.equal(daysInStage({ stage_entered_at: '2026-10-02T11:00:00Z' }, now), 0);
  assert.equal(daysInStage({ created_at: '2026-09-18T12:00:00Z' }, now), 14);
  assert.equal(daysInStage({}, now), 0);
  assert.equal(daysInStage({ stage_entered_at: 'invalid' }, now), 0);
  assert.equal(daysInStage({ stage_entered_at: '2026-10-03T12:00:00Z' }, now), 0);
  assert.equal(opportunityStatus({ status: '' }, stagesA[3]), 'won');
  assert.equal(opportunityStatus({}, stagesA[4]), 'lost');
  assert.equal(opportunityStatus({}, stagesA[0]), 'open');
  assert.equal(opportunityStatus({ status: 'open' }, stagesA[3]), 'open');
});

test('contact tags persist encrypted, deduplicate, and block cross-tenant reads and writes', async () => {
  const args = [tenantA,contactA,agentA,'Follow up'];
  const first = (await query('SELECT add_contact_tag($1,$2,$3,$4) AS tag',args))[0].tag;
  assert.equal(first.name,'Follow up'); assert.equal(first.contact_id,contactA);
  const duplicate = (await query('SELECT add_contact_tag($1,$2,$3,$4) AS tag',[...args.slice(0,3),'follow UP']))[0].tag;
  assert.equal(duplicate.id,first.id);
  const tags = (await query('SELECT read_contact_tags($1,$2,$3) AS tags',[tenantA,agentA,[contactA]]))[0].tags;
  assert.equal(tags.length,1); assert.equal(tags[0].name,'Follow up');
  await expectFailure(() => query('SELECT name_encrypted FROM contact_tags'),/permission denied/);
  await expectFailure(() => query('SELECT add_contact_tag($1,$2,$3,$4)',[tenantA,contactB,agentA,'Wrong tenant']),/Select a contact/);
  await expectFailure(() => query('SELECT read_contact_tags($1,$2,$3)',[tenantB,agentB,[contactB]]),/Access denied/);
  await db.exec('RESET ROLE');
  const encrypted = (await query('SELECT name_encrypted FROM contact_tags WHERE id=$1',[first.id]))[0].name_encrypted;
  assert.ok(encrypted.c); assert.ok(!JSON.stringify(encrypted).includes('Follow up'));
  await asUser('user-b');
  assert.equal((await query('SELECT id FROM contact_tags')).length,0);
  await expectFailure(() => query('SELECT remove_contact_tag($1,$2)',[first.id,agentB]),/Access denied/);
  await asUser(); await query('SELECT remove_contact_tag($1,$2)',[first.id,agentA]);
  assert.equal((await query('SELECT id FROM contact_tags')).length,0);
});

test('stage move writes history, one event, status and stage_entered_at atomically', async () => {
  const original = (await query('SELECT stage_entered_at FROM opportunities WHERE id=$1',[opportunityA]))[0];
  const moved = await move(opportunityA,stagesA[3].id,stagesA[0].id);
  assert.equal(moved.status,'won'); assert.equal(moved.stage_id,stagesA[3].id);
  assert.ok(new Date(moved.stage_entered_at) > new Date(original.stage_entered_at));
  const history = await query('SELECT * FROM opportunity_stage_history WHERE opportunity_id=$1 ORDER BY changed_at',[opportunityA]);
  assert.equal(history.length,2); assert.equal(history[1].from_stage_id,stagesA[0].id); assert.equal(history[1].to_stage_id,stagesA[3].id); assert.equal(history[1].changed_by,agentA);
  const events = await query('SELECT * FROM opportunity_events WHERE opportunity_id=$1',[opportunityA]);
  assert.equal(events.length,1); assert.equal(events[0].event_type,'opportunity.stage_changed'); assert.equal(events[0].history_id,history[1].id);
  await move(opportunityA,stagesA[3].id,stagesA[3].id);
  assert.equal((await query('SELECT * FROM opportunity_events WHERE opportunity_id=$1',[opportunityA])).length,1);
  const lost = await move(opportunityA,stagesA[4].id,stagesA[3].id); assert.equal(lost.status,'lost');
  const open = await move(opportunityA,stagesA[1].id,stagesA[4].id); assert.equal(open.status,'open');
});

test('RLS blocks cross-tenant reads on every new table even with broad existing CRM grants', async () => {
  for (const table of ['pipelines','pipeline_stages','opportunities','opportunity_stage_history','opportunity_events','contact_tags']) {
    const rows = await query(`SELECT id,tenant_id FROM ${table}`);
    assert.ok(rows.every((row) => row.tenant_id === tenantA),table);
    assert.equal((await query(`SELECT id FROM ${table} WHERE tenant_id=$1`,[tenantB])).length,0,table);
  }
  assert.equal((await query('SELECT id FROM opportunities WHERE id=$1',[opportunityB])).length,0);
  await expectFailure(() => query('SELECT read_opportunities($1,$2)',[tenantB,agentB]),/Access denied/);
  await expectFailure(() => move(opportunityB,stagesB[1].id,stagesB[0].id,agentB),/Access denied/);
  await expectFailure(() => query('UPDATE opportunities SET stage_id=$1 WHERE id=$2',[stagesA[1].id,opportunityA]),/permission denied/);
});

test('deleting a non-empty stage is blocked; moving first preserves the timeline and emits one event', async () => {
  await expectFailure(() => query('SELECT delete_opportunity_stage($1,$2)',[stagesA[0].id,agentA]),/Stage has opportunities/);
  assert.equal((await query('SELECT stage_id FROM opportunities WHERE id=$1',[opportunityA]))[0].stage_id,stagesA[0].id);
  await query('SELECT delete_opportunity_stage($1,$2,$3)',[stagesA[0].id,agentA,stagesA[1].id]);
  assert.equal((await query('SELECT * FROM pipeline_stages WHERE id=$1',[stagesA[0].id])).length,0);
  assert.equal((await query('SELECT stage_id FROM opportunities WHERE id=$1',[opportunityA]))[0].stage_id,stagesA[1].id);
  const history = await query('SELECT * FROM opportunity_stage_history WHERE opportunity_id=$1 ORDER BY changed_at',[opportunityA]);
  assert.equal(history[1].from_stage_id,null); assert.equal(history[1].from_stage_name,'New Lead');
  assert.equal((await query('SELECT * FROM opportunity_events WHERE opportunity_id=$1',[opportunityA])).length,1);
});

test('stale moves and cross-tenant/contact references cannot overwrite an opportunity', async () => {
  await move(opportunityA,stagesA[1].id,stagesA[0].id);
  await expectFailure(() => move(opportunityA,stagesA[2].id,stagesA[0].id),/changed in another session/);
  await expectFailure(() => move(opportunityA,stagesB[0].id,stagesA[1].id),/Stage does not belong/);
  await expectFailure(() => save(tenantA,agentA,fields(tenantA,{contact_id:contactB})),/Select a contact/);
  await expectFailure(() => save(tenantA,agentA,fields(tenantA,{assigned_agent_id:agentB})),/Agent is outside/);
  await expectFailure(() => save(tenantB,agentB,fields(tenantB)),/Access denied/);
});

test('an event insertion failure rolls back the stage and history together', async () => {
  await db.exec('RESET ROLE; ALTER TABLE opportunity_events ADD CONSTRAINT test_event_failure CHECK (false) NOT VALID');
  await asUser();
  await expectFailure(() => move(opportunityA,stagesA[1].id,stagesA[0].id),/test_event_failure/);
  assert.equal((await query('SELECT stage_id FROM opportunities WHERE id=$1',[opportunityA]))[0].stage_id,stagesA[0].id);
  assert.equal((await query('SELECT * FROM opportunity_stage_history WHERE opportunity_id=$1',[opportunityA])).length,1);
});

test('title and notes use actual contact encryption; audited reads hydrate names without storing contact PII', async () => {
  await db.exec('RESET ROLE');
  const raw = (await query('SELECT * FROM opportunities WHERE id=$1',[opportunityA]))[0];
  assert.equal(raw.title,null); assert.equal(raw.notes,null); assert.ok(raw.pii_encrypted.title.c);
  assert.ok(!JSON.stringify(raw).includes('Private application notes')); assert.ok(!JSON.stringify(raw).includes('Ada'));
  await asUser();
  await expectFailure(() => query('SELECT pii_encrypted FROM opportunities WHERE id=$1',[opportunityA]),/permission denied/);
  const decoded = (await query('SELECT read_opportunities($1,$2) AS row',[tenantA,agentA]))[0].row;
  assert.equal(decoded.title,'MA application'); assert.equal(decoded.notes,'Private application notes'); assert.equal(decoded.contact_name,'Ada Lovelace');
  assert.ok(!Object.hasOwn(decoded,'pii_encrypted')); assert.equal(decoded.call_id,callA);
  await db.exec('RESET ROLE');
  assert.ok((await query("SELECT * FROM pii_access_log WHERE contact_id=$1 AND action='view'",[contactA])).length > 0);
});

test('editing fields and stage in the drawer uses the same history/event transaction and rejects stale saves', async () => {
  const original = (await query('SELECT updated_at FROM opportunities WHERE id=$1',[opportunityA]))[0];
  await query('SELECT save_opportunity($1,$2,$3,$4,$5)',[tenantA,agentA,fields(tenantA,{stage_id:stagesA[2].id,title:'Updated title'}),opportunityA,original.updated_at]);
  assert.equal((await query('SELECT * FROM opportunity_events WHERE opportunity_id=$1',[opportunityA])).length,1);
  await expectFailure(() => query('SELECT save_opportunity($1,$2,$3,$4,$5)',[tenantA,agentA,fields(tenantA),opportunityA,original.updated_at]),/changed in another session/);
});

test('pipeline settings reorder and recolor stages, derive statuses, and block omitted-stage deletion', async () => {
  const next = [...stagesA].reverse().map((row) => ({ ...row, color: '#c084fc', is_won: row.position === 0, is_lost: false }));
  await query('SELECT save_opportunity_pipeline($1,$2,$3,$4,$5,$6)',[tenantA,agentA,pipelineA,'Renamed','MA',next]);
  assert.deepEqual((await query('SELECT id FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position',[pipelineA])).map((row) => row.id),next.map((row) => row.id));
  assert.equal((await query('SELECT status FROM opportunities WHERE id=$1',[opportunityA]))[0].status,'won');
  await expectFailure(() => query('SELECT save_opportunity_pipeline($1,$2,$3,$4,$5,$6)',[tenantA,agentA,pipelineA,'Renamed',null,next.slice(1)]),/move-to-stage workflow/);
});

test('empty notes decrypt as null and new opportunities can be saved without optional fields', async () => {
  const id = await save(tenantA,agentA,fields(tenantA,{notes:'',assigned_agent_id:null,call_id:null,lead_source_id:null,effective_date:''}));
  const decoded = (await query('SELECT read_opportunities($1,$2) AS row',[tenantA,agentA])).find((item) => item.row.id === id).row;
  assert.equal(decoded.notes,null); assert.equal(decoded.assigned_agent_id,null);
});

test('pipeline edits require an admin and new tenants get an idempotent default pipeline', async () => {
  await db.exec('RESET ROLE');
  await query("UPDATE tenant_agents SET role='agent' WHERE id=$1",[agentA]);
  await asUser();
  await expectFailure(() => query('SELECT delete_opportunity_stage($1,$2)',[stagesA[2].id,agentA]),/administrator/);
  await expectFailure(() => query('SELECT save_opportunity_pipeline($1,$2,$3,$4,$5,$6)',[tenantA,agentA,pipelineA,'Rename',null,stagesA]),/administrator/);
  const ids = await query('SELECT ensure_opportunities_pipeline($1,$2) AS id',[tenantA,agentA]);
  assert.equal(ids[0].id,pipelineA);
  assert.equal((await query('SELECT id FROM pipelines WHERE tenant_id=$1',[tenantA])).length,1);
  await db.exec('RESET ROLE');
  const tenantC = '00000000-0000-4000-8000-000000000003';
  const agentC = '10000000-0000-4000-8000-000000000003';
  await query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenantC,'New tenant']);
  await query("INSERT INTO tenant_agents(id,tenant_id,name,role,clerk_user_id) VALUES($1,$2,'Agent C','agent','user-c')",[agentC,tenantC]);
  await asUser('user-c');
  const created = (await query('SELECT ensure_opportunities_pipeline($1,$2) AS id',[tenantC,agentC]))[0].id;
  assert.equal((await query('SELECT ensure_opportunities_pipeline($1,$2) AS id',[tenantC,agentC]))[0].id,created);
  assert.deepEqual((await query('SELECT color FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position',[created])).map((row) => row.color),stagesA.map((row) => row.color));
});

test('client filters contact names and sorts numeric list values; move RPC passes the expected stage', async () => {
  const rows = [{id:'a',contact_name:'Ada Lovelace',pipeline_id:'p',est_value:9},{id:'b',contact_name:'Grace Hopper',pipeline_id:'p',est_value:100}];
  assert.deepEqual(filterOpportunities(rows,{search:'ada',pipeline:'p'}),[rows[0]]);
  assert.deepEqual(sortOpportunities(rows,'est_value','desc').map((row) => row.id),['b','a']);
  const client = {rpc: async (name,args) => { assert.equal(name,'move_opportunity_stage'); assert.equal(args.p_expected_stage_id,'old'); return {data:{stage_id:'new'},error:null}; }};
  assert.equal((await persistStageMove(client,{id:'a',stage_id:'old'},'new','agent')).stage_id,'new');
  await assert.rejects(() => persistStageMove({rpc:async () => ({error:new Error('failed')})},{id:'a',stage_id:'old'},'new','agent'),/failed/);
  assert.equal(money(125.50),'$125.5');
});

test('keyboard movement picks an adjacent stage even when the current stage has multiple cards', () => {
  const containers = ['one','two','three'].map((id) => ({ id, data:{current:{stageId:id}} }));
  containers.push({id:'other-card',data:{current:{stageId:'one'}}});
  const context = {active:{data:{current:{stageId:'one'}}},over:{data:{current:{stageId:'one'}}},collisionRect:{left:12},
    droppableContainers:{getEnabled:()=>containers},droppableRects:new Map([['one',{left:0}],['two',{left:280}],['three',{left:560}],['other-card',{left:12}]])};
  const result = opportunityKeyboardCoordinates({code:'ArrowRight',preventDefault:()=>{}},{context,currentCoordinates:{x:12,y:180}});
  assert.deepEqual(result,{x:292,y:180});
});
