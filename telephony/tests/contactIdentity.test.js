import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizePhoneE164 } from '../src/phone.js';
import { normalizePhoneE164 as browserPhone, normalizeContactPhone } from '../../src/lib/phone.js';
import { chooseGif, MAX_GIF_BYTES, downloadGif } from '../src/giphy.js';

test('browser and service agree on canonical phone identity and invalid writes', () => {
  for (const input of ['6097787669', '+16097787669', '1 (609) 778-7669', '(609) 778-7669']) {
    assert.equal(normalizePhoneE164(input), '+16097787669');
    assert.equal(browserPhone(input), '+16097787669');
  }
  assert.throws(() => normalizeContactPhone({phone:'abc'}), /valid phone/);
  assert.equal(normalizeContactPhone({phone:''}).phone, null);
});

test('GIF selection only accepts HTTPS GIPHY renditions strictly under 600 KB', () => {
  const gif = {id:'test', images:{downsized:{url:'https://media1.giphy.com/test.gif',size:String(MAX_GIF_BYTES)}, fixed_width_small:{url:'https://media2.giphy.com/small.gif', size:'40000'}}};
  assert.equal(chooseGif(gif).size, 40000);
  gif.images.fixed_width_small.url = 'https://evil.example/test.gif';
  assert.equal(chooseGif(gif), null);
});

test('actual GIF download size is enforced even if metadata understates it', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(new Uint8Array(MAX_GIF_BYTES), {headers:{'content-type':'image/gif'}});
    await assert.rejects(downloadGif({url:'https://media1.giphy.com/test.gif'}), /600 KB/);
  } finally { globalThis.fetch = original; }
});

test('migration repairs duplicates, preserves relations, normalizes writes and authorizes explicit merges', async () => {
  const db = new PGlite();
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  try {
    const foundation = await readFile(new URL('../../supabase/migrations/017_crm_contacts.sql', import.meta.url), 'utf8');
    const normalizer = foundation.slice(foundation.indexOf('CREATE OR REPLACE FUNCTION public.normalize_phone_e164'), foundation.indexOf('-- ------------------------------------------------------------\n-- contacts'));
    const contacts = foundation.slice(foundation.indexOf('CREATE TABLE IF NOT EXISTS public.contacts'), foundation.indexOf('CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON'));
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('sub', current_setting('app.user_id', true)) $$;
      CREATE TABLE tenants(id uuid PRIMARY KEY);
      INSERT INTO tenants VALUES ('${id(1)}');
      CREATE FUNCTION public.encrypt_pii_value(value text) RETURNS jsonb LANGUAGE sql AS $$ SELECT to_jsonb(value) $$;
      ${normalizer} ${contacts}
      ALTER TABLE contacts ADD COLUMN address text, ADD COLUMN pii_encrypted jsonb;
      CREATE TABLE tenant_agents(id uuid, tenant_id uuid, clerk_user_id text, role text, agent_slug text);
      INSERT INTO tenant_agents VALUES ('${id(10)}','${id(1)}','user_a','admin','agent_a');
      CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES contacts(id), body text, from_number text, to_number text);
      CREATE TABLE contact_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES contacts(id), body text);
      CREATE TABLE pii_access_log(contact_id uuid REFERENCES contacts(id), agent_id uuid, clerk_user_id text, action text);
      INSERT INTO contacts(id,phone,first_name,assigned_agent_id) VALUES
        ('${id(2)}','6097787669','Original','agent_a'),('${id(3)}','+16097787669','Duplicate',null);
      INSERT INTO messages(contact_id,body) VALUES ('${id(3)}','keep message');
      INSERT INTO contact_notes(contact_id,body) VALUES ('${id(3)}','keep note');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/043_contacts_phone_identity.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('SELECT count(*)::int n FROM contacts')).rows[0].n, 1);
    assert.equal((await db.query('SELECT phone FROM contacts')).rows[0].phone, '+16097787669');
    for (const table of ['messages','contact_notes']) assert.equal((await db.query(`SELECT contact_id FROM ${table}`)).rows[0].contact_id, id(2));
    assert.equal((await db.query('SELECT count(*)::int n FROM contact_merge_archive')).rows[0].n, 1);
    await assert.rejects(db.exec(`INSERT INTO contacts(phone) VALUES ('(609) 778-7669')`), /unique/);
    await assert.rejects(db.exec(`INSERT INTO contacts(phone) VALUES ('bad')`), /valid phone/);
    await db.exec(`INSERT INTO contacts(id,phone,source) VALUES ('${id(4)}','2125550100','sms_inbound');`);
    assert.equal((await db.query(`SELECT phone FROM contacts WHERE id='${id(4)}'`)).rows[0].phone, '+12125550100');
    await db.exec(`SET app.user_id='impostor';`);
    await assert.rejects(db.exec(`SELECT merge_contacts_secure('${id(2)}','${id(4)}','2125550100','${id(10)}')`), /not linked/);
    await db.exec(`SET app.user_id='user_a'; SELECT merge_contacts_secure('${id(2)}','${id(4)}','2125550100','${id(10)}');`);
    assert.equal((await db.query('SELECT phone FROM contacts')).rows[0].phone, '+12125550100');
  } finally { await db.close(); }
});
