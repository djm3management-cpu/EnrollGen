import {createLogger} from './logger.js';
const logger=createLogger('telephony','browserboundary');
import { deploymentProfile } from './deploymentProfile.js';
export function allowedBrowserOrigin(origin,profile=deploymentProfile()) {return !origin || profile.browserOrigins.includes(origin);}
export function jwtVerificationOptions(profile=deploymentProfile()) {return {authorizedParties:profile.authorizedParties,...(profile.tokenAudiences.length===1?{audience:profile.tokenAudiences[0]}:{})};}
export function assertTokenBoundary(payload,profile=deploymentProfile()) {
 const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
 if(!profile.authorizedParties.includes(payload.azp)||!audiences.some(a=>profile.tokenAudiences.includes(a)))throw Error('Invalid token boundary');
}
export function assertSingleReplica(env=process.env,log=logger.info) {
 for(const key of ['RAILWAY_REPLICA_COUNT','WEB_CONCURRENCY','TELEPHONY_REPLICAS','REPLICAS']) {
  if(env[key]!==undefined&&(!/^1$/.test(env[key])))throw Error('Telephony requires exactly one replica');
 }
 log(JSON.stringify({event:'telephony_replica_policy',replicas:1,distributed_fanout:false,warning:'Single replica required; provider replica count must be verified by operator'}));
}
