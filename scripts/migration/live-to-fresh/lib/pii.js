// PII re-encryption.
// Decrypt: pgp_sym_decrypt in OLD with OLD_PII_ENCRYPTION_KEY passed as a bind
// parameter (never interpolated, never logged).
// Encrypt: NEW's own public.encrypt_pii_value(), which uses NEW's Vault key.
// Blind indexes: NEW's own public.pii_blind_index() over the same inputs NEW's
// contacts trigger uses.
// Plaintext exists only in this process's memory and in bind parameters on
// localhost connections. It is never written to a table, file, log or console.

import { createHash } from 'node:crypto';

export function isEnvelope(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.c === 'string' && 'k' in v;
}

export class PiiCodec {
  constructor({ oldDb, newDb, oldKey, cryptoSchema = 'extensions' }) {
    if (!oldKey) throw Error('OLD_PII_ENCRYPTION_KEY is not set');
    if (!/^[a-z_][a-z0-9_]*$/.test(cryptoSchema)) throw Error('Invalid pgcrypto schema');
    this.oldDb = oldDb; this.newDb = newDb; this.oldKey = oldKey; this.cryptoSchema = cryptoSchema;
  }

  // envelopes: array of envelope objects (or null). Returns plaintext array
  // (null where the input was null). Throws only a generic error on failure.
  async decryptMany(envelopes) {
    if (!envelopes.length) return [];
    let r;
    try {
      r = await this.oldDb.query(
        `SELECT x.i, CASE WHEN x.e IS NULL OR jsonb_typeof(x.e)<>'object' THEN NULL
                ELSE ${this.cryptoSchema}.pgp_sym_decrypt(decode(x.e->>'c','base64'), $2) END AS p
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY x(e, i)`,
        [JSON.stringify(envelopes.map(e => (isEnvelope(e) ? e : null))), this.oldKey]);
    } catch {
      throw Error('PII decryption failed in OLD');
    }
    const out = new Array(envelopes.length).fill(null);
    for (const row of r.rows) out[Number(row.i) - 1] = row.p;
    return out;
  }

  // Returns NEW envelopes (objects) via NEW's encrypt_pii_value; blank -> null.
  async encryptMany(plaintexts) {
    if (!plaintexts.length) return [];
    let r;
    try {
      r = await this.newDb.query(
        `SELECT u.i, public.encrypt_pii_value(u.v)::text AS e FROM unnest($1::text[]) WITH ORDINALITY u(v, i)`,
        [plaintexts]);
    } catch {
      throw Error('PII encryption failed in NEW');
    }
    const out = new Array(plaintexts.length).fill(null);
    for (const row of r.rows) out[Number(row.i) - 1] = row.e ? JSON.parse(row.e) : null;
    return out;
  }

  // Contact blind indexes exactly as NEW's contacts_sync_pii_encrypted computes them.
  async contactIndexes(items) {
    if (!items.length) return [];
    let r;
    try {
      r = await this.newDb.query(
        `SELECT x.i, public.pii_blind_index(public.normalize_phone_e164(x.phone)) AS phone_hash,
                public.pii_blind_index(concat_ws(' ', x.first_name, x.last_name)) AS name_search
           FROM jsonb_to_recordset($1::jsonb) x(i int, phone text, first_name text, last_name text)`,
        [JSON.stringify(items.map((it, i) => ({ i, ...it })))]);
    } catch {
      throw Error('Blind index computation failed in NEW');
    }
    const out = new Array(items.length);
    for (const row of r.rows) out[Number(row.i)] = { phone_hash: row.phone_hash, name_search: row.name_search };
    return out;
  }

  // NEW-side decryption, used only by --verify to compare hashes.
  async decryptNewMany(envelopes) {
    if (!envelopes.length) return [];
    const r = await this.newDb.query(
      `SELECT x.i, CASE WHEN x.e IS NULL OR jsonb_typeof(x.e)<>'object' THEN NULL ELSE public.decrypt_pii_value(x.e) END AS p
         FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY x(e, i)`,
      [JSON.stringify(envelopes.map(e => (isEnvelope(e) ? e : null)))]);
    const out = new Array(envelopes.length).fill(null);
    for (const row of r.rows) out[Number(row.i) - 1] = row.p;
    return out;
  }
}

export function sha256(value) {
  return value === null || value === undefined ? null : createHash('sha256').update(String(value), 'utf8').digest('hex');
}

// Re-encrypt every envelope inside an object of envelopes ({field: envelope}).
// `extra` supplies plaintext for fields missing from the envelope object.
export async function reencryptObjects(codec, objects, extra = []) {
  const slots = [];
  objects.forEach((obj, i) => {
    if (obj && typeof obj === 'object') for (const [field, env] of Object.entries(obj)) if (isEnvelope(env)) slots.push({ i, field, env });
  });
  const plain = await codec.decryptMany(slots.map(s => s.env));
  const fields = objects.map(() => ({}));
  slots.forEach((s, j) => { if (plain[j] !== null) fields[s.i][s.field] = plain[j]; });
  extra.forEach((more, i) => { for (const [f, v] of Object.entries(more || {})) if (fields[i][f] == null && v != null && String(v).trim() !== '') fields[i][f] = String(v); });
  const flat = [];
  fields.forEach((f, i) => { for (const [field, v] of Object.entries(f)) flat.push({ i, field, v }); });
  const enc = await codec.encryptMany(flat.map(x => x.v));
  const out = objects.map(o => (o == null ? null : {}));
  flat.forEach((x, j) => { if (out[x.i] === null) out[x.i] = {}; if (enc[j]) out[x.i][x.field] = enc[j]; });
  // Non-envelope members (if any) are carried through unchanged.
  objects.forEach((obj, i) => { if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (!isEnvelope(v) && !(k in out[i])) out[i][k] = v; });
  return { encrypted: out, plaintext: fields };
}
