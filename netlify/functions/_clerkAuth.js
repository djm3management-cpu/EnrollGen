import {securityEvent,setVerifiedLogSubject} from '../../telephony/src/lib/logger.js';
import {allowedBrowserOrigin,jwtVerificationOptions,assertTokenBoundary} from '../../telephony/src/lib/browserBoundary.js';
import { assertSafeAuthEnvironment } from "../../integrations/authSafety.js";
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import { verifyToken } from "@clerk/backend";

deploymentProfile();

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";

  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
}

export async function requireClerkAuth(request) {
  assertSafeAuthEnvironment();
  if(!allowedBrowserOrigin(request.headers.get("origin"))){securityEvent("authorization_denied");return {response:jsonResponse(403,{error:"Origin forbidden"})};}
  const secretKey = process.env.CLERK_SECRET_KEY;
  const jwtKey = process.env.CLERK_JWT_KEY;

  if (!secretKey && !jwtKey) {
    securityEvent("configuration_failed");
    return {
      response: jsonResponse(500, {
        error: "Server configuration error",
        detail: "Set CLERK_SECRET_KEY or CLERK_JWT_KEY in Netlify environment variables.",
      }),
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    securityEvent("verification_failed",{reason:"missing_token"});
    return {
      response: jsonResponse(401, {
        error: "Unauthorized",
        detail: "Missing Bearer token.",
      }),
    };
  }

  try {
    const payload = await verifyToken(token, { secretKey, jwtKey, ...jwtVerificationOptions() });
    assertTokenBoundary(payload);
    setVerifiedLogSubject(payload.sub);

    return {
      userId: payload.sub,
      sessionId: payload.sid ?? null,
      orgId: payload.org_id ?? null,
      tokenPayload: payload,
    };
  } catch {
    securityEvent("verification_failed",{reason:"invalid_token"});
    return {
      response: jsonResponse(401, {
        error: "Unauthorized",
        detail: "Invalid or expired Clerk session token.",
      }),
    };
  }
}
