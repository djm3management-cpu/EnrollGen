/**
 * PHI/PII Redaction Engine
 * Redacts sensitive information from transcripts BEFORE sending to LLM.
 */

const PHI_PATTERNS = [
  { type: 'MBI', pattern: /\b[1-9][A-Z][A-Z0-9]\d[A-Z][A-Z0-9]\d[A-Z]{2}\d{2}\b/gi, token: '[MBI_REDACTED]' },
  { type: 'SSN', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, token: '[SSN_REDACTED]' },
  { type: 'SSN', pattern: /\b(?:social\s*security\s*(?:number)?)\s*(?:is\s*)?(\d[\d\s-]{8,}\d)\b/gi, token: '[SSN_REDACTED]' },
  { type: 'DOB', pattern: /\b(?:date\s*of\s*birth|DOB|born\s*on|birthday)\s*(?:is\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi, token: '[DOB_REDACTED]' },
  { type: 'DOB', pattern: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19[2-9]\d|20[0-2]\d)\b/g, token: '[DOB_REDACTED]' },
  { type: 'PHONE', pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, token: '[PHONE_REDACTED]' },
  { type: 'ADDRESS', pattern: /\b\d{1,5}\s+[\w\s]{2,30}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|circle|cir|place|pl)\b/gi, token: '[ADDRESS_REDACTED]' },
  { type: 'HEALTH_CONDITION', pattern: /\b(?:diagnosed\s+with|suffering\s+from|being\s+treated\s+for|history\s+of)\s+([^,.;]{3,50})\b/gi, token: '[CONDITION_REDACTED]' },
];

export function redactPHI(text) {
  if (!text) return { redacted: '', redactions: [] };

  let redacted = text;
  const redactions = [];

  for (const { type, pattern, token } of PHI_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      redactions.push({
        redaction_type: type,
        original_position_start: match.index,
        original_position_end: match.index + match[0].length,
        replacement_token: token,
      });
    }
    redacted = redacted.replace(pattern, token);
  }

  return { redacted, redactions };
}

export function redactTranscriptSegments(segments) {
  return segments.map(seg => {
    const { redacted, redactions } = redactPHI(seg.text);
    return { ...seg, text: redacted, phi_redactions: redactions };
  });
}
