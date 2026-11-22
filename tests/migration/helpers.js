// Synthetic OLD/NEW databases for live-to-fresh migration tests.
// Two independent in-process PGlite instances with real pgcrypto. All data is
// invented here; nothing comes from a production dump.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const OLD_KEY = 'synthetic-old-key-material-0000000000000000';
const NEW_KEY = 'synthetic-new-key-material-1111111111111111';
export const OLD_KEY_ID = 'a0000000-0000-4000-8000-0000000000aa';
const NEW_KEY_ID = 'b0000000-0000-4000-8000-0000000000bb';
export const TENANT = 'c0000000-0000-4000-8000-0000000000cc';

const piiFunctions = (keyId, key) => `
 CREATE FUNCTION public.encrypt_pii_value(p text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE WHEN p IS NULL OR btrim(p)='' THEN NULL ELSE jsonb_build_object('c', encode(pgp_sym_encrypt(p, '${key}', 'cipher-algo=aes256'),'base64'), 'k', '${keyId}') END $$;
 CREATE FUNCTION public.decrypt_pii_value(e jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN e IS NULL THEN NULL ELSE pgp_sym_decrypt(decode(e->>'c','base64'), '${key}') END $$;
 CREATE FUNCTION public.pii_blind_index(v text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v)='' THEN NULL ELSE encode(hmac(convert_to(lower(btrim(v)),'UTF8'), digest('${key}'||':blind-index','sha256'),'sha256'),'hex') END $$;
 CREATE FUNCTION public.normalize_phone_e164(v text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN v IS NULL THEN NULL WHEN length(regexp_replace(v,'\\D','','g'))=10 THEN '+1'||regexp_replace(v,'\\D','','g') ELSE '+'||regexp_replace(v,'\\D','','g') END $$;`;

export async function oldDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`CREATE EXTENSION pgcrypto;
   ${piiFunctions(OLD_KEY_ID, OLD_KEY)}
   CREATE TABLE tenants(id uuid PRIMARY KEY, name text NOT NULL, ghl_webhook_url text);
   CREATE TABLE contacts(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, first_name text, last_name text, phone text, email text, dob date, address text,
     pii_encrypted jsonb, phone_hash text, name_search text, phone_last4 text, created_at timestamptz NOT NULL);
   CREATE TABLE contact_activities(id uuid PRIMARY KEY, contact_id uuid NOT NULL REFERENCES contacts(id), type text NOT NULL, summary text, created_at timestamptz NOT NULL,
     CHECK (type IN ('call','enrollment','note','status_change','follow_up','sms','fax')));
   CREATE TABLE section_scores(id uuid PRIMARY KEY, session_id uuid NOT NULL, section_label text NOT NULL, score smallint, max_score smallint, notes text, created_at timestamptz NOT NULL DEFAULT now());
   CREATE TABLE amounts(id bigint PRIMARY KEY, amount numeric, ratio double precision, note text);
   CREATE TABLE agent_availability_log(id uuid PRIMARY KEY, agent_id text NOT NULL, agent_name text NOT NULL, status text NOT NULL, available boolean NOT NULL, changed_at timestamptz NOT NULL);`);
  return db;
}

export async function newDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`CREATE EXTENSION pgcrypto;
   ${piiFunctions(NEW_KEY_ID, NEW_KEY)}
   CREATE FUNCTION public.retention_anchor_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.retention_started_at := coalesce((to_jsonb(NEW)->>TG_ARGV[0])::timestamptz, clock_timestamp()); RETURN NEW; END $$;
   CREATE TABLE tenants(id uuid PRIMARY KEY, name text NOT NULL, ghl_webhook_url text);
   CREATE TABLE contacts(id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), first_name text, last_name text, phone text, email text, dob date, address text,
     pii_encrypted jsonb, phone_hash text, name_search text, phone_last4 text, created_at timestamptz NOT NULL,
     retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(), retention_last_activity_at timestamptz);
   CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON contacts FOR EACH ROW EXECUTE FUNCTION retention_anchor_insert('created_at');
   CREATE TABLE contact_activities(id uuid PRIMARY KEY, contact_id uuid NOT NULL REFERENCES contacts(id), type text NOT NULL, summary text NOT NULL, created_at timestamptz NOT NULL,
     CHECK (type IN ('call','enrollment','note','status_change','follow_up')));
   CREATE TABLE section_scores(id uuid PRIMARY KEY, session_id uuid NOT NULL, section_number real NOT NULL, section_label text NOT NULL, completed boolean DEFAULT false,
     duration_seconds integer, checklist_total smallint, checklist_done smallint, created_at timestamptz NOT NULL DEFAULT now());
   CREATE TABLE amounts(id bigint PRIMARY KEY, amount numeric, ratio double precision, note text);
   CREATE TABLE agent_availability_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, agent_id text NOT NULL, agent_name text, status text NOT NULL, available boolean NOT NULL,
     changed_at timestamptz NOT NULL DEFAULT now(), retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp());
   CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON agent_availability_log FOR EACH ROW EXECUTE FUNCTION retention_anchor_insert('changed_at');
   INSERT INTO tenants VALUES ('${TENANT}', 'Synthetic Agency', NULL);`);
  return db;
}

const uuid = (prefix, n) => `${prefix}${String(n).padStart(12, '0')}`;
export const contactId = n => uuid('d0000000-0000-4000-8000-', n);
export const activityId = n => uuid('e0000000-0000-4000-8000-', n);

// Synthetic contacts written the way production writes them: plaintext mirror
// plus per-field envelopes under the OLD key.
export async function seedContacts(db, count) {
  for (let n = 1; n <= count; n++) {
    const first = `Synth${n}`, last = `Person${n}`, phone = `+1555010${String(n).padStart(4, '0')}`;
    await db.query(`INSERT INTO contacts(id, tenant_id, first_name, last_name, phone, dob, pii_encrypted, phone_hash, name_search, phone_last4, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::text::date,
        jsonb_strip_nulls(jsonb_build_object('first_name', encrypt_pii_value($3), 'last_name', encrypt_pii_value($4), 'phone', encrypt_pii_value($5),
          'dob', encrypt_pii_value($6::text), 'mbi_full', encrypt_pii_value($7::text))),
        pii_blind_index($5::text), pii_blind_index($3::text || ' ' || $4::text), right($5::text, 4), now() - ($8::text || ' days')::interval)`,
    [contactId(n), TENANT, first, last, phone, n % 2 ? '1950-01-0' + ((n % 9) + 1) : null, n % 3 === 0 ? `1EG4TE5MK${n % 10}${n % 10}` : null, String(n)]);
  }
}

export async function catalogFor(db) {
  const { tableColumns, primaryKeys, retentionAnchors } = await import('../../scripts/migration/live-to-fresh/lib/catalog.js');
  return { cols: await tableColumns(db), pks: await primaryKeys(db), anchors: await retentionAnchors(db) };
}

export async function tableDigest(db, table, exclude = []) {
  const r = await db.query(`SELECT md5(string_agg((to_jsonb(t) - $1::text[])::text, ',' ORDER BY id)) AS h, count(*)::int AS n FROM ${table} t`, [exclude]);
  return r.rows[0];
}
