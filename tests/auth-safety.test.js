import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertSafeAuthEnvironment } from '../integrations/authSafety.js';
import { isAdminAuth } from '../netlify/functions/_tenantSettings.js';
import { createAvailabilityHandler } from '../netlify/functions/set-availability.js';
import { createEnrollmentIntakesHandler } from '../netlify/functions/enrollment-intakes.js';

const switches = ['DISABLE_CLERK_AUTH', 'VITE_DISABLE_CLERK_AUTH', 'ALLOW_INSECURE_WEBHOOK_TESTS'];
test('deployment startup rejects every bypass setting, including empty and false, without disclosing values', () => {
  for (const module of ['integrations/worker.js', 'netlify/functions/_clerkAuth.js', 'telephony/src/config.js']) {
    for (const name of switches) for (const value of ['', 'false', 'true']) {
      const env={DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON, ...process.env, NODE_ENV: 'production' };
      for (const flag of switches) delete env[flag];
      env[name] = value;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import('./${module}')`], { env, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Unsafe authentication configuration: remove/);
      assert.ok(result.stderr.includes(name));
    }
  }
});
test('local webhook exception cannot escape into a build or hosted development process', () => {
  const env={DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON, NODE_ENV: 'development', ALLOW_INSECURE_WEBHOOK_TESTS: 'true' };
  assert.doesNotThrow(() => assertSafeAuthEnvironment(env));
  assert.throws(() => assertSafeAuthEnvironment(env, { build: true }), /Unsafe authentication/);
  for (const marker of ['NETLIFY', 'RAILWAY_ENVIRONMENT_ID', 'CI', 'AWS_LAMBDA_FUNCTION_NAME']) {
    assert.throws(() => assertSafeAuthEnvironment({ ...env, [marker]: 'true' }), /Unsafe authentication/);
  }
  for (const name of switches.slice(0, 2)) assert.throws(() => assertSafeAuthEnvironment({ NODE_ENV: 'development', [name]: 'true' }), /Unsafe authentication/);
  assert.equal(readFileSync(new URL('../integrations/authSafety.js', import.meta.url), 'utf8'), readFileSync(new URL('../telephony/src/authSafety.js', import.meta.url), 'utf8'));
});
test('bypassed identity cannot be an admin, including with role claims', () => {
  assert.equal(isAdminAuth({ userId: 'dev-bypass', tokenPayload: { role: 'admin' } }), false);
  assert.equal(isAdminAuth({ userId: 'real-user', tokenPayload: { org_role: 'org:admin' } }), true);
});

test('protected handlers reject missing, expired, foreign-issuer and malformed tokens using real verification', async () => {
  const names = ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'CLERK_AUTHORIZED_PARTIES', 'CLERK_AUDIENCE', ...switches];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const jwt = (keys, claims = {}) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = encode({ alg: 'RS256', typ: 'JWT', kid: 'offline-fixture' }) + '.' + encode({
      sub: 'user-fixture', sid: 'session-fixture', iss: 'https://trusted.clerk.accounts.dev', iat: now - 600, nbf: now - 600, exp: now + 60, ...claims,
    });
    return body + '.' + sign('RSA-SHA256', Buffer.from(body), keys.privateKey).toString('base64url');
  };
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network forbidden in offline authentication tests'); };
  try {
    for (const name of names) delete process.env[name];
    process.env.CLERK_JWT_KEY = trusted.publicKey.export({ type: 'spki', format: 'pem' });
    const getDb = () => { throw new Error('Invalid auth must not access the database'); };
    const endpoints = [createAvailabilityHandler({ getDb }), createEnrollmentIntakesHandler({ getDb })];
    for (const endpoint of endpoints) for (const token of [null, jwt(trusted, { exp: now - 60 }), jwt(foreign, { iss: 'https://foreign.clerk.accounts.dev' }), 'malformed.token']) {
      const response = await endpoint(new Request('https://offline.example/api', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: '{}' }));
      assert.equal(response.status, 401);
    }
    const { requireClerkAuth } = await import('../netlify/functions/_clerkAuth.js');
    const auth = await requireClerkAuth(new Request('https://offline.example', { headers: { Authorization: `Bearer ${jwt(trusted)}` } }));
    assert.equal(auth.userId, 'user-fixture');
  } finally {
    globalThis.fetch = fetchBefore;
    for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
});
