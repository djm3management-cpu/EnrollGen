import { recordingComplianceGrant as mint, RecordingLinkError } from '../../integrations/recordingComplianceGrant.js';
import { EvidenceError } from './_evidenceAccess.js';

export async function recordingComplianceGrant(...args) {
  try { return await mint(...args); }
  catch(error) {
    if(error instanceof RecordingLinkError)throw new EvidenceError(error.status,error.message);
    throw error;
  }
}
