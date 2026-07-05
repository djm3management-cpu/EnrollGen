import crypto from "node:crypto";
import { config } from "./config.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 8; // one shift

function hmac(payload) {
  return crypto
    .createHmac("sha256", config.agentWsSigningSecret)
    .update(payload)
    .digest("base64url");
}

// Compact signed token for the /agent WebSocket: agentId.exp.signature
export function mintAgentWsToken(agentId) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${agentId}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyAgentWsToken(token) {
  if (!token || typeof token !== "string") return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [agentId, expRaw] = payload.split(".");
  if (!agentId || Number(expRaw) < Math.floor(Date.now() / 1000)) return null;
  return { agentId };
}
