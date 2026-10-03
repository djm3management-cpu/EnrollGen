import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const migration = async name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const extract = (source, name) => {
  const start = source.indexOf('CREATE OR REPLACE FUNCTION ' + name + '(');
  assert.notEqual(start, -1, name);
  return source.slice(start, source.indexOf('$$;', start) + 3);
};
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('071 reproduces production JSON-null failure and restores create, list, detail and caller lookup with real crypto', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE SCHEMA pii_vault; CREATE SCHEMA vault; CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',current_setting('app.user_id',true))$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('app.role',true)$$;
      CREATE TABLE pii_vault.encryption_keys(key_id uuid, vault_secret_id uuid, is_active boolean, created_at timestamptz);
      CREATE TABLE vault.decrypted_secrets(id uuid, decrypted_secret text);
      INSERT INTO vault.decrypted_secrets VALUES('${id(90)}','isolated-test-key');
      INSERT INTO pii_vault.encryption_keys VALUES('${id(91)}','${id(90)}',true,now());
      CREATE TABLE tenant_agents(id uuid, tenant_id uuid, role text, agent_slug text, clerk_user_id text);
      INSERT INTO tenant_agents VALUES('${id(1)}','${id(10)}','agent','agent_a','user_a'),
        ('${id(2)}','${id(20)}','agent','agent_b','user_b');
      CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, assigned_agent_id text,
        first_name text,last_name text,phone text,email text,dob date,address text,mbi_last4 text,
        pii_encrypted jsonb,phone_hash text,name_search text,first_initial text,last_initial text,
        phone_last4 text,email_set boolean,dob_set boolean,zip text,county text,state text,current_carrier text,current_plan text);
      CREATE TABLE pii_access_log(contact_id uuid,agent_id uuid,clerk_user_id text,action text,ip_address text,user_agent text);
      REVOKE ALL ON pii_vault.encryption_keys,vault.decrypted_secrets FROM PUBLIC,anon,authenticated;`);
    const original = await migration('022_pii_protection_phase1.sql');
    for (const name of ['pii_vault.get_active_key', 'pii_vault.get_key', 'public.encrypt_pii_value',
      'public.decrypt_pii_value', 'pii_vault.blind_index_key', 'public.pii_blind_index']) {
      await db.exec(extract(original, name));
    }
    await db.exec(extract(await migration('043_contacts_phone_identity.sql'), 'public.normalize_phone_e164'));
    await db.exec(await migration('024_mbi_last4_not_pii.sql'));
    await db.exec(`CREATE TRIGGER contact_pii BEFORE INSERT OR UPDATE OF first_name,last_name,phone,email,dob,address,mbi_last4
      ON contacts FOR EACH ROW EXECUTE FUNCTION contacts_sync_pii_encrypted();
      REVOKE ALL ON FUNCTION decrypt_pii_value(jsonb),encrypt_pii_value(text) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION decrypt_pii_value(jsonb),encrypt_pii_value(text) TO service_role;`);
    await db.exec(await migration('044_agent_contact_details.sql'));
    await db.exec(extract(await migration('023_pii_protection_phase2_rls.sql'), 'public.match_contacts_by_phone'));
    await db.exec(`GRANT SELECT,INSERT ON contacts TO authenticated;
      GRANT EXECUTE ON FUNCTION match_contacts_by_phone(text[],uuid) TO authenticated;
      INSERT INTO contacts(id,tenant_id,first_name,last_name,phone,email) VALUES
      ('${id(3)}','${id(10)}','Jane','','+16097787669',''),
      ('${id(4)}','${id(10)}','Healthy','Contact','+16091112222','healthy@example.test');
      SET app.role='authenticated'; SET app.user_id='user_a'; SET ROLE authenticated;`);
    // Same payload as the production create form: optional last_name/email are ''.
    assert.equal((await db.query(`SELECT id FROM contacts WHERE id='${id(3)}'`)).rows.length, 1);
    await assert.rejects(db.query(`SELECT decrypt_pii('${id(3)}','${id(1)}')`), /PII encryption key <NULL> not found/);
    await assert.rejects(db.query(`SELECT * FROM read_contact_details(ARRAY['${id(3)}'::uuid,'${id(4)}'::uuid],'${id(1)}')`), /PII encryption key <NULL> not found/);
    assert.equal((await db.query(`SELECT decrypt_pii('${id(4)}','${id(1)}') AS fields`)).rows[0].fields.first_name, 'Healthy');
    await db.exec('RESET ROLE');
    const before = (await db.query('SELECT id,pii_encrypted FROM contacts ORDER BY id')).rows;
    const grantsBefore = (await db.query("SELECT proacl::text FROM pg_proc WHERE oid='decrypt_pii_value(jsonb)'::regprocedure")).rows;
    await db.exec(await migration('071_contacts_pii_json_null.sql'));
    assert.deepEqual((await db.query('SELECT id,pii_encrypted FROM contacts ORDER BY id')).rows, before);
    assert.deepEqual((await db.query("SELECT proacl::text FROM pg_proc WHERE oid='decrypt_pii_value(jsonb)'::regprocedure")).rows, grantsBefore);
    assert.equal((await db.query(`SELECT decrypt_pii_value('null'::jsonb) AS v`)).rows[0].v, null);
    assert.equal((await db.query(`SELECT decrypt_pii_value(NULL) AS v`)).rows[0].v, null);
    await assert.rejects(db.query(`SELECT decrypt_pii_value('{}'::jsonb)`), /key <NULL> not found/);
    await assert.rejects(db.query(`SELECT decrypt_pii_value('{"k":"${id(99)}","c":"corrupt"}'::jsonb)`), /key .* not found/);
    await db.exec('SET ROLE authenticated');
    const details = (await db.query(`SELECT decrypt_pii('${id(3)}','${id(1)}') AS fields`)).rows[0].fields;
    assert.equal(details.first_name, 'Jane'); assert.equal(details.last_name, null); assert.equal(details.email, null);
    assert.equal(details.phone, '+16097787669');
    assert.equal((await db.query(`SELECT * FROM read_contact_details(ARRAY['${id(3)}'::uuid,'${id(4)}'::uuid],'${id(1)}')`)).rows.length, 2);
    // New creation followed by detail hydration succeeds with the same blank fields.
    await db.exec(`INSERT INTO contacts(id,tenant_id,first_name,last_name,phone,email) VALUES
      ('${id(5)}','${id(10)}','New','','+16093334444','');`);
    assert.equal((await db.query(`SELECT decrypt_pii('${id(5)}','${id(1)}') AS fields`)).rows[0].fields.email, null);
    const caller = (await db.query(`SELECT * FROM match_contacts_by_phone(ARRAY['(609) 778-7669'],'${id(1)}')`)).rows[0];
    assert.equal(caller.id, id(3));
    assert.equal((await db.query(`SELECT * FROM search_contacts_secure('6097787669','${id(1)}')`)).rows[0].contact_id, id(3));
    await assert.rejects(db.query(`SELECT decrypt_pii('${id(3)}','${id(2)}')`), /not the signed-in/);
    await db.exec("SET app.user_id='user_b'");
    await assert.rejects(db.query(`SELECT decrypt_pii('${id(3)}','${id(2)}')`), /different tenants/);
    await assert.rejects(db.query(`SELECT decrypt_pii_value('null'::jsonb)`), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query(`SELECT decrypt_pii_value('null'::jsonb)`), /permission denied/);
  } finally { await db.close(); }
});
