import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { followUpBucket, updateFollowUp, createFollowUp } from '../src/lib/followUps.js';
import { callsCsv, csvCell } from '../src/lib/csv.js';

const db = new PGlite();
const tenant = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';
const me = '10000000-0000-4000-8000-000000000001';
const peer = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const foreign = '10000000-0000-4000-8000-000000000004';
const inactive = '10000000-0000-4000-8000-000000000005';
const contact = '20000000-0000-4000-8000-000000000001';
const peerContact = '20000000-0000-4000-8000-000000000002';
const foreignContact = '20000000-0000-4000-8000-000000000004';
const legacyTask = '30000000-0000-4000-8000-000000000001';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const asUser = async sub => {
  await db.exec('SET ROLE authenticated');
  await query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub })]);
};
const client = {
  async rpc(name, fields) {
    assert.equal(name, 'save_follow_up');
    try {
      const rows = await query('SELECT public.save_follow_up($1,$2,$3,$4,$5,$6) AS id', [fields.p_tenant_id, fields.p_requesting_agent_id, fields.p_contact_id, fields.p_due_at, fields.p_reason, fields.p_agent_slug]);
      return { data: rows[0].id, error: null };
    } catch (error) { return { data: null, error }; }
  },
  from(table) {
    assert.equal(table, 'follow_ups');
    let fields; const filters = {};
    const chain = {
      update(input) { fields = input; return chain; },
      eq(key, value) { filters[key] = value; return chain; },
      select() { return chain; },
      async single() {
        try {
          const rows = await query(`UPDATE public.follow_ups SET status=$1${fields.due_at ? ',due_at=$5' : ''} WHERE tenant_id=$2 AND id=$3 AND status=$4 RETURNING id`, [fields.status, filters.tenant_id, filters.id, filters.status, ...(fields.due_at ? [fields.due_at] : [])]);
          return { data: rows[0], error: rows.length ? null : new Error('Follow-up unavailable or access denied') };
        } catch (error) { return { data: null, error }; }
      },
    };
    return chain;
  },
};
const create = (actor = me, contactId = contact, slug = 'mike', tenantId = tenant) => createFollowUp(client, {
  p_tenant_id: tenantId, p_requesting_agent_id: actor, p_contact_id: contactId,
  p_due_at: '2026-10-04T12:00:00Z', p_reason: 'Call back', p_agent_slug: slug,
});
before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.tenant_agents(id uuid PRIMARY KEY,tenant_id uuid,agent_slug text,clerk_user_id text,role text,is_active boolean);
    CREATE TABLE public.contacts(id uuid PRIMARY KEY,tenant_id uuid,assigned_agent_id text);
    CREATE TABLE public.contact_activities(tenant_id uuid,contact_id uuid,type text,summary text);
    CREATE TABLE public.follow_ups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,contact_id uuid REFERENCES contacts(id),agent_id text,due_at timestamptz,reason text,status text DEFAULT 'open' CHECK(status IN ('open','done','cancelled')));
    ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy ON follow_ups FOR ALL TO authenticated USING(true) WITH CHECK(true);
    GRANT SELECT ON tenant_agents,contacts TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON follow_ups TO authenticated;
    GRANT INSERT ON contact_activities TO authenticated;
  `);
  for (const [id, slug, role, active, tenantId] of [[me, 'mike', 'agent', true, tenant], [peer, 'mark', 'agent', true, tenant], [admin, 'admin', 'admin', true, tenant], [foreign, 'foreign', 'admin', true, otherTenant], [inactive, 'inactive', 'agent', false, tenant]]) {
    await query('INSERT INTO tenant_agents VALUES($1,$2,$3,$3,$4,$5)', [id, tenantId, slug, role, active]);
  }
  for (const [id, slug, tenantId] of [[contact, 'mike', tenant], [peerContact, 'mark', tenant], [foreignContact, 'foreign', otherTenant]]) await query('INSERT INTO contacts VALUES($1,$2,$3)', [id, tenantId, slug]);
  await query('INSERT INTO follow_ups(id,tenant_id,contact_id,reason) VALUES($1,$2,$3,$4)', [legacyTask,tenant,peerContact,'Legacy fixture']);
  await db.exec(readFileSync(new URL('../supabase/migrations/086_follow_ups_workspace.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

test('create, reschedule and complete use actual PostgreSQL RLS', async () => {
  await asUser('mike');
  const id = await create();
  await updateFollowUp(client, tenant, id, 'reschedule', '2026-10-08T09:00:00Z');
  const [row] = await query('SELECT * FROM follow_ups WHERE id=$1', [id]);
  assert.equal(row.status, 'open'); assert.equal(row.due_at.toISOString(), '2026-10-08T09:00:00.000Z');
  await updateFollowUp(client, tenant, id, 'complete');
  assert.equal((await query('SELECT status FROM follow_ups WHERE id=$1', [id]))[0].status, 'done');
  await assert.rejects(() => updateFollowUp(client, tenant, id, 'reschedule', '2026-10-09'), /unavailable|denied/);
});
test('agents cannot read or mutate another agent; administrators see tenant tasks', async () => {
  await asUser('mark'); const id = await create(peer, peerContact, 'mark');
  await asUser('mike');
  assert.deepEqual(await query('SELECT id FROM follow_ups WHERE id=$1', [id]), []);
  await assert.rejects(() => updateFollowUp(client, tenant, id, 'complete'), /denied/);
  await assert.rejects(() => create(me, peerContact, 'mark'), /denied/);
  await asUser('admin');
  assert.equal((await query('SELECT id FROM follow_ups WHERE id=$1', [id])).length, 1);
  await updateFollowUp(client, tenant, id, 'complete');
  const assigned = await create(admin, contact, 'mike'); assert.ok(assigned);
});
test('foreign tenant, forged identity, unknown and inactive subjects denied', async () => {
  await asUser('mike');
  await assert.rejects(() => create(peer, peerContact, 'mark'), /denied/);
  await assert.rejects(() => create(me, foreignContact), /denied/);
  await asUser('foreign'); assert.deepEqual(await query('SELECT id FROM follow_ups WHERE tenant_id=$1', [tenant]), []);
  await assert.rejects(() => create(foreign, contact, 'foreign', otherTenant), /denied/);
  for (const sub of ['unknown', 'inactive']) {
    await asUser(sub); assert.deepEqual(await query('SELECT id FROM follow_ups'), []);
    await assert.rejects(() => create(sub === 'inactive' ? inactive : me), /denied/);
  }
});
test('direct writes enforce tenant/contact/assignee consistency', async () => {
  await asUser('admin');
  await assert.rejects(() => query('INSERT INTO follow_ups(tenant_id,contact_id,agent_id) VALUES($1,$2,$3)', [tenant, foreignContact, 'mike']), /row-level security/);
  await assert.rejects(() => query('INSERT INTO follow_ups(tenant_id,contact_id,agent_id) VALUES($1,$2,$3)', [tenant, contact, 'foreign']), /row-level security/);
  await assert.rejects(() => query('INSERT INTO follow_ups(tenant_id,contact_id,agent_id) VALUES($1,$2,$3)', [tenant, contact, 'inactive']), /row-level security/);
});
test('date buckets follow local day boundaries and omit completed tasks', () => {
  const now = new Date(2026, 9, 4, 10);
  const row = due => ({ status: 'open', due_at: due.toISOString() });
  assert.equal(followUpBucket(row(new Date(2026, 9, 3, 23, 59)), now), 'overdue');
  assert.equal(followUpBucket(row(new Date(2026, 9, 4, 0)), now), 'today');
  assert.equal(followUpBucket(row(new Date(2026, 9, 4, 23, 59)), now), 'today');
  assert.equal(followUpBucket(row(new Date(2026, 9, 5, 0)), now), 'upcoming');
  assert.equal(followUpBucket({ status: 'done', due_at: now.toISOString() }, now), null);
  assert.equal(followUpBucket({ status: 'open', due_at: 'broken' }, now), null);
});
test('CSV neutralizes formulas/whitespace, escapes separators, only exports visible fields', () => {
  for (const value of ['=CMD()', '+SUM(A1)', '-1+2', '@evil', '  =1', '\t@evil', '\r=1', '\n=1', '\uFEFF+1']) assert.ok(csvCell(value).startsWith('"\''), value);
  assert.equal(csvCell('a,"b"\r\nc'), '"a,""b""\r\nc"');
  const csv = callsCsv([{ contact_name: '=CMD()', contact_phone: '+15555555555', transcript_raw: 'secret transcript', recording_url: 'secret recording', billing_amount: 111, agent: 'Mike' }]);
  assert.ok(csv.includes("'=CMD()")); assert.ok(csv.includes("'+15555555555"));
  for (const privateField of ['secret transcript', 'secret recording', 'billing_amount', '111']) assert.ok(!csv.includes(privateField));
  assert.equal(csv.split('\r\n').length, 2);
});

test('086 is standalone, repeatable and permits new tasks for shared agency contacts', async () => {
  await db.exec('RESET ROLE');
  assert.equal((await query("SELECT to_regprocedure('public.is_current_tenant(uuid)') AS helper"))[0].helper,null);
  await db.exec(readFileSync(new URL('../supabase/migrations/086_follow_ups_workspace.sql',import.meta.url),'utf8'));
  await asUser('mike');
  assert.ok(await create(me,peerContact,'mike'));
  await assert.rejects(()=>query('SELECT * FROM oct_slim_086_rollback.backfills'), /permission denied/);
});

test('actual b47e80d frontend callbacks still create and complete tasks after SQL-before-deploy',async()=>{
  const source=execFileSync('git',['show','b47e80d:src/hooks/useContacts.js'],{encoding:'utf8'});
  const oldClient={from(table){return {
    async insert(fields){try {
      if(table==='follow_ups') await query('INSERT INTO follow_ups(tenant_id,contact_id,agent_id,due_at,reason) VALUES($1,$2,$3,$4,$5)',[fields.tenant_id,fields.contact_id,fields.agent_id,fields.due_at,fields.reason]);
      else {assert.equal(table,'contact_activities');await query('INSERT INTO contact_activities VALUES($1,$2,$3,$4)',[fields.tenant_id,fields.contact_id,fields.type,fields.summary]);}
      return {error:null};
    }catch(error){return {error};}},
    update(fields){return {async eq(key,id){assert.equal(key,'id');try{await query('UPDATE follow_ups SET status=$1 WHERE id=$2',[fields.status,id]);return {error:null};}catch(error){return {error};}}};},
  };}};
  const callback=name=>{
    const match=source.match(new RegExp(`const ${name} = useCallback\\(\\s*(async[\\s\\S]*?),\\s*\\[supabaseClient(?:, tenant)?\\]`));
    assert.ok(match,name);
    return runInNewContext(`(${match[1]})`,{supabaseClient:oldClient,tenant:{id:tenant}});
  };
  await asUser('mike');
  for(const agentId of ['mike',null]) {
    const reason='Predeploy fixture '+String(agentId);
    await callback('addFollowUp')({contactId:peerContact,agentId,dueAt:'2026-10-05T12:00:00Z',reason});
    const [row]=await query('SELECT id,agent_id FROM follow_ups WHERE reason=$1',[reason]);
    assert.equal(row.agent_id,'mike');
    await callback('setFollowUpStatus')(row.id,'done');
    assert.equal((await query('SELECT status FROM follow_ups WHERE id=$1',[row.id]))[0].status,'done');
  }
});

test('rollback restores replaced policies and owner backfills while retaining task changes',async()=>{
  await db.exec('RESET ROLE');
  await query("UPDATE follow_ups SET status='done',reason='Preserve edits' WHERE id=$1",[legacyTask]);
  const count=(await query('SELECT count(*) AS n FROM follow_ups'))[0].n;
  const rollback=readFileSync(new URL('../release/rollback-slim.sql',import.meta.url),'utf8');
  await db.exec(rollback.slice(rollback.indexOf('-- SECTION 2:')));
  const [row]=await query('SELECT * FROM follow_ups WHERE id=$1',[legacyTask]);
  assert.equal(row.agent_id,null);assert.equal(row.status,'done');assert.equal(row.reason,'Preserve edits');
  assert.equal((await query('SELECT count(*) AS n FROM follow_ups'))[0].n,count);
  assert.equal((await query("SELECT permissive FROM pg_policies WHERE tablename='follow_ups' AND policyname='legacy'"))[0].permissive,'PERMISSIVE');
  assert.equal((await query("SELECT to_regprocedure('public.save_follow_up(uuid,uuid,uuid,timestamptz,text,text)') AS rpc"))[0].rpc,null);
  await asUser('mike');
  await query('SELECT * FROM follow_ups');
});
