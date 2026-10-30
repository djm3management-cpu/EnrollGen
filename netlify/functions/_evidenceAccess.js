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
  return evidenceJson(error instanceof EvidenceError ? error.status : 503, {
    error: error instanceof EvidenceError ? error.message : "Evidence request failed. Please retry.",
  });
}

export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function resolveEvidenceIdentity(db, auth, { provision = false } = {}) {
  if (!auth.userId || auth.userId === "dev-bypass") {
    throw new EvidenceError(401, "Sign in to access evidence.");
  }
  const rows = checked(await db.from("enrolled_agents")
    .select("id, tenant_id, clerk_user_id, name, npn, is_active")
    .eq("clerk_user_id", auth.userId).limit(2)) || [];
  if (rows.length > 1) throw new EvidenceError(403, "Agent identity is ambiguous. Contact your administrator.");

  let agent = rows[0];
  if (agent && agent.is_active !== true) throw new EvidenceError(403, "Agent is inactive.");
  let tenant;
  if (agent) {
    tenant = checked(await db.from("tenants").select("*").eq("id", agent.tenant_id).maybeSingle());
    if (!tenant || (auth.orgId && tenant.clerk_org_id !== auth.orgId)) {
      throw new EvidenceError(403, "Agent does not belong to the signed-in organization.");
    }
  } else {
    // A signed Clerk organization claim is required for self-provisioning.
    // No default NGHS tenant, body-supplied identity, roster role, or name fallback.
    if (!provision || !auth.orgId) throw new EvidenceError(403, "Agent membership has not been provisioned.");
    tenant = checked(await db.from("tenants").select("*").eq("clerk_org_id", auth.orgId).maybeSingle());
    if (!tenant) throw new EvidenceError(403, "Organization is not configured.");
    agent = checked(await db.from("enrolled_agents").insert({
      tenant_id: tenant.id, clerk_user_id: auth.userId,
      name: auth.tokenPayload?.name || "Agent", role: "agent", is_active: true,
    }).select("id, tenant_id, clerk_user_id, name, npn, is_active").single());
  }
  return { agent, tenant };
}

// Admin authority comes from verified Clerk claims, never a submitted role,
// display name, NPN, or the browser-writable CRM roster.
export function hasTenantAdminRole(auth) {
  const payload=auth?.tokenPayload || {};
  const orgId=auth?.orgId || payload.o?.id;
  const isAdmin=roles=>roles.filter(Boolean).some(value=>['admin','org:admin','owner','org:owner'].includes(String(value).toLowerCase()));
  return Boolean((orgId && isAdmin([payload.org_role,payload.o?.rol]))
    || isAdmin([payload.role,payload.public_metadata?.role,payload.private_metadata?.role,payload.metadata?.role])
    || payload.public_metadata?.isAdmin===true || payload.metadata?.isAdmin===true);
}

export async function resolveCallAccessIdentity(db, auth) {
  if(!auth.userId || auth.userId==='dev-bypass')throw new EvidenceError(401,'Sign in to access calls.');
  auth={...auth,orgId:auth.orgId || auth.tokenPayload?.o?.id || null};
  if(hasTenantAdminRole(auth)) {
    // Global Clerk admin metadata can be used without an active organization,
    // but only the protected active enrolled membership supplies the tenant.
    if(!auth.orgId)return {...await resolveEvidenceIdentity(db,auth),admin:true,auth};
    const tenant=checked(await db.from('tenants').select('*').eq('clerk_org_id',auth.orgId).maybeSingle());
    if(!tenant || tenant.clerk_org_id!==auth.orgId)throw new EvidenceError(403,'Organization is unavailable.');
    return {tenant,admin:true,auth};
  }
  return {...await resolveEvidenceIdentity(db,auth),admin:false,auth};
}

export function scopeCallToIdentity(query, identity) {
  query=query.eq('tenant_id',identity.tenant.id);
  return identity.admin ? query : query.eq('agent_id',identity.agent.id);
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
    const contact = checked(await db.from("contacts").select("id")
      .eq("id", payload.contact_id).eq("tenant_id", identity.tenant.id).maybeSingle());
    if (!contact) throw new EvidenceError(403, "Contact is unavailable in this tenant.");
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
