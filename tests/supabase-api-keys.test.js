import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createSupabaseClient, supabaseSecretKey, supabasePublishableKey as serverPublicKey } from '../integrations/supabase.js';
import { createSupabaseClient as telephonyClient, supabaseSecretKey as phoneSecret } from '../telephony/src/lib/supabaseKeys.js';
import { supabasePublishableKey, supabaseCmsPublishableKey } from '../src/lib/supabaseKeys.js';
import { edgeSupabaseSecretKey, edgeSupabaseFetch } from '../supabase/functions/_shared/supabaseKeys.js';
import { assertNoPublicApiKeys } from '../src/lib/llm/config.js';
import { getEvidenceServiceClient } from '../netlify/functions/_evidenceAccess.js';
import { createEvidenceSupabase } from '../src/lib/evidenceSupabase.js';
import { createClerkFetch } from '../src/lib/clerkFetch.js';

const url = 'https://example.supabase.co';
const jwt = (role = 'authenticated', alg = 'HS256') => [btoa(JSON.stringify({ alg, typ:'JWT' })),btoa(JSON.stringify({ role, sub:'fixture',exp:Math.floor(Date.now()/1000)+60 })), 'fixture-signature'].join('.');

test('server secret-key preference, whitespace and legacy fallback work without an anon escalation fallback',()=>{
  for(const resolve of [supabaseSecretKey,phoneSecret]){
    assert.equal(resolve({SUPABASE_SECRET_KEY:' sb_secret_fixture \n',SUPABASE_SERVICE_ROLE_KEY:'old'}),'sb_secret_fixture');
    assert.equal(resolve({SUPABASE_SECRET_KEY:' ',SUPABASE_SERVICE_ROLE_KEY:'old'}),'old');
    assert.equal(resolve({SUPABASE_ANON_KEY:'public'}),undefined);
  }
  assert.equal(serverPublicKey({SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_ANON_KEY:'old'}),'sb_publishable_fixture');
  assert.equal(serverPublicKey({SUPABASE_ANON_KEY:'old'}),'old');
  assert.equal(getEvidenceServiceClient({SUPABASE_URL:url,SUPABASE_SECRET_KEY:'sb_secret_fixture'}).supabaseKey,'sb_secret_fixture');
});

test('public key selection includes separate CMS keys and rejects privileged browser credentials',()=>{
  const key='sb_publishable_fixture';
  assert.equal(supabasePublishableKey({VITE_SUPABASE_PUBLISHABLE_KEY:key,VITE_SUPABASE_ANON_KEY:'old'}),key);
  assert.equal(supabasePublishableKey({VITE_SUPABASE_ANON_KEY:'old'}),'old');
  assert.equal(supabaseCmsPublishableKey({VITE_SUPABASE_CMS_PUBLISHABLE_KEY:'sb_publishable_cms'},key),'sb_publishable_cms');
  assert.equal(supabaseCmsPublishableKey({VITE_SUPABASE_CMS_ANON_KEY:'old-cms'},key),'old-cms');
  assert.equal(supabaseCmsPublishableKey({},key),key);
  const urlSafeServiceJwt=`e30.${Buffer.from(JSON.stringify({role:'service_role',note:'???'})).toString('base64url')}.fixture`;
  for(const value of ['sb_secret_fixture',jwt('service_role'),urlSafeServiceJwt]){
    assert.throws(()=>supabasePublishableKey({VITE_SUPABASE_PUBLISHABLE_KEY:value}),/must never/);
    assert.throws(()=>assertNoPublicApiKeys({VITE_UNRELATED:value}),error=>/Unsafe public secret/.test(error.message)&&!error.message.includes(value));
  }
  assert.doesNotThrow(()=>assertNoPublicApiKeys({VITE_SUPABASE_PUBLISHABLE_KEY:key,VITE_SUPABASE_CMS_PUBLISHABLE_KEY:key}));
});

for(const [name,client] of [['Netlify/integrations',createSupabaseClient],['telephony',telephonyClient]]){
  test(`${name} SDK REST and Storage keep apikey, remove opaque key Bearers, and preserve timeout transport`,async()=>{
    for(const key of ['sb_secret_fixture','sb_publishable_fixture','legacy-jwt-fixture']){
      const requests=[];
      const db=client(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(target,init)=>{
        requests.push({url:String(target),headers:new Headers(init.headers),signal:init.signal});
        return new Response(JSON.stringify(String(target).includes('/storage/')?{signedURL:'/object/sign/fixture?token=fixture'}:[]),{headers:{'Content-Type':'application/json'}});
      }}});
      const signal=AbortSignal.timeout(3000);
      assert.equal((await db.from('call_records').select('id').abortSignal(signal)).error,null);
      assert.equal((await db.storage.from('recordings').createSignedUrl('fixture.wav',60)).error,null);
      assert.equal(requests.length,2);assert.equal(requests[0].signal,signal);
      for(const request of requests){
        assert.equal(request.headers.get('apikey'),key);
        assert.equal(request.headers.get('Authorization'),key.startsWith('sb_')?null:`Bearer ${key}`);
      }
    }
  });
}

