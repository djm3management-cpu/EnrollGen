import {securityEvent,setVerifiedLogSubject} from './lib/logger.js';
import {allowedBrowserOrigin,jwtVerificationOptions,assertTokenBoundary} from './lib/browserBoundary.js';
import { supabase } from './supabase.js';
import { resolveDeploymentAccess,signedDeploymentAdmin } from './lib/deploymentAccess.js';
import { verifyToken } from "@clerk/backend";
import { config } from "./config.js";

// Verifies the Clerk session bearer token on browser-facing endpoints.
// Returns the token payload, or null after writing the 401 response.
export async function requireClerkUser(req, res) {
  if(!allowedBrowserOrigin(req.header("origin"))){securityEvent("authorization_denied");res.status(403).json({error:"Origin forbidden"});return null;}
  const header = req.header("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    securityEvent("verification_failed",{reason:"missing_token"});
    res.status(401).json({ error: "Missing Bearer token" });
    return null;
  }
  try {
    const payload = await verifyToken(header.slice(7).trim(), {
      secretKey: config.clerkSecretKey,
      jwtKey: config.clerkJwtKey,
      ...jwtVerificationOptions(),
    });
    assertTokenBoundary(payload);
    setVerifiedLogSubject(payload.sub);
    const deploymentIdentity = await resolveDeploymentAccess(supabase, payload.sub, payload.org_id || payload.o?.id || null);
    const authority=deploymentIdentity.authority==='admin'||signedDeploymentAdmin(payload,payload.org_id)?'admin':deploymentIdentity.authority;
    return { ...payload, deploymentIdentity:{...deploymentIdentity,authority} };
  } catch (error) {
    if (error.status) { res.status(error.status).json({ error: 'request_failed' }); return null; }
    securityEvent("verification_failed",{reason:"invalid_token"});
    res.status(401).json({ error: "Invalid or expired Clerk session token" });
    return null;
  }
}
