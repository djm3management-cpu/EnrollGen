const REDACTION_RULES = [
  {
    pattern: /\b[1-9][A-HJ-NP-Z][A-HJ-NP-Z0-9]\d[-\s]?[A-HJ-NP-Z][A-HJ-NP-Z0-9]\d[-\s]?[A-HJ-NP-Z]{2}\d{2}\b/gi,
    replacement: "[MBI_REDACTED]",
  },
  {
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  {
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[PAYMENT_CARD_REDACTED]",
  },
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE_REDACTED]",
  },
  {
    pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    replacement: "[EMAIL_REDACTED]",
  },
  {
    pattern: /\b(?:date\s*of\s*birth|dob|born|birthday)\s*(?:is|:)?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    replacement: "[DOB_REDACTED]",
  },
  {
    pattern: /\b(?:date\s*of\s*birth|dob|born|birthday)\s*(?:is|:)?\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{2,4}\b/gi,
    replacement: "[DOB_REDACTED]",
  },
  {
    pattern: /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19[2-9]\d|20[0-2]\d)\b/g,
    replacement: "[DOB_REDACTED]",
  },
  {
    pattern: /\b\d{1,6}\s+[\w\s.'-]{2,40}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|circle|cir|place|pl|terrace|ter|parkway|pkwy)\b/gi,
    replacement: "[ADDRESS_REDACTED]",
  },
  {
    pattern: /\b((?:medicaid|member|membership|account|policy|subscriber|beneficiary)\s*(?:number|num|id)?)\s*(?:is|:)?\s*[A-Z0-9][A-Z0-9-]{3,}\b/gi,
    replacement: "$1: [ID_REDACTED]",
  },
];

export function redactSensitiveText(value) {
  if (typeof value !== "string" || !value) return "";
  return REDACTION_RULES.reduce(
    (text, rule) => text.replace(rule.pattern, rule.replacement),
    value
  );
}

export function redactTranscriptEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    ...entry,
    text: redactSensitiveText(entry?.text || ""),
  }));
}
