import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { config, mediaStreamUrl } from '../config.js';

export const STREAM_TOKEN_TTL_SECONDS = 300;
const PURPOSE = 'twilio-media-v1';
const signature = payload => createHmac('sha256', config.agentWsSigningSecret)
  .update(PURPOSE + ':' + payload).digest('base64url');

// Separate purpose/signature from browser /agent tokens, using the existing
// server-only signing secret. The URL is a capability; never log it.
export function mintMediaStreamToken({ callSid, agentId, attemptId, tenantId, inboundCallId = null, direction = 'inbound' }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({ purpose: PURPOSE, callSid, agentId, attemptId, tenantId,
    inboundCallId, direction, accountSid: config.twilioAccountSid, iat, exp: iat + STREAM_TOKEN_TTL_SECONDS })).toString('base64url');
  return payload + '.' + signature(payload);
}

export function verifyMediaStreamToken(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, supplied] = token.split('.');
  const expected = signature(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  const seconds = Math.floor(now / 1000);
  if (claims?.purpose !== PURPOSE || claims.accountSid !== config.twilioAccountSid ||
      !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > seconds + 5 ||
      claims.exp <= seconds || claims.exp - claims.iat !== STREAM_TOKEN_TTL_SECONDS ||
      !['inbound', 'outbound'].includes(claims.direction)) return null;
  for (const field of ['callSid', 'agentId', 'attemptId', 'tenantId']) {
    if (typeof claims[field] !== 'string' || !claims[field] || claims[field].length > 128) return null;
  }
  if (claims.direction === 'inbound' && (typeof claims.inboundCallId !== 'string' || !claims.inboundCallId || claims.inboundCallId.length > 128)) return null;
  if (claims.direction === 'outbound' && claims.inboundCallId !== null) return null;
  return claims;
}

export function authenticatedStreamUrl(identity) {
  return mediaStreamUrl() + '/' + mintMediaStreamToken(identity);
}
