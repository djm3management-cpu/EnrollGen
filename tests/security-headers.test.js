import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {browserHeaders,frontendHeaders} from '../scripts/security/browser-headers.mjs';
import {forbiddenIdentityOffsets} from '../scripts/security/agency-fingerprints.mjs';
import profile from '../config/deployment-profile.example.json' with {type:'json'};
const html='<script>window.synthetic = true;</script>';
const policy=headers=>headers['Content-Security-Policy-Report-Only'];
test('Netlify configuration contains every static browser security header verbatim',()=>{
  const config=readFileSync('netlify.toml','utf8');
  for(const [name,value] of Object.entries(frontendHeaders))assert.ok(config.includes(`${name} = "${value}"`),name);
  assert.equal(frontendHeaders['X-Frame-Options'],'SAMEORIGIN');
  assert.equal(frontendHeaders['Permissions-Policy'],'microphone=(self), camera=(), geolocation=(), accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(self), battery=(), bluetooth=(), browsing-topics=(), clipboard-read=(), clipboard-write=(self), compute-pressure=(), display-capture=(self), encrypted-media=(), fullscreen=(), gamepad=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(self), publickey-credentials-get=(self), screen-wake-lock=(), serial=(), speaker-selection=(self), storage-access=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()');
});
test('content policy derives exact auth, storage, database and phone hosts without allowing private delivery sinks',()=>{
  const p=structuredClone(profile);p.allowedHosts.push('private-delivery.example');
  const headers=browserHeaders(p,{},[html]),csp=policy(headers);
  for(const origin of ['https://auth.example','https://accounts.example','https://database.example','wss://database.example','https://phone.example','wss://phone.example'])assert.ok(csp.includes(origin));
  for(const directive of ["frame-ancestors 'self'","object-src 'none'","worker-src 'self' blob:","'wasm-unsafe-eval'",'https://sdk.twilio.com','wss://*.twilio.com'])assert.ok(csp.includes(directive));
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update('window.synthetic = true;').digest('base64')}'`));
  assert.ok(!csp.includes('private-delivery.example'));
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
  assert.equal(forbiddenIdentityOffsets(csp).length,0);
});
test('one setting selects enforcement; invalid hosts, mismatches and policy modes fail closed without echoing values',()=>{
  const headers=browserHeaders(profile,{CSP_MODE:'enforce'},[html]);
  assert.ok(headers['Content-Security-Policy']);assert.equal(policy(headers),undefined);
  for(const env of [{CSP_MODE:'bad'},{VITE_SUPABASE_URL:'https://foreign.invalid'},{VITE_CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('foreign.invalid$').toString('base64')}])assert.throws(()=>browserHeaders(profile,env,[html]));
  for(const origin of ['https://foreign.invalid','https://auth.example/path','https://auth.example; script-src *']){
    const p=structuredClone(profile);p.browserSecurity.clerkOrigin=origin;assert.throws(()=>browserHeaders(p,{},[html]));
  }
});

// Each self-only grant must have an executable source consumer or the installed
// Clerk passkey API used by the mounted authentication/account experience.
test('every granted browser feature maps to product and installed SDK use',()=>{
  const uses={
    microphone:[['src/lib/audio/AgentAudioProcessor.js',/navigator\.mediaDevices\.getUserMedia/]],
    autoplay:[['src/context/InboundCallContext.jsx',/audioElement\.autoplay = true/],['node_modules/@twilio/voice-sdk/lib/twilio/device.ts',/SoundName\.Incoming\)\.play\(/]],
    'display-capture':[['src/hooks/useCustomerAudio.js',/navigator\.mediaDevices\.getDisplayMedia\(/]],
    'speaker-selection':[['node_modules/@twilio/voice-sdk/lib/twilio/rtc/peerconnection.ts',/audio\.setSinkId\(id\)/]],
    'clipboard-write':[['src/components/SharedUI.jsx',/navigator\.clipboard/],['src/components/DailyVerse.jsx',/navigator\.clipboard\.writeText/]],
    'publickey-credentials-create':[['node_modules/@clerk/shared/dist/types/index.d.ts',/createPasskey: \(\) => Promise<PasskeyResource>/],['src/main.jsx',/<ClerkProvider /]],
    'publickey-credentials-get':[['src/lib/sessionLock.js',/session\.verifyWithPasskey\(/],['src/App.jsx',/<SignIn /],['node_modules/@clerk/shared/dist/types/index.d.ts',/authenticateWithPasskey:/]],
  };
  const allowed=frontendHeaders['Permissions-Policy'].split(', ').filter(part=>part.endsWith('=(self)')).map(part=>part.split('=')[0]);
  assert.deepEqual(allowed.sort(),Object.keys(uses).sort());
  for(const [feature,consumers] of Object.entries(uses))for(const [file,pattern] of consumers)assert.match(readFileSync(file,'utf8'),pattern,`${feature}: ${file}`);
});
test('same-origin playbook framing agrees in both headers and CSP modes',()=>{
  assert.equal(frontendHeaders['X-Frame-Options'],'SAMEORIGIN');
  for(const mode of ['report-only','enforce']){
    const headers=browserHeaders(profile,{CSP_MODE:mode},[html]);
    const csp=headers[mode==='enforce'?'Content-Security-Policy':'Content-Security-Policy-Report-Only'];
    assert.equal(csp.split('; ').find(d=>d.startsWith('frame-ancestors ')),"frame-ancestors 'self'");
  }
  assert.match(readFileSync('src/components/PlaybookModal.jsx','utf8'),/<iframe[\s\S]*src=\{src\}/);
  assert.match(readFileSync('src/data/privatePlans.js','utf8'),/PRIVATE_PLAN_PLAYBOOK_URL = '\/private-plan-playbook\.html'/);
});
