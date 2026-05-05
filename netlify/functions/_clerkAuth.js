import { verifyToken } from "@clerk/backend";

const JSON_HEADERS = { "Content-Type": "application/json" };

function parseList(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function isAuthBypassed() {
  return (
    process.env.DISABLE_CLERK_AUTH === "true" ||
    process.env.VITE_DISABLE_CLERK_AUTH === "true"
  );
}

export async function requireClerkAuth(request) {
  if (isAuthBypassed()) {
    return { userId: "dev-bypass", sessionId: null, orgId: null, tokenPayload: {} };
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  const jwtKey = process.env.CLERK_JWT_KEY;

  if (!secretKey && !jwtKey) {
    console.error("Clerk auth is enabled but no backend signing key is set");
    return {
      response: jsonResponse(500, {
        error: "Server configuration error",
        detail: "Set CLERK_SECRET_KEY or CLERK_JWT_KEY in Netlify environment variables.",
      }),
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonResponse(401, {
        error: "Unauthorized",
        detail: "Missing Bearer token.",
      }),
    };
  }

  try {
    const authorizedParties = parseList(process.env.CLERK_AUTHORIZED_PARTIES);
    const audience = parseList(process.env.CLERK_AUDIENCE);
    const payload = await verifyToken(token, {
      secretKey,
      jwtKey,
      ...(authorizedParties.length ? { authorizedParties } : {}),
      ...(audience.length ? { audience: audience.length === 1 ? audience[0] : audience } : {}),
    });

    return {
      userId: payload.sub,
      sessionId: payload.sid ?? null,
      orgId: payload.org_id ?? null,
      tokenPayload: payload,
    };
  } catch (error) {
    console.error("Clerk token verification failed:", error);
    return {
      response: jsonResponse(401, {
        error: "Unauthorized",
        detail: "Invalid or expired Clerk session token.",
      }),
    };
  }
}
