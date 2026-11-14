import { deploymentFeatures, billingDisabledEntitlement } from '../../telephony/src/lib/deploymentFeatures.js';
import { requireClerkAuth } from './_clerkAuth.js';
export function createDeploymentFeaturesHandler({authenticate = request => requireClerkAuth(request, {allowBypass:false}), env = process.env} = {}) {
  return async request => {
    if(request.method !== 'GET')return new Response('Method not allowed',{status:405});
    const auth = await authenticate(request);
    if(auth.response)return auth.response;
    const features = deploymentFeatures(env);
    return Response.json({features, entitlement:features.STRIPE_BILLING_ENABLED ? null : billingDisabledEntitlement(null)},
      {headers:{'Cache-Control':'no-store'}});
  };
}
export default createDeploymentFeaturesHandler();
