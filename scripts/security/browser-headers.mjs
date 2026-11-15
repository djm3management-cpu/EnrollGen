import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {validateDestination} from '../../telephony/src/lib/deploymentProfile.js';

export const permissionsPolicy = 'microphone=(self), camera=(), geolocation=(), accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(self), battery=(), bluetooth=(), browsing-topics=(), clipboard-read=(), clipboard-write=(self), compute-pressure=(), display-capture=(self), encrypted-media=(), fullscreen=(), gamepad=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(self), publickey-credentials-get=(self), screen-wake-lock=(), serial=(), speaker-selection=(self), storage-access=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()';
export const frontendHeaders = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': permissionsPolicy,
});
function exactOrigin(value, profile) {
  const url = new URL(validateDestination(value, profile.allowedHosts));
  if (url.origin !== value) throw Error('Security policy requires an exact HTTPS origin');
  return url.origin;
}
const ws = origin => origin.replace(/^https:/, 'wss:');
export function browserHeaders(profile, env, htmlSources) {
  // A single server-held profile owns deployment hosts. Never copy the broad
  // delivery allowedHosts list into a browser policy: it includes private sinks.
  const config = profile.browserSecurity;
  if (!config) throw Error('Deployment profile browserSecurity is required for build');
  const clerk = exactOrigin(config.clerkOrigin, profile);
  const accounts = exactOrigin(config.clerkAccountsOrigin, profile);
  const database = exactOrigin(config.databaseOrigin, profile);
  const cms = config.cmsDatabaseOrigin ? exactOrigin(config.cmsDatabaseOrigin, profile) : database;
  const phone = new URL(profile.telephonyOrigin).origin;
  for (const [name, expected] of [['VITE_SUPABASE_URL', database], ['VITE_SUPABASE_CMS_URL', cms]]) {
    if (env[name] && env[name].replace(/\/$/, '') !== expected) throw Error('Browser database origin differs from deployment profile');
  }
  if (env.VITE_CLERK_PUBLISHABLE_KEY) {
    const key = env.VITE_CLERK_PUBLISHABLE_KEY;
    const host = Buffer.from(key.replace(/^pk_(?:test|live)_/, ''), 'base64').toString().replace(/\$$/, '');
    if (`https://${host}` !== clerk) throw Error('Clerk origin differs from deployment profile');
  }
  const hashes = [...new Set(htmlSources.flatMap(html => [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)))];
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'self'"],
    'form-action': ["'self'", clerk, accounts],
    // Twilio's SDK is bundled. Clerk loads its own script from its exact FAPI.
    // WASM and same-origin/blob workers cover both noise suppression models.
    'script-src': ["'self'", "'wasm-unsafe-eval'", ...hashes, clerk, 'https://challenges.cloudflare.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', clerk, 'https://img.clerk.com', database, cms, 'https://*.giphy.com'],
    'media-src': ["'self'", 'blob:', database, cms, phone, 'https://sdk.twilio.com', 'https://*.giphy.com'],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'", clerk, accounts, 'https://challenges.cloudflare.com'],
    'connect-src': ["'self'", clerk, accounts, 'https://clerk-telemetry.com', database, ws(database), cms, ws(cms), phone, ws(phone), 'https://*.twilio.com', 'wss://*.twilio.com',
      // Optional Daily Verse, FEMA and customer STT paths found in source.
      'https://bible-api.com', 'https://bibleengine.org', 'https://cdn.jsdelivr.net', 'https://www.fema.gov', 'wss://api.deepgram.com'],
  };
  if (profile.logoUrl) directives['img-src'].push(new URL(profile.logoUrl).origin);
  const mode = env.CSP_MODE || 'report-only';
  if (!['report-only', 'enforce'].includes(mode)) throw Error('CSP_MODE must be report-only or enforce');
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`).join('; ');
  return {...frontendHeaders, [mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only']: policy};
}
export function securityHeadersPlugin(profile, env) {
  let root;
  return {name: 'deployment-security-headers', configResolved(config) {root = config.root;}, generateBundle() {
    const html = ['index.html', 'status-page/index.html', 'public/private-plan-playbook.html', 'public/404.html'].map(file => readFileSync(path.join(root, file), 'utf8'));
    const headers = browserHeaders(profile, env, html);
    this.emitFile({type: 'asset', fileName: '_headers', source: '/*\n'+Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')+'\n'});
  }};
}
