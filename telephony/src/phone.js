// Shared browser normalization; keep in sync with the database and telephony helper.
export function normalizePhoneE164(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (/^1[0-9]{10}$/.test(digits)) return `+${digits}`;
  if (/^[0-9]{10}$/.test(digits)) return `+1${digits}`;
  if (/^\+[1-9][0-9]{7,14}$/.test(raw.trim())) return raw.trim();
  return null;
}
