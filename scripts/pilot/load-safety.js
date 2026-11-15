import {readFileSync} from 'node:fs';
const forbidden=JSON.parse(readFileSync(new URL('../../tests/fixtures/forbidden-deployment-terms.json',import.meta.url),'utf8')).map(v=>v.toLowerCase());
const local=new Set(['localhost','127.0.0.1','[::1]']);
export function assertLoadSafety(config,{paid=false}={}) {
 if(!config||config.synthetic!==true||!Array.isArray(config.targets)||!config.targets.length)throw Error('Explicit synthetic targets required');
 const serialized=JSON.stringify(config).toLowerCase();
 if(forbidden.some(term=>serialized.includes(term)))throw Error('Current-agency identifier forbidden');
 if(!Number.isInteger(config.maxCalls)||config.maxCalls<1||config.maxCalls>100||!Number.isInteger(config.maxDurationSeconds)||config.maxDurationSeconds<1||config.maxDurationSeconds>7200)throw Error('Hard call/duration ceiling exceeded');
 for(const value of config.targets){const u=new URL(value);if(u.username||u.password||u.hash||!['http:','https:','ws:','wss:','postgresql:'].includes(u.protocol))throw Error('Unsafe target');
  if(!paid&&!local.has(u.hostname))throw Error('Local layer permits localhost only');
  if(paid&&(!config.disposableHosts?.includes(u.hostname)||local.has(u.hostname)))throw Error('Explicit disposable pilot allowlist required');
 }
 for(const key of ['project','account'])if(typeof config[key]!=='string'||(!paid&&!config[key].startsWith('synthetic-local-')))throw Error('Local synthetic account/project required');
 if(paid&&(!Number.isFinite(config.spendCeilingUsd)||config.spendCeilingUsd<=0||config.spendCeilingUsd>25||!Array.isArray(config.disposableHosts)||!config.disposableHosts.length))throw Error('Explicit spend ceiling and disposable hosts required');
 return Object.freeze({...config});
}
export function assertSafeEnvironment(env) {
 // Never discover or copy local environment files. Reject supplied provider/DB targets.
 for(const [name,value] of Object.entries(env)) {
  if(/(?:URL|HOST|PROJECT|ACCOUNT)(?:_SID|_ID)?$/.test(name)&&/^(?:https?|wss?|postgres(?:ql)?):\/\//.test(value)) {
   if(!local.has(new URL(value).hostname))throw Error('Nonlocal configured target forbidden');
  }
  if(/(?:PROJECT|ACCOUNT)(?:_SID|_ID)?$/.test(name)&&forbidden.some(term=>String(value).toLowerCase().includes(term)))throw Error('Current-agency account/project forbidden');
 }
}
