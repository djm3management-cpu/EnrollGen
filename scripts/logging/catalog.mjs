// Repository source only: no environment, databases or network.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):e.name.endsWith('.js')&&!e.name.endsWith('logEvents.js')?[d+'/'+e.name]:[]);
const events=new Set(),modules=new Set(['server']);
for(const file of ['netlify','integrations','telephony/src','supabase/functions','scripts/recovery','scripts/retention'].flatMap(walk)){
 const source=readFileSync(file,'utf8');
 for(const match of source.matchAll(/(?:event\s*:\s*|logger\.(?:info|warn|error|debug)\(|securityEvent\(|\blog\()["']([a-z][a-z0-9_]{1,95})["']/g))events.add(match[1]);
 for(const match of source.matchAll(/createLogger\(['"][^'"]+['"],['"]([^'"]+)/g))modules.add(match[1]);
}
const logger=readFileSync('telephony/src/lib/logger.js','utf8');
for(const match of logger.split('SECURITY_EVENTS=Object.freeze([')[1].split(']);')[0].matchAll(/'([a-z_]+)'/g))events.add(match[1]);
writeFileSync('telephony/src/lib/logEvents.js','// Reviewed, code-owned event dimensions; never derive them from input.\nexport const LOG_EVENTS=Object.freeze('+JSON.stringify([...events].sort())+');\nexport const LOG_MODULES=Object.freeze('+JSON.stringify([...modules].sort())+');\n');
