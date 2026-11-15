import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {resolveCallAccessIdentity,evidenceFailure} from './_evidenceAccess.js';
import { featureEnabled, disabledResponse } from '../../telephony/src/lib/deploymentFeatures.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { JSON_HEADERS, getSupabase } from './_tenantSettings.js';

export function createVendorPauseHandler({authenticate=requireClerkAuth,getDb=getSupabase}={}) {
 return serverRequest('vendor-pause',async request => {
  if (!featureEnabled('PARAGON_ENABLED')) return disabledResponse('PARAGON_ENABLED');
  if (!['GET','POST'].includes(request.method)) return new Response('Method Not Allowed',{status:405});
  const auth=await authenticate(request); if(auth.response)return auth.response;
  const db=adminActionClient(getDb());
  let identity; try { identity=await resolveCallAccessIdentity(db,auth); } catch(error) { return evidenceFailure(error); }
  if(!identity.admin) return new Response(JSON.stringify({error:'Forbidden'}),{status:403,headers:JSON_HEADERS});
  if(request.method==='POST'){
    const body=await request.json().catch(()=>({}));
    const paused=body.paused===true;
    const {error}=await db.rpc('set_vendor_pause',{p_tenant_id:identity.tenant.id,p_paused:paused,p_actor:auth.userId||auth.user?.id||'admin'});
    if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers:JSON_HEADERS});
  }
  const {data,error}=await db.from('vendor_controls').select('vendor_pause,updated_at,updated_by').eq('tenant_id',identity.tenant.id).maybeSingle();
  if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers:JSON_HEADERS});
  return new Response(JSON.stringify(data||{vendor_pause:false}),{status:200,headers:JSON_HEADERS});
});
}
export default createVendorPauseHandler();
