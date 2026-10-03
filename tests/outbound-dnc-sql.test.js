import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

test('070 checks all tenant contacts, formatted duplicates, blind indexes and authenticated isolation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role')$$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub', current_setting('test.sub'))$$;
      CREATE TABLE tenant_agents(id uuid, tenant_id uuid, clerk_user_id text, is_active boolean);
      CREATE TABLE contacts(tenant_id uuid, phone text, phone_hash text, do_not_call boolean);
      CREATE FUNCTION pii_blind_index(text) RETURNS text LANGUAGE sql AS $$SELECT md5($1)$$;`);
    const normalization = (await readFile(new URL('../supabase/migrations/043_contacts_phone_identity.sql', import.meta.url), 'utf8')).match(/CREATE OR REPLACE FUNCTION public.normalize_phone_e164[\s\S]*?\$\$;/)[0];
    await db.exec(normalization);
    await db.exec(await readFile(new URL('../supabase/migrations/070_outbound_dnc.sql', import.meta.url), 'utf8'));
    const tenant = '10000000-0000-0000-0000-000000000001';
    const other = '10000000-0000-0000-0000-000000000002';
    const agent = '20000000-0000-0000-0000-000000000001';
    await db.exec(`INSERT INTO tenant_agents VALUES ('${agent}', '${tenant}', 'user-a', true);
      INSERT INTO contacts VALUES ('${tenant}', '(609) 778-7669', NULL, true),
      ('${tenant}', '+16097787669', NULL, false),
      ('${other}', '+16091112222', NULL, true),
      ('${tenant}', NULL, md5('+16093334444'), true);
      SET test.role='service_role'; SET test.sub='user-a';`);
    const check = async (phone, requester = null, tenantId = tenant) => (await db.query(
      'SELECT outbound_dnc_status($1,$2,$3) AS blocked', [phone, requester, tenantId])).rows[0].blocked;
    assert.equal(await check('6097787669'), true);
    assert.equal(await check('+16093334444'), true);
    assert.equal(await check('6091112222'), false);
    assert.equal(await check('6091112222', null, other), true);
    assert.equal(await check('6099999999'), false);
    await assert.rejects(check('bad'), /valid phone/);
    await db.exec("SET test.role='authenticated'; SET ROLE authenticated;");
    assert.equal(await check('6097787669', agent, other), true); // Spoofed tenant ignored.
    assert.equal(await check('6091112222', agent, other), false);
    await db.exec("SET test.sub='user-b';");
    await assert.rejects(check('6097787669', agent), /Active tenant agent/);
    await db.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(check('6097787669', agent), /permission denied/);
  } finally { await db.close(); }
});
