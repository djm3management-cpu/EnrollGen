// Publisher quality attestations (spec v5 section 6, migration 190). Pure
// helpers shared by the operator and buyer portals. The decision gate itself
// is ping_source_attested in SQL; attestationStatus mirrors it exactly.
// No imports: shared with the browser demo.
class AttestationInvalid extends Error {}
const fail = message => { throw new AttestationInvalid(message); };

export const ATTESTATION_FIELDS = Object.freeze(['onshore_operation', 'no_resale', 'consent_language_reviewed',
  'attestation_document_ref', 'attested_by', 'attested_at', 'attestation_expires_at']);
export const ATTESTATION_COLUMNS = `id,name,type,${ATTESTATION_FIELDS.join(',')}`;

/** 'current', 'expired' or 'missing' at `now`, as ping_source_attested decides. */
export function attestationStatus(source, now = new Date()) {
  const complete = source?.onshore_operation === true && source.no_resale === true && source.consent_language_reviewed === true
    && typeof source.attestation_document_ref === 'string' && source.attestation_document_ref.trim() !== ''
    && Boolean(source.attested_at) && Boolean(source.attestation_expires_at);
  if (!complete) return 'missing';
  return new Date(source.attestation_expires_at) > now ? 'current' : 'expired';
}

/** The public projection: never the attesting person's identifier beyond what the operator recorded. */
export function attestationView(source, now = new Date()) {
  return { source_id: source.id, name: source.name, status: attestationStatus(source, now),
    onshore_operation: source.onshore_operation ?? null, no_resale: source.no_resale ?? null,
    consent_language_reviewed: source.consent_language_reviewed ?? null,
    attestation_document_ref: source.attestation_document_ref ?? null, attested_at: source.attested_at ?? null,
    expires_at: source.attestation_expires_at ?? null };
}

/** Validates the operator's attestation write: { patch } with the column values to store, or { error }. */
export function checkAttestation(input, actor, now = new Date()) {
  try { return { patch: attestationPatch(input, actor, now) }; }
  catch (error) { if (error instanceof AttestationInvalid) return { error: error.message }; throw error; }
}

/** The column values to store; throws on invalid input. */
export function attestationPatch(input, actor, now = new Date()) {
  const patch = {};
  for (const key of ['onshore_operation', 'no_resale', 'consent_language_reviewed']) {
    if (typeof input[key] !== 'boolean') fail(`invalid ${key}`);
    patch[key] = input[key];
  }
  const ref = input.attestation_document_ref;
  if (ref !== null && (typeof ref !== 'string' || ref.trim().length < 1 || ref.length > 200 || [...ref].some(c => c.charCodeAt(0) < 32))) {
    fail('invalid attestation_document_ref');
  }
  patch.attestation_document_ref = ref === null ? null : ref.trim();
  const expires = input.expires_at;
  if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(expires) || Number.isNaN(Date.parse(expires))) {
    fail('invalid expires_at');
  }
  if (new Date(expires) <= now) fail('expires_at must be in the future');
  patch.attestation_expires_at = new Date(expires).toISOString();
  patch.attested_by = String(actor).slice(0, 200);
  patch.attested_at = now.toISOString();
  return patch;
}
