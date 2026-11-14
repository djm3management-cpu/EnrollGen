import { auditedEvidenceAccess, EvidenceAuditError } from '../../telephony/src/lib/evidenceAudit.js';
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';
import { resolveDeploymentAccess,signedDeploymentAdmin } from '../../telephony/src/lib/deploymentAccess.js';
import { createSupabaseClient as createClient, supabaseSecretKey } from "../../integrations/supabase.js";

export class EvidenceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function getEvidenceServiceClient(env = process.env) {
  if (!env.SUPABASE_URL || !supabaseSecretKey(env)) {
    throw new EvidenceError(503, "Evidence service is not configured.");
  }
  return createClient(env.SUPABASE_URL, supabaseSecretKey(env), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function evidenceJson(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function evidenceFailure(error) {
  // SQL errors can contain submitted transcript/flag text. Never expose or log it.
  return evidenceJson(error instanceof EvidenceError || error instanceof EvidenceAuditError ? error.status : 503, {
    error: error instanceof EvidenceError || error instanceof EvidenceAuditError ? error.message : "Evidence request failed. Please retry.",
  });
}

export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function resolveEvidenceIdentity(db, auth) {
  let access;
  try { access = await resolveDeploymentAccess(db, auth.userId, auth.orgId || auth.tokenPayload?.o?.id || null); }
  catch (error) { throw new EvidenceError(error.status || 503, error.message); }
  const agent = checked(await db.from('enrolled_agents').select('id,tenant_id,clerk_user_id,name,npn,is_active')
    .eq('tenant_id',access.tenant_id).eq('id',access.agent_id).eq('clerk_user_id',auth.userId).eq('is_active',true).single());
  const tenant = checked(await db.from('tenants').select('*').eq('id',access.tenant_id).single());
  if (!agent || !tenant) throw new EvidenceError(403, 'Agency membership unavailable.');
  return { agent, tenant, access };
}

// Admin authority comes from verified Clerk claims, never a submitted role,
// display name, NPN, or the browser-writable CRM roster.
export function hasTenantAdminRole(auth) {
  return signedDeploymentAdmin(auth?.tokenPayload || {},auth?.orgId);
}

export async function resolveCallAccessIdentity(db, auth) {
  const identity = await resolveEvidenceIdentity(db, auth);
  return { ...identity, admin: identity.access.authority === 'admin' || hasTenantAdminRole(auth), auth };
}

export function scopeCallToIdentity(query, identity) {
  query=query.eq('tenant_id',identity.tenant.id);
  return identity.admin ? query : query.eq('agent_id',identity.agent.id);
}

// For service-only timeline views carrying a protected enrolled-agent UUID.
// Tenant/admin flags come only from resolveCallAccessIdentity above.
export function scopeCallLogToIdentity(query,identity) {
 query=query.eq('tenant_id',identity.tenant.id);
 return identity.admin ? query : query.eq('owner_agent_id',identity.agent.id);
}

export function canImportForOthers(auth, tenant) {
  // Callers have already resolved their protected enrolled membership.
  const orgId=auth.orgId || auth.tokenPayload?.o?.id;
  return hasTenantAdminRole(auth) && (!orgId || orgId===tenant.clerk_org_id);
}

export async function requireOwnedSession(db, id, identity) {
  if (!id) throw new EvidenceError(400, "Session ID is required.");
  const session = checked(await db.from("sessions").select("*")
    .eq("id", id).eq("agent_id", identity.agent.id)
    .eq("tenant_id", identity.tenant.id).maybeSingle());
  if (!session) throw new EvidenceError(403, "Session is unavailable for this agent.");
  return session;
}

export async function requireOwnedTranscript(db, id, identity) {
  const transcript = checked(await db.from("call_transcripts").select("*")
    .eq("id", id).eq("tenant_id", identity.tenant.id).maybeSingle());
  if (!transcript) throw new EvidenceError(403, "Transcript is unavailable for this agent.");
  if (transcript.owner_agent_id != null) {
    if (transcript.owner_agent_id !== identity.agent.id) {
      throw new EvidenceError(403, "Transcript is unavailable for this agent.");
    }
  } else {
    await requireOwnedSession(db, transcript.session_id, identity);
  }
  return transcript;
}

export async function bindPostCallPayload(db, payload, identity) {
  if (payload.agent_id && payload.agent_id !== identity.agent.id) {
    throw new EvidenceError(403, "Agent identity does not match the signed-in user.");
  }
  if (payload.tenant_id && payload.tenant_id !== identity.tenant.id) {
    throw new EvidenceError(403, "Tenant does not match the signed-in user.");
  }
  let record;
  if (payload.call_record_id) {
    record = checked(await db.from("call_records").select("id, session_id, transcript_id, agent_id, tenant_id")
      .eq("id", payload.call_record_id).eq("tenant_id", identity.tenant.id).maybeSingle());
    if (!record || record.agent_id !== identity.agent.id) {
      throw new EvidenceError(403, "Call is unavailable for this agent.");
    }
  }
  const session = await requireOwnedSession(db, payload.session_id || record?.session_id, identity);
  if (!record && session.call_record_id) {
    record = checked(await db.from("call_records").select("id, session_id, transcript_id, agent_id, tenant_id")
      .eq("id", session.call_record_id).eq("tenant_id", identity.tenant.id).maybeSingle());
    if (!record || record.agent_id !== identity.agent.id) {
      throw new EvidenceError(403, "Call is unavailable for this agent.");
    }
  }
  if (record && (record.session_id !== session.id
    || (session.call_record_id && session.call_record_id !== record.id))) {
    throw new EvidenceError(403, "Call does not belong to this session.");
  }
  for (const id of new Set([payload.transcript_id, record?.transcript_id].filter(Boolean))) {
    const transcript = await requireOwnedTranscript(db, id, identity);
    if (transcript.session_id !== session.id) throw new EvidenceError(403, "Transcript does not belong to this session.");
  }
  if (payload.contact_id) {
    const contact = checked(await db.from("contacts").select("id,assigned_agent_id")
      .eq("id", payload.contact_id).eq("tenant_id", identity.tenant.id).maybeSingle());
    if (!contact || (!identity.admin && contact.assigned_agent_id !== identity.access.agent_slug)) throw new EvidenceError(403, "Contact is unavailable for this agent.");
  }
  return { ...payload, call_record_id: record?.id || null, session_id: session.id, agent_id: identity.agent.id,
    writing_agent: identity.agent.name, agent_name: identity.agent.name };
}

export function missingOwnerColumn(error) {
  return ["42703", "PGRST204"].includes(error?.code)
    && /owner_agent_id/.test(error?.message || "");
}

export async function writeOwnedTranscript(db, payload, ownerId, transcriptId = null) {
  const write = async (row) => {
    const table = db.from("call_transcripts");
    const query = transcriptId
      ? table.update(row).eq("id", transcriptId).eq("tenant_id", payload.tenant_id)
      : table.insert(row);
    return query.select("*").single();
  };
  let result = await write({ ...payload, owner_agent_id: ownerId });
  if (missingOwnerColumn(result.error)) {
    // Before 063, a server-owned session preserves the same authorization.
    if (!payload.session_id) throw new EvidenceError(503, "Transcript ownership could not be recorded.");
    result = await write(payload);
  }
  return checked(result);
}

export async function auditedEvidenceRequest(db,auth,request,resource,resolve,work) {
 const url=new URL(request.url);
 let action=url.searchParams.get('export')==='1'?'export':request.method==='GET'?'list':'read',resourceId=url.searchParams.get('id') || url.searchParams.get('call_id') || url.searchParams.get('contact_id') || url.searchParams.get('call_record_id') || url.searchParams.get('inbound_call_id') || url.searchParams.get('attempt_id');
 if(request.method==='POST'){
  try {const input=await request.clone().json();resourceId=input.session_id || input.recordingId || input.callId || input.recording_id || input.call_record_id || input.inbound_call_id || input.attempt_id || input.call_id || resourceId;
   action=['conversly','export'].includes(input.action)?'export':input.action==='media'?(input.download?'download':'play'):action;
  }catch{ /* The handler returns its bounded validation error. */ }
 }
 return auditedEvidenceAccess(db,{actor:auth.userId,tenant:deploymentProfile().tenantId,resource,resourceId,action},async()=>work(await resolve(db,auth)));
}
