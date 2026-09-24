import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('full agent details remain tenant-scoped, audited, and editable without losing MBI', async () => {
  const db = new PGlite();
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('sub', current_setting('app.user_id', true)) $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
      CREATE FUNCTION encrypt_pii_value(value text) RETURNS jsonb LANGUAGE sql AS $$ SELECT to_jsonb(value) $$;
      CREATE FUNCTION decrypt_pii_value(value jsonb) RETURNS text LANGUAGE sql AS $$ SELECT value #>> '{}' $$;
      CREATE FUNCTION normalize_phone_e164(value text) RETURNS text LANGUAGE sql AS $$ SELECT value $$;
      CREATE FUNCTION pii_blind_index(value text) RETURNS text LANGUAGE sql AS $$ SELECT value $$;
      CREATE TABLE tenant_agents(id uuid, tenant_id uuid, role text, agent_slug text, clerk_user_id text);
      CREATE TABLE contacts(id uuid PRIMARY KEY, tenant_id uuid, assigned_agent_id text, pii_encrypted jsonb,
        mbi_last4 text, first_initial text, last_initial text, phone_last4 text, phone_hash text, name_search text);
      CREATE TABLE pii_access_log(contact_id uuid, agent_id uuid, clerk_user_id text, action text, ip_address text, user_agent text);
      INSERT INTO tenant_agents VALUES ('${id(1)}','${id(10)}','agent','agent_a','user_a');
      INSERT INTO contacts(id,tenant_id,assigned_agent_id,pii_encrypted) VALUES
        ('${id(2)}','${id(10)}',null,'{"first_name":"Jane","last_name":"Doe","phone":"+16097787669","mbi_full":"1EG4TE5MK73","ssn":"excluded"}'),
        ('${id(3)}','${id(20)}','agent_b','{"first_name":"Other tenant"}');
      -- Reproduce the existing trigger preserving OLD custom encrypted values.
      CREATE FUNCTION preserve_old_pii() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.pii_encrypted := OLD.pii_encrypted; RETURN NEW; END; $$;
      CREATE TRIGGER existing_pii BEFORE UPDATE OF mbi_last4 ON contacts FOR EACH ROW EXECUTE FUNCTION preserve_old_pii();
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/044_agent_contact_details.sql', import.meta.url), 'utf8'));
    // Match the auth.role() helper in Supabase (JWT role, not definer SQL role).
    await db.exec(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
      GRANT EXECUTE ON FUNCTION decrypt_pii(uuid,uuid,text,text,text), update_pii_field(uuid,uuid,text,text) TO authenticated;
      SET ROLE authenticated; SET app.user_id='user_a';`);
    const result = await db.query(`SELECT * FROM read_contact_details(ARRAY['${id(2)}'::uuid,'${id(3)}'::uuid], '${id(1)}')`);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].fields.first_name, 'Jane');
    assert.equal(result.rows[0].fields.phone, '+16097787669');
    assert.equal(result.rows[0].fields.mbi_full, '1EG4TE5MK73');
    assert.equal('ssn' in result.rows[0].fields, false);
    await assert.rejects(db.exec(`SELECT decrypt_pii('${id(3)}','${id(1)}')`), /different tenants/);
    await db.exec(`SELECT update_pii_field('${id(2)}','${id(1)}','mbi_full','9AA9BB9CC99')`);
    assert.equal((await db.query(`SELECT decrypt_pii('${id(2)}','${id(1)}') AS data`)).rows[0].data.mbi_full, '9AA9BB9CC99');
    await db.exec(`SET app.user_id='impostor'`);
    await assert.rejects(db.exec(`SELECT * FROM read_contact_details(ARRAY['${id(2)}'::uuid], '${id(1)}')`), /not linked/);
    await db.exec('RESET ROLE');
    assert.ok((await db.query('SELECT count(*)::int AS n FROM pii_access_log')).rows[0].n >= 3);
  } finally { await db.close(); }
});
