import {recordingBlocked} from '../telephony/src/lib/recordingAvailability.js';
import { auditedEvidenceAccess } from '../telephony/src/lib/evidenceAudit.js';
import { evidenceCheckpoint, evidenceGrantId } from '../telephony/src/lib/evidenceAudit.js';
import {deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import { randomBytes, createHash } from 'node:crypto';
export class RecordingLinkError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const EvidenceError=RecordingLinkError;
const checked=({data,error})=>{if(error)throw error;return data;};

async function rawrecordingComplianceGrant(db, identity, row, { format = 'wav', env = process.env } = {}) {
  if(await recordingBlocked(db,row))throw new EvidenceError(404,'Recording unavailable.');
  if (!identity.admin) throw new EvidenceError(403, 'Only organization admins can create Conversly links.');
  if (!['wav', 'mp3'].includes(format)) throw new EvidenceError(400, 'Choose WAV or MP3.');
  if (row.tenant_id && row.tenant_id !== identity.tenant.id) throw new EvidenceError(403, 'Recording is unavailable.');
  const storagePath = format === 'wav' ? row.storage_path || null : null;
  if (storagePath) {
    const parts = storagePath.split('/');
    if (parts[0] !== identity.tenant.id || parts.some(part => !part || part === '.' || part === '..')) {
      throw new EvidenceError(403, 'Recording path is unavailable.');
    }
  }
  const expectedCall = row.callback_call_sid || row.expected_call_sid;
  const provider = /^AC[0-9a-f]{32}$/i.test(row.account_sid || '') && /^RE[0-9a-f]{32}$/i.test(row.recording_sid || '') &&
    /^CA[0-9a-f]{32}$/i.test(expectedCall || '') && row.provider_status !== 'absent' && row.copy_status !== 'absent';
  if (!storagePath && !provider) throw new EvidenceError(404,
    format === 'mp3' ? 'MP3 requires a retained Twilio recording.' : 'Recording audio is unavailable.');
  let base;
  try { base = new URL(deploymentProfile(env).telephonyOrigin); } catch { /* Checked below. */ }
  if (!base || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new EvidenceError(503, 'Recording download service is not configured.');
  }
  await evidenceCheckpoint(db,{actor:identity.auth.userId,tenant:identity.tenant.id,resource:'recording',resourceId:row.id,action:'export',grantId:evidenceGrantId()});
  const token = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 86_400_000).toISOString();
  checked(await db.from('recording_compliance_tickets').insert({
    token_hash: createHash('sha256').update(token).digest('hex'), tenant_id: identity.tenant.id,
    recording_id: row.id, minted_by: identity.auth.userId, grant_id:evidenceGrantId(), format, storage_path: storagePath,
    account_sid: provider ? row.account_sid : null, recording_sid: provider ? row.recording_sid : null,
    expected_call_sid: provider ? expectedCall : null, channels: row.recording_channels || (row.direction === 'voicemail' ? 1 : 2),
    created_at: createdAt.toISOString(), expires_at: expiresAt,
  }));
  return { url: `${base.href.replace(/\/$/, '')}/api/recordings/conversly/${token}${format === 'mp3' ? '.mp3' : ''}`,
    expires_in: 86_400, expires_at: expiresAt, format, content_type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
    filename: `recording-${row.recording_sid || String(row.id).replace(/[^a-z0-9-]/gi, '')}.${format}` };
}

export async function recordingComplianceGrant(db,identity,row,options={}){
 return auditedEvidenceAccess(db,{actor:identity.auth?.userId,tenant:identity.tenant.id,resource:'recording',resourceId:row.id,action:'export'},()=>rawrecordingComplianceGrant(db,identity,row,options));
}
