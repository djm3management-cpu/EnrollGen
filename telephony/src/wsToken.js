import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { config } from "./config.js";

const TOKEN_TTL_SECONDS = 15 * 60;

function hmac(payload) {
  return crypto
    .createHmac("sha256", config.agentWsSigningSecret)
    .update(payload)
    .digest("base64url");
}

// Compact signed token for the /agent WebSocket: base64url(claims).signature
export function mintAgentWsToken(agentId, clerkSubject, clerkSessionId) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    agentId,
    clerkSubject,
    clerkSessionId,
    exp,
  })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function inspectAgentWsToken(token, now = Date.now()) {
  const reject = reason => ({ claims: null, reason });
  if (!token || typeof token !== "string") return reject("missing_token");
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0 || token.length > 4096) return reject("malformed_token");
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return reject("signature_mismatch");
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return reject("malformed_claims");
  }
  if (!claims?.agentId || !claims?.clerkSubject || !claims?.clerkSessionId || !Number.isFinite(claims.exp)) return reject("invalid_claims");
  if (claims.exp < Math.floor(now / 1000)) return reject("expired_token");
  return { claims, reason: null };
}

export function verifyAgentWsToken(token) {
  return inspectAgentWsToken(token).claims;
}
