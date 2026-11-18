import './local-only.js';
import {readFileSync} from 'node:fs';
process.env.DEPLOYMENT_PROFILE_JSON=readFileSync(new URL('./deployment-profile.json',import.meta.url),'utf8');
// Ping platform flags stay off unless a test opts in explicitly.
for(const name of ['PING_PLATFORM_ENABLED','PING_SHADOW_ENABLED','PING_RETENTION_ALERTS_ENABLED','PING_SCORECARD_ENABLED','PING_SCREENER_ENABLED','PING_EXCHANGE_ENABLED'])process.env[name]??='false';
