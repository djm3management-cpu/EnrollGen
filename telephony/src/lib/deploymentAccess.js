// Call only after verifying the Clerk token. Never pass request body/header
// identity fields. SQL is the single authoritative membership implementation.
export async function resolveDeploymentAccess(db, subject, organization = null) {
  if (!subject || subject === 'dev-bypass') throw Object.assign(Error('Sign in to access this agency.'), { status: 401 });
  const { data, error } = await db.rpc('resolve_deployment_subject', { p_subject: subject, p_org: organization });
  if (error) throw Object.assign(Error('Deployment membership unavailable.'), { status: 503 });
  if (!Array.isArray(data) || data.length !== 1) throw Object.assign(Error('Active deployment membership required.'), { status: 403 });
  return data[0];
}

// Classification of an already verified signed payload, used only AFTER the
// protected membership resolver succeeds. Never call with request-body data.
export function signedDeploymentAdmin(payload={},organization=null) {
  const roles=values=>values.filter(Boolean).some(value=>['admin','org:admin','owner','org:owner'].includes(String(value).toLowerCase()));
  return Boolean(((organization||payload.o?.id) && roles([payload.org_role,payload.o?.rol]))
    || roles([payload.role,payload.public_metadata?.role,payload.private_metadata?.role,payload.metadata?.role])
    || payload.public_metadata?.isAdmin===true || payload.metadata?.isAdmin===true);
}