test('Edge key selection supports reserved runtime names, custom hosted secrets, named maps and legacy fallback',async()=>{
  const resolve=env=>edgeSupabaseSecretKey(name=>env[name]);
  assert.equal(resolve({SUPABASE_SECRET_KEY:'sb_secret_runtime',ENROLLGEN_SUPABASE_SECRET_KEY:'sb_secret_override'}),'sb_secret_runtime');
  assert.equal(resolve({ENROLLGEN_SUPABASE_SECRET_KEY:'sb_secret_override',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_default"}'}),'sb_secret_override');
  assert.equal(resolve({SUPABASE_SECRET_KEYS:'{"default":"sb_secret_default"}',SUPABASE_SERVICE_ROLE_KEY:'legacy'}),'sb_secret_default');
  assert.equal(resolve({SUPABASE_SERVICE_ROLE_KEY:'legacy'}),'legacy');
  assert.throws(()=>resolve({SUPABASE_SECRET_KEYS:'not-json',SUPABASE_SERVICE_ROLE_KEY:'legacy'}),/Invalid SUPABASE_SECRET_KEYS/);
  assert.throws(()=>resolve({}),/not configured/);
  let sent;
  await edgeSupabaseFetch('sb_secret_fixture',async(_,init)=>{sent=init;})('https://example.test',{headers:{apikey:'sb_secret_fixture',Authorization:'Bearer sb_secret_fixture'}});
  assert.equal(sent.headers.get('Authorization'),null);assert.equal(sent.headers.get('apikey'),'sb_secret_fixture');
  assert.match(readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8'),/verify_jwt = false/);
});

test('authenticated SDK requests retain Clerk user JWTs while using new public keys',async()=>{
  const original=globalThis.fetch,token=jwt(),requests=[];
  globalThis.fetch=async(_,init)=>{requests.push(new Headers(init.headers));return new Response('[]',{headers:{'Content-Type':'application/json'}});};
  try{
    const db=createEvidenceSupabase(async()=>token,url,'sb_publishable_fixture');
    assert.equal((await db.from('call_records').select('id')).error,null);
    assert.equal(requests[0].get('Authorization'),`Bearer ${token}`);assert.equal(requests[0].get('apikey'),'sb_publishable_fixture');
    await db.realtime.setAuth();assert.equal(db.realtime.accessTokenValue,token);
    for(const key of ['sb_publishable_fixture','sb_secret_fixture']){
      await assert.rejects(createClerkFetch(async()=>key,{send:()=>assert.fail('API keys are not user JWTs')})('/test'),/Sign in/);
    }
  }finally{globalThis.fetch=original;}
});

test('browser singleton clients never use an opaque public key as a JWT, including Realtime and missing Clerk sessions',async()=>{
  const bundled=await build({entryPoints:['src/lib/supabase.js'],bundle:true,write:false,platform:'node',format:'cjs',external:['@supabase/supabase-js'],define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'})}});
  const module={exports:{}},requests=[];
  const context=vm.createContext({module,exports:module.exports,require:createRequire(import.meta.url),Headers,Request,Response,Date,Map,atob,console,
    fetch:async(_,init)=>{requests.push(new Headers(init.headers));return new Response('[]',{headers:{'Content-Type':'application/json'}});}});
  vm.runInContext(bundled.outputFiles[0].text,context);
  const api=module.exports;
  assert.equal((await api.supabase.from('public_data').select('id')).error,null);
  assert.equal(requests.at(-1).get('apikey'),'sb_publishable_fixture');assert.equal(requests.at(-1).get('Authorization'),null);
  await api.supabase.realtime.setAuth();assert.equal(api.supabase.realtime.accessTokenValue,null);
  const token=jwt();api.registerClerkTokenGetter(async()=>token);
  const authenticated=api.getAuthSupabase(token);
  assert.equal((await authenticated.from('call_records').select('id')).error,null);
  assert.equal(requests.at(-1).get('Authorization'),`Bearer ${token}`);
  await authenticated.realtime.setAuth();assert.equal(authenticated.realtime.accessTokenValue,token);
  api.registerClerkTokenGetter(async()=>null);await api.refreshClerkSupabaseToken();
  const count=requests.length;
  const denied=await api.getClerkSupabase().from('call_records').select('id');
  assert.ok(denied.error);assert.equal(requests.length,count);
});

test('telephony boots using only the new key without requiring the legacy variable',()=>{
  const env={...process.env,SUPABASE_SECRET_KEY:'sb_secret_fixture',PUBLIC_BASE_URL:url,SUPABASE_URL:url};
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  for(const name of ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])env[name]='fixture';
  const out=execFileSync(process.execPath,['--input-type=module','-e',"import {config} from './telephony/src/config.js'; console.log(config.supabaseSecretKey==='sb_secret_fixture')"],{env,encoding:'utf8'});
  assert.equal(out.trim(),'true');
});

test('office sync accepts only a new secret and does not send it as a Bearer JWT',()=>{
  const env={...process.env,SUPABASE_SECRET_KEY:'sb_secret_fixture',SUPABASE_URL:url,NEXTCLOUD_URL:'https://office.test',NEXTCLOUD_USER:'fixture',NEXTCLOUD_APP_TOKEN:'fixture'};
  delete env.SUPABASE_SERVICE_KEY;delete env.SUPABASE_SERVICE_ROLE_KEY;
  const out=execFileSync('python3',['-c',"import json,runpy; m=runpy.run_path('infra/office-nextcloud/sync/sync.py'); m['validate_env'](); print(json.dumps(m['supabase_headers']()))"],{env,encoding:'utf8'});
  const headers=JSON.parse(out);assert.equal(headers.apikey,'sb_secret_fixture');assert.equal(headers.Authorization,undefined);
});
