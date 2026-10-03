import { randomBytes, createHash } from 'node:crypto';
import { EvidenceError, checked, resolveEvidenceIdentity, canImportForOthers, requireOwnedSession } from './_evidenceAccess.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function recordingIdentity(db, auth) {
  if (!auth.userId || auth.userId === 'dev-bypass') throw new EvidenceError(401, 'Sign in to access recordings.');
  if (auth.orgId && ['org:admin', 'admin'].includes(auth.tokenPayload?.org_role)) {
    const tenant = checked(await db.from('tenants').select('*').eq('clerk_org_id', auth.orgId).maybeSingle());
    if (!tenant || !canImportForOthers(auth, tenant)) throw new EvidenceError(403, 'Organization is unavailable.');
    return { tenant, admin: true, auth };
  }
  const identity = await resolveEvidenceIdentity(db, auth);
  const agents = checked(await db.from('recording_agent_subjects').select('agent_slug')
    .eq('tenant_id', identity.tenant.id).eq('clerk_user_id', auth.userId).limit(2)) || [];
  if (agents.length > 1) throw new EvidenceError(403, 'Telephony identity is ambiguous.');
  return { ...identity, admin: false, auth, slug: agents[0]?.agent_slug || null };
}

export async function authorizeRecordingTarget(db, identity, target) {
  const callId = target.call_record_id;
  const inboundId = target.inbound_call_id;
  if (Boolean(callId) === Boolean(inboundId) || !UUID.test(callId || inboundId || '')) {
    throw new EvidenceError(400, 'Choose one call or inbound-call ID.');
  }
  const tenantId = identity.tenant.id;
  if (callId) {
    const record = checked(await db.from('call_records').select('*').eq('id', callId).eq('tenant_id', tenantId).maybeSingle());
    if (!record) throw new EvidenceError(403, 'Call is unavailable.');
    const attempts = checked(await db.from('telephony_call_attempts').select('parent_call_sid, agent_id')
      .eq('tenant_id', tenantId).eq('call_record_id', callId).limit(100)) || [];
    if (!identity.admin) {
      // The existing link RPC consults a mutable CRM roster. A forged link
      // must not let an owned session borrow another subject's actual call.
      if (attempts.some(attempt => !identity.slug || attempt.agent_id !== identity.slug)) {
        throw new EvidenceError(403, 'Call attribution does not match this agent.');
      }
      let owned = false;
      if (record.session_id) {
        // A protected session supplies ownership; a writable name/agent field
        // on a legacy CRM row never grants access by itself.
        const session = await requireOwnedSession(db, record.session_id, identity);
        owned = session.call_record_id === record.id;
      } else if (identity.slug) {
        const attempts = checked(await db.from('telephony_call_attempts').select('id')
          .eq('tenant_id', tenantId).eq('call_record_id', callId).eq('agent_id', identity.slug).limit(1));
        owned = Boolean(attempts?.length);
      }
      if (!owned) throw new EvidenceError(403, 'Call is unavailable for this agent.');
    }
    let trustedSid = attempts[0]?.parent_call_sid;
    if (!trustedSid && identity.admin && record.twilio_call_sid) {
      trustedSid = checked(await db.from('recording_call_scopes').select('call_sid')
        .eq('tenant_id', tenantId).eq('call_sid', record.twilio_call_sid).maybeSingle())?.call_sid;
    }
    return { record, field: 'call_record_id', id: callId, trustedSid };

  }
  const inbound = checked(await db.from('inbound_calls').select('*').eq('id', inboundId).eq('tenant_id', tenantId).maybeSingle());
  if (!inbound) throw new EvidenceError(403, 'Inbound call is unavailable.');
  const scope = checked(await db.from('recording_call_scopes').select('*')
    .eq('tenant_id', tenantId).eq('inbound_call_id', inboundId).maybeSingle());
  if (!scope) throw new EvidenceError(403, 'Inbound recording attribution is unavailable.');
  if (!identity.admin) {
    const attempts = checked(await db.from('telephony_call_attempts').select('agent_id, call_record_id, answered_at')
      .eq('tenant_id', tenantId).eq('inbound_call_id', inboundId).order('answered_at', { ascending: false, nullsFirst: false }).limit(10)) || [];
    const answered = attempts.find(attempt => attempt.answered_at);
    const owner = answered?.agent_id || attempts[0]?.agent_id;
    // Shared voicemail classification comes from service-written routing events,
    // not inbound_calls.status or its mutable call_record_id/agent pointers.
    const sharedVoicemail = scope.shared_voicemail && !answered;
    if (!sharedVoicemail && (!identity.slug || owner !== identity.slug)) {
      throw new EvidenceError(403, 'Inbound call is unavailable for this agent.');
    }
  }
  return { record: inbound, field: 'inbound_call_id', id: inboundId, trustedSid: scope.call_sid };
}

