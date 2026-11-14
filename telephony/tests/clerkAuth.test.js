import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign } from 'node:crypto';
import express from 'express';
for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://offline.example';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'DEEPGRAM_API_KEY', 'INBOUND_VENDOR_API_KEY', 'CLERK_SECRET_KEY', 'AGENT_WS_SIGNING_SECRET']) process.env[name] = 'fixture';
const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.CLERK_JWT_KEY = trusted.publicKey.export({ type: 'spki', format: 'pem' });
const { voiceTokenRouter } = await import('../src/routes/voiceToken.js');
const { requireClerkUser } = await import('../src/clerkAuth.js');
const now = Math.floor(Date.now() / 1000);
function jwt(keys, claims = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = encode({ alg: 'RS256', typ: 'JWT', kid: 'fixture' }) + '.' + encode({
    sub: 'user-fixture', sid: 'session-fixture', iss: 'https://trusted.clerk.accounts.dev', iat: now - 600, nbf: now - 600, exp: now + 60, ...claims,
  });
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), keys.privateKey).toString('base64url');
}
test('voice token handler rejects missing, expired, foreign-issuer and malformed credentials before provider or DB access', async () => {
  const app = express();
  app.use(voiceTokenRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = globalThis.fetch;
  const origin = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = (url, options) => {
    assert.ok(String(url).startsWith(origin), 'External network access is forbidden');
    return originalFetch(url, options);
  };
  try {
    for (const token of [null, jwt(trusted, { exp: now - 60 }), jwt(foreign, { iss: 'https://foreign.clerk.accounts.dev' }), 'malformed.token']) {
      const response = await fetch(origin + '/api/voice/token', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, 401);
    }
    const result = await requireClerkUser({ header: () => `Bearer ${jwt(trusted)}` }, { status: () => { throw new Error('Valid session rejected'); } });
    assert.equal(result.sub, 'user-fixture');
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
});
