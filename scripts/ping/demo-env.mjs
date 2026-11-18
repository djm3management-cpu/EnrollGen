// Writes the gitignored .env.ping-demo for the local exchange demo
// (npm run dev:ping-demo): the synthetic pilot profile, every PING_* switch
// on and PARAGON_ENABLED off. No secrets; never deployed.
import { readFileSync, writeFileSync } from 'node:fs';
import { FEATURE_NAMES } from '../../telephony/src/lib/featureFlags.js';

const profile = JSON.stringify(JSON.parse(readFileSync(new URL('../../docs/pilot-profile.example.json', import.meta.url), 'utf8')));
const flags = FEATURE_NAMES.filter(name => name.startsWith('PING_')).map(name => `${name}=true`);
writeFileSync(new URL('../../.env.ping-demo', import.meta.url), [`DEPLOYMENT_PROFILE_JSON=${profile}`, ...flags,
  'PARAGON_ENABLED=false', 'VITE_PING_DEMO=1', ''].join('\n'));
