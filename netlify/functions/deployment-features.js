import {practiceFeatures} from '../../src/lib/practiceCaller.js';
import {getEvidenceServiceClient} from './_evidenceAccess.js';
import {resolveDeploymentAccess} from '../../telephony/src/lib/deploymentAccess.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {deploymentProfile,publicDeploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import { deploymentFeatures, billingDisabledEntitlement } from '../../telephony/src/lib/deploymentFeatures.js';
import { requireClerkAuth } from './_clerkAuth.js';
export function createDeploymentFeaturesHandler({authenticate = request => requireClerkAuth(request, {allowBypass:false}), env = process.env, getDb=getEvidenceServiceClient} = {}) {
  return async request => {
    if(request.method !== 'GET')return new Response('Method not allowed',{status:405});
    const auth = await authenticate(request);
    if(auth.response)return auth.response;
    const features = {...deploymentFeatures(env),...practiceFeatures(env)};
    let supervisorFloor=false;
    if(features.SUPERVISOR_FLOOR_ENABLED){try{const i=await resolveDeploymentAccess(getDb(),auth.userId,auth.orgId||auth.tokenPayload?.o?.id||null);supervisorFloor=['admin','manager'].includes(i.authority);}catch{/* No navigation without protected authority. */}}
    return Response.json({supervisorFloor,profile:publicDeploymentProfile(deploymentProfile(env)),features, entitlement:features.STRIPE_BILLING_ENABLED ? null : billingDisabledEntitlement(null)},
      {headers:{'Cache-Control':'no-store'}});
  };
}
export default serverRequest('deployment-features',createDeploymentFeaturesHandler());
