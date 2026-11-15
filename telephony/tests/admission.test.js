import test from 'node:test';
import assert from 'node:assert/strict';
import {admitHttp,createSocketAdmission} from '../src/lib/admission.js';
import {assertSingleReplica,assertTokenBoundary} from '../src/lib/browserBoundary.js';
import {deploymentProfile} from '../src/lib/deploymentProfile.js';
test('HTTP admission returns 429 and Retry-After before invoking provider work',async()=>{
 const res={setHeader(key,value){this[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;}};
 assert.equal(await admitHttp({rpc:async()=>({data:{allowed:false,retry_after:27}})},'sms','verified-subject',res),false);
 assert.equal(res.code,429);assert.equal(res['Retry-After'],'27');assert.equal(res.body.error,'admission_limited');
 assert.equal(await admitHttp({rpc:async()=>({data:{allowed:true}})},'voiceToken','verified-subject',res),true);
});
test('concurrent socket attempts cannot exceed three for the same signed subject',async()=>{
 const reserve=createSocketAdmission();const attempts=await Promise.allSettled(Array.from({length:20},async()=>reserve('signed-subject')));
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,3);assert.equal(attempts.filter(a=>a.status==='rejected'&&a.reason.status===429).length,17);
 for(const result of attempts)if(result.status==='fulfilled')result.value();
});
test('telephony refuses multiple replicas and a foreign token audience',()=>{
 assert.throws(()=>assertSingleReplica({RAILWAY_REPLICA_COUNT:'2'},()=>{}));
 const profile=deploymentProfile();assert.throws(()=>assertTokenBoundary({aud:'foreign',azp:profile.authorizedParties[0]}));
 assertTokenBoundary({aud:profile.tokenAudiences[0],azp:profile.authorizedParties[0]});
});
