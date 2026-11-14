export {redactSensitiveText,redactPromptPayload} from '../../telephony/src/lib/redaction.js';
import {redactTranscriptEntries} from '../../telephony/src/lib/redaction.js';
export const redactDiarizedTranscript=redactTranscriptEntries;
export function applyDeepgramRedactionParams(url){for(const group of ['pii','phi','pci'])url.searchParams.append('redact',group);return url;}
