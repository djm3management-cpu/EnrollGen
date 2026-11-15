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
    sub: 'user-fixture', sid: 'session-fixture', iss: 'https://trusted.clerk.accounts.dev', azp: new URL(JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON).appOrigin).origin, aud: JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON).organizationId, iat: now - 600, nbf: now - 600, exp: now + 60, ...claims,
  });
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), keys.privateKey).toString('base64url');
}
test('voice token handler rejects missing, expired, foreign-issuer and malformed credentials before provider or DB access', async () => {
  const app = express();
  app.use(express.json());
  app.use(voiceTokenRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = globalThis.fetch;
  const originalProfile=process.env.DEPLOYMENT_PROFILE_JSON;
  const profile=JSON.parse(originalProfile);profile.admissionLimits={voiceToken:{minute:3}};process.env.DEPLOYMENT_PROFILE_JSON=JSON.stringify(profile);
  let consumed=0,lookups=0;
  const origin = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = (url, options) => {
    if(String(url)==='https://offline.example/rest/v1/rpc/resolve_deployment_subject') {
      assert.deepEqual(JSON.parse(options.body),{p_subject:'user-fixture',p_org:null});
      return Promise.resolve(Response.json([{tenant_id:'fixture-tenant',agent_id:'fixture-agent',roster_id:'fixture-roster',agent_slug:'fixture_agent',authority:'agent',team_agent_ids:[]}]));
    }
    if(String(url)==='https://offline.example/rest/v1/rpc/consume_admission'){assert.equal(JSON.parse(options.body).p_rules[0].limit,3);return Promise.resolve(Response.json({allowed:++consumed<=3,retry_after:60}));}
    if(String(url).startsWith('https://offline.example/rest/v1/agent_availability')){lookups++;return Promise.resolve(Response.json({agent_id:'fixture_agent'}));}
    assert.ok(String(url).startsWith(origin), 'External network access is forbidden');
    return originalFetch(url, options);
  };
  try {
    for (const token of [null, jwt(trusted, { exp: now - 60 }), jwt(foreign, { iss: 'https://foreign.clerk.accounts.dev' }), jwt(trusted,{aud:'foreign-audience'}), jwt(trusted,{azp:'https://foreign.test'}), 'malformed.token']) {
      const response = await fetch(origin + '/api/voice/token', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, 401);
    }
    const result = await requireClerkUser({ header: name => name==='authorization'?`Bearer ${jwt(trusted)}`:undefined }, { status: () => { throw new Error('Valid session rejected'); } });
    assert.equal(result.sub, 'user-fixture');
    const issued=await fetch(origin+'/api/voice/token',{method:'POST',headers:{Authorization:`Bearer ${jwt(trusted)}`,'Content-Type':'application/json'},body:JSON.stringify({agent_id:'peer',tenant_id:'forged',actor:'attacker',role:'admin'})});
    assert.equal(issued.status,200);
    assert.equal((await issued.json()).identity,'fixture_agent');
    const burst=await Promise.all(Array.from({length:20},(_,i)=>fetch(origin+'/api/voice/token',{method:'POST',headers:{Authorization:`Bearer ${jwt(trusted)}`,'Content-Type':'application/json','x-forwarded-for':`198.51.100.${i}`},body:JSON.stringify({agent_id:'spoof_'+i})})));
    assert.equal(burst.filter(r=>r.status===200).length,2);assert.equal(lookups,3);
    assert.equal(burst.filter(r=>r.status===429).length,18);assert.ok(burst.filter(r=>r.status===429).every(r=>r.headers.get('retry-after')==='60'));
    const foreignOrigin=await fetch(origin+'/api/voice/token',{method:'POST',headers:{Authorization:`Bearer ${jwt(trusted)}`,Origin:'https://foreign.test'}});assert.equal(foreignOrigin.status,403);
  } finally {
    globalThis.fetch = originalFetch;process.env.DEPLOYMENT_PROFILE_JSON=originalProfile;
    await new Promise(resolve => server.close(resolve));
  }
});