export function twilioReference(url) {
  const match = /^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/(AC[0-9a-f]{32})\/Recordings\/(RE[0-9a-f]{32})(?:\.(?:wav|mp3))?(?:\?[^#]*)?$/i.exec(url || '');
  return match ? { account_sid: match[1], recording_sid: match[2] } : null;
}
export async function listTargetRecordings(db, identity, target) {
  const rows = checked(await db.from('recording_ingestion').select('*')
    .eq('tenant_id', identity.tenant.id).eq(target.field, target.id)
    .order('first_seen_at', { ascending: true }).limit(500)) || [];
  // Legacy CRM URLs are mutable. Tie them to a service-owned call SID; the
  // provider proxy additionally verifies RecordingSid -> CallSid before media.
  if (identity.admin && target.trustedSid) {
    const related = checked(await db.from('recording_ingestion').select('*')
      .eq('tenant_id', identity.tenant.id).eq('parent_call_sid', target.trustedSid)
      .order('first_seen_at', { ascending: true }).limit(500)) || [];
    for (const row of related) if (!rows.some(existing => existing.id === row.id)) rows.push(row);
  }
  const references = target.trustedSid ? [target.record] : [];
  if (target.field === 'call_record_id' && target.trustedSid) {
    references.push(...(checked(await db.from('inbound_calls').select('*')
      .eq('tenant_id', identity.tenant.id).eq('call_record_id', target.id).limit(10)) || []));
  }
  for (const reference of references) {
    const twilio = twilioReference(reference.recording_url);
    if ((!twilio && !reference.recording_storage_path) || rows.some(r =>
      (twilio && r.recording_sid === twilio.recording_sid) ||
      (reference.recording_storage_path && r.storage_path === reference.recording_storage_path))) continue;
    const safePath = reference.recording_storage_path === `${identity.tenant.id}/${target.trustedSid}.wav` ? reference.recording_storage_path : null;
    if (!twilio && !safePath) continue;
    rows.push({ id: `legacy:${reference.id}`, ...twilio, expected_call_sid: target.trustedSid, recording_url: reference.recording_url,
      storage_path: safePath, copy_status: safePath ? 'stored' : 'legacy',
      direction: reference.status === 'voicemail' ? 'voicemail' : reference.call_direction,
      recording_channels: reference.status === 'voicemail' ? 1 : null,
      first_seen_at: reference.created_at || reference.call_start });
  }
  return rows;
}
export function publicRecording(row) {
  return { id: row.id, recording_sid: row.recording_sid || null, status: row.copy_status,
    channels: row.recording_channels || (row.direction === 'voicemail' ? 1 : 2),
    duration_seconds: row.recording_duration_seconds ?? null,
    created_at: row.provider_created_at || row.first_seen_at,
    error: row.last_error_code || null,
    provider_available: Boolean(row.recording_sid && row.account_sid && row.provider_status !== 'absent' && row.copy_status !== 'absent'),
    available: Boolean(row.storage_path || (row.recording_sid && row.account_sid && row.provider_status !== 'absent')) };
}
export async function recordingMediaGrant(db, identity, row, { download = false, forceProvider = false, env = process.env } = {}) {
  const filename = `recording-${row.recording_sid || String(row.id).replace(/[^a-z0-9-]/gi, '')}.wav`;
  if (row.storage_path && !forceProvider) {
    const parts = row.storage_path.split('/');
    if (parts[0] !== identity.tenant.id || parts.some(part => !part || part === '.' || part === '..')) {
      throw new EvidenceError(403, 'Recording path is unavailable.');
    }
    const { data, error } = await db.storage.from('call-recordings').createSignedUrl(row.storage_path, 300,
      download ? { download: filename } : undefined);
    if (!error && data?.signedUrl) return { url: data.signedUrl, expires_in: 300, filename, source: 'storage' };
    // A missing/corrupt Storage copy must not hide the retained provider copy.
  }
  if (!row.account_sid || !row.recording_sid || row.provider_status === 'absent' || row.copy_status === 'absent') {
    throw new EvidenceError(404, 'Recording audio is unavailable.');
  }
  const base = env.TELEPHONY_BASE_URL || env.VITE_TELEPHONY_BASE_URL;
  let url;
  try { url = new URL(base); } catch { throw new EvidenceError(503, 'Recording download service is not configured.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new EvidenceError(503, 'Recording download service is not configured.');
  }
  const token = randomBytes(32).toString('base64url');
  checked(await db.from('recording_download_tickets').insert({ token_hash: createHash('sha256').update(token).digest('hex'),
    tenant_id: identity.tenant.id, account_sid: row.account_sid, recording_sid: row.recording_sid,
    channels: row.recording_channels || (row.direction === 'voicemail' ? 1 : 2),
    expected_call_sid: row.callback_call_sid || row.expected_call_sid, download,
    expires_at: new Date(Date.now() + 300_000).toISOString() }));
  return { url: `${url.href.replace(/\/$/, '')}/api/recordings/media/${token}`, expires_in: 300, filename, source: 'twilio' };
}
