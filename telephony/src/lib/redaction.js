const REDACTION_RULES = [
  {pattern:/\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g,replacement:'[DOB_REDACTED]'},
  {pattern:/\b(?:19|20)\d{2}-[01]\d-[0-3]\d\b/g,replacement:'[DATE_REDACTED]'},
  {pattern:/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+(?:19|20)\d{2}\b/gi,replacement:'[DATE_REDACTED]'},
  {pattern:/\b(?:routing|account|bank|card|cvv|cvc|security code)\s*(?:number|no\.?|num)?\s*(?:is|:|=)?\s*\d[\d -]{2,25}\b/gi,replacement:'[PAYMENT_REDACTED]'},

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
    pattern: /\b((?:medicaid|member|membership|account|policy|subscriber|beneficiary)\s*(?:number|num|id)?)\s*(?:is|:)?\s*(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,}\b/gi,
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

export function redactTranscriptEntries(entries = [], {omitSensitiveUtterances=false} = {}) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    ...entry,
    // Optional strict minimization for derivative coaching: omit the whole
    // utterance around identifier labels, including spoken/unusual formats.
    // Existing callers retain exactly the established redaction behavior.
    text: omitSensitiveUtterances && /\b(?:social security|SSN|MBI|date of birth|DOB|born|birthday|address|street|avenue|boulevard|routing|bank|payment|credit card|debit card|CVV|CVC|security code|account number|medicare (?:number|id|card|is)|member (?:number|id)|january|february|march|april|june|july|august|september|october|november|december)\b/i.test(entry?.text||'')
      ? '[SENSITIVE_UTTERANCE_REDACTED]' : redactSensitiveText(entry?.text || ""),
  }));
}

// Apply to every prompt component, including tool arguments and schemas. Keys
// with structured identifiers cannot evade regexes by using short/local values.
export function redactPromptPayload(value,key='') {
 if(value===null || value===undefined)return value;
 if(/^(?:dob|date_?of_?birth|birth_?date|phone|phone_?number|mobile|ssn|social_?security|mbi|mbi_full|medicare_?number|address|street_?address|card_?number|cvv|cvc|routing_?number|account_?number)$/i.test(key)){
  // Preserve tool/response schema structure; identifier examples/defaults are
  // data, while type/ref/combinator definitions are instructions.
  if(value && typeof value==='object' && !Array.isArray(value) && ['type','$ref','anyOf','oneOf','allOf'].some(k=>Object.hasOwn(value,k))){
   return redactPromptPayload(Object.fromEntries(Object.entries(value).filter(([k])=>!['default','examples','enum','const'].includes(k))));
  }
  return '[REDACTED]';
 }
 if(typeof value==='string'){
  if(/^\s*[[{]/.test(value)){try{return JSON.stringify(redactPromptPayload(JSON.parse(value)));}catch{/* Scrub ordinary text below. */}}
  return redactSensitiveText(value);
 }
 if(Array.isArray(value))return value.map(item=>redactPromptPayload(item));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactPromptPayload(v,k)]));
 return value;
}
export function safeDiagnosticCode(error) {
 const code=error?.code;
 return /^(?:[0-9]{2}[0-9A-Z]{3}|PGRST[0-9]{3}|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/.test(code || '') ? code : 'request_failed';
}
