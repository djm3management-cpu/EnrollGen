import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {resolveCallAccessIdentity,evidenceFailure} from './_evidenceAccess.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import { featureEnabled, disabledResponse } from '../../telephony/src/lib/deploymentFeatures.js';
import { isMissing067 } from './_paragonControls.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { JSON_HEADERS, getSupabase } from './_tenantSettings.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS,'Cache-Control':'no-store' } });

export function createVendorRoutingHandler({authenticate=requireClerkAuth,getDb=getSupabase}={}) {
 return async request => {
  if (!featureEnabled('PARAGON_ENABLED')) return disabledResponse('PARAGON_ENABLED');
  if (!['GET','POST'].includes(request.method)) return json({ error:'Method not allowed' },405);
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const db = getDb();
  let identity; try { identity=await resolveCallAccessIdentity(db,auth); } catch(error) { return evidenceFailure(error); }
  if (!identity.admin) return json({error:'Forbidden'},403);
  const { data:source,error:sourceError } = await db.from('lead_sources').select('id').eq('tenant_id',identity.tenant.id)
    .eq('name',deploymentProfile().paragon.sourceName).eq('type','publisher').maybeSingle();
  if (sourceError || !source) return json({ error:'Paragon source unavailable' },503);
  const { data:currentConfig,error:configLookupError } = await db.from('vendor_routing_config')
    .select('*').eq('source_id',source.id).single();
  if (configLookupError || !currentConfig) return json({ error:'Routing settings unavailable' },503);
  if (request.method === 'POST') return json({error:'Vendor configuration is managed by the service operator deployment profile.'},409);
  const config={data:currentConfig};
  const [matrix,agents,reportToken,controls,counter] = await Promise.all([
    db.from('vendor_agent_state_eligibility').select('*').eq('source_id',source.id)
      .eq('plan_year',config.data.plan_year).order('state'),
    db.from('tenant_agents').select('id,name,npn,agent_slug,is_active').eq('tenant_id',identity.tenant.id).eq('is_active',true).order('name'),
    db.from('paragon_report_tokens').select('updated_at').eq('source_id',source.id).maybeSingle(),
    db.from('vendor_controls').select('*').eq('tenant_id',identity.tenant.id).maybeSingle(),
    db.rpc('paragon_daily_status',{p_tenant:identity.tenant.id}),
  ]);
  if (config.error || matrix.error || agents.error || reportToken.error) return json({ error:'Routing settings unavailable' },503);
  if(controls.error || (counter.error && !isMissing067(counter.error))) return json({error:'Paragon controls unavailable'},503);
  return json({ controls:controls.data,counter:counter.error?null:counter.data,
    billing_ready:!counter.error, config:config.data,matrix:matrix.data,agents:agents.data,
    report_token_updated_at:reportToken.data?.updated_at || null,
  });
};
}
export default serverRequest('vendor-routing',createVendorRoutingHandler());
