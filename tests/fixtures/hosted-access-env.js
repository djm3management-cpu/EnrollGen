// Hosted access matrix only (hosted rehearsal; see tests/helpers/hostedAccessTarget.js).
// Same synthetic deployment environment as deployment-env.js. The network guard is the
// local-only guard plus exactly one destination: the opted-in database host on 5432.
// HTTP stays local-only. Refuses to load unless ACCESS_MATRIX_TARGET=hosted.
import net from 'node:net';
import {readFileSync} from 'node:fs';
import {refuseProduction} from '../../scripts/lib/remote-target.js';
const remote=process.env.ACCESS_MATRIX_REMOTE_HOST;
if(process.env.ACCESS_MATRIX_TARGET!=='hosted'||!remote)throw Error('hosted-access-env.js requires ACCESS_MATRIX_TARGET=hosted and ACCESS_MATRIX_REMOTE_HOST');
refuseProduction(remote,process.env.ACCESS_MATRIX_REMOTE_REF,process.env.ACCESS_MATRIX_DB_URL);
const local=host=>!host || ['localhost','127.0.0.1','::1','[::1]'].includes(host);
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const first=args[0];
 const opts=Array.isArray(first)?first[0]:first;
 const host=typeof opts==='object'?opts?.host:typeof args[1]==='string'?args[1]:undefined;
 const port=Number(typeof opts==='object'?opts?.port:opts);
 const socketPath=typeof opts==='object'?opts?.path:typeof opts==='string' && !/^\d+$/.test(opts)?opts:undefined;
 if(!socketPath && !local(host) && !(host===remote && port===5432))throw Error('External network forbidden in synthetic tests');
 return originalConnect.apply(this,args);
};
const send=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=new URL(input instanceof Request?input.url:input);
 if(!local(url.hostname))throw Error('External fetch forbidden in synthetic tests');
 return send(input,init);
};
process.env.DEPLOYMENT_PROFILE_JSON=readFileSync(new URL('./deployment-profile.json',import.meta.url),'utf8');
for(const name of ['PING_PLATFORM_ENABLED','PING_SHADOW_ENABLED','PING_RETENTION_ALERTS_ENABLED','PING_SCORECARD_ENABLED','PING_SCREENER_ENABLED','PING_EXCHANGE_ENABLED'])process.env[name]??='false';
