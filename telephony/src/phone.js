// Mirrors public.normalize_phone_e164 in migration 017 so the
// service and the database agree on the matching key.
export function normalizePhoneE164(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (/^\+[0-9]{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (/^1[0-9]{10}$/.test(digits)) return `+${digits}`;
  if (/^[0-9]{10}$/.test(digits)) return `+1${digits}`;
  return null;
}
