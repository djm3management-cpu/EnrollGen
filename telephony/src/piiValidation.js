// A2P 10DLC compliance: outbound SMS must never carry SSN, MBI, or a
// full DOB in the body. Narrower than the transcript redaction rules
// (netlify/functions/_redaction.js) — phone/email/address routinely
// appear in legitimate SMS ("call us at...") and aren't blocked here;
// this only rejects the identifier classes carriers penalize A2P
// senders for transmitting in plain text.
const PII_PATTERNS = [
  {
    label: "SSN",
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,
  },
  {
    label: "MBI",
    pattern: /\b[1-9][A-HJ-NP-Z][A-HJ-NP-Z0-9]\d[-\s]?[A-HJ-NP-Z][A-HJ-NP-Z0-9]\d[-\s]?[A-HJ-NP-Z]{2}\d{2}\b/i,
  },
  {
    label: "date of birth",
    pattern: /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19[2-9]\d|20[0-2]\d)\b/,
  },
  {
    label: "date of birth",
    pattern: /\b(?:date\s*of\s*birth|dob|born|birthday)\s*(?:is|:)?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i,
  },
];

// Returns { blocked: false } or { blocked: true, reason }. Never
// throws — callers decide what to do with the result.
export function validateOutboundSms(body) {
  const text = String(body || "");
  for (const { label, pattern } of PII_PATTERNS) {
    if (pattern.test(text)) {
      return { blocked: true, reason: `Message appears to contain a ${label} — remove it before sending.` };
    }
  }
  return { blocked: false };
}
