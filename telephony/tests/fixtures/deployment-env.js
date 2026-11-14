import {readFileSync} from 'node:fs';
process.env.DEPLOYMENT_PROFILE_JSON=readFileSync(new URL('./deployment-profile.json',import.meta.url),'utf8');
