// Import before any application module. No real credentials or feature switches
// reach the synthetic drill; this changes only this process, never an env file.
import '../../tests/fixtures/local-only.js';
import {readFileSync} from 'node:fs';
for(const key of Object.keys(process.env))if(!['PATH','SystemRoot','TZ'].includes(key))delete process.env[key];
process.env.DEPLOYMENT_PROFILE_JSON=readFileSync(new URL('../../tests/fixtures/deployment-profile.json',import.meta.url),'utf8');
