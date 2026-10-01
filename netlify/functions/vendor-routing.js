import { requireClerkAuth } from './_clerkAuth.js';
import { isAdminAuth, NGHS_TENANT_ID, JSON_HEADERS, getSupabase } from './_tenantSettings.js';
import { normalizeCarrier } from '../../telephony/src/paragonEligibility.js';
import { createHash, randomBytes } from 'node:crypto';

const CARRIERS = ['aetna','humana','uhc','wellcare','devoted','healthspring'];
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS,'Cache-Control':'no-store' } });

export default async request => {
  if (!['GET','POST'].includes(request.method)) return json({ error:'Method not allowed' },405);
  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;
  const db = getSupabase();
  if (!isAdminAuth(auth)) {
    // Clerk's frontend user object can expose the tenant membership role even
    // when the session token omits org_role. Resolve that role through the
    // authenticated Clerk subject, scoped to this tenant and active roster.
    if (!auth.userId) return json({ error:'Forbidden' },403);
    const { data:membership,error:membershipError } = await db.from('tenant_agents').select('id')
      .eq('tenant_id',NGHS_TENANT_ID).eq('clerk_user_id',auth.userId)
      .eq('role','admin').eq('is_active',true).maybeSingle();
    if (membershipError) return json({ error:'Admin authorization unavailable' },503);
    if (!membership) return json({ error:'Forbidden' },403);
  }
  const { data:source,error:sourceError } = await db.from('lead_sources').select('id').eq('tenant_id',NGHS_TENANT_ID)
    .eq('name','Paragon Media').eq('type','publisher').maybeSingle();
  if (sourceError || !source) return json({ error:'Paragon source unavailable' },503);
  const { data:currentConfig,error:configLookupError } = await db.from('vendor_routing_config')
    .select('*').eq('source_id',source.id).single();
  if (configLookupError || !currentConfig) return json({ error:'Routing settings unavailable' },503);
  let newReportToken = null;
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'config') {
      const states = body.allowed_states;
      const required = Array.isArray(body.required_carriers) ? body.required_carriers.map(normalizeCarrier) : null;
      const critical = Array.isArray(body.critical_carriers) ? body.critical_carriers.map(normalizeCarrier) : null;
      const ttl = Number(body.reservation_ttl_seconds);
      const year = Number(body.plan_year);
      if (!Array.isArray(states) || !states.length || states.some(s => !STATES.has(s)) ||
        !Array.isArray(required) || !required.length || required.some(c => !CARRIERS.includes(c)) ||
        !Array.isArray(critical) || critical.some(c => !required.includes(c)) ||
        !Number.isInteger(ttl) || ttl < 5 || ttl > 120 ||
        !Number.isInteger(year) || year < 2027 || year > 2100) return json({ error:'Invalid routing settings' },400);
      const { error } = await db.from('vendor_routing_config').update({
        allowed_states:[...new Set(states)],required_carriers:[...new Set(required)],
        critical_carriers:[...new Set(critical)],plan_year:year,
        reservation_ttl_seconds:ttl,updated_at:new Date().toISOString(),
      }).eq('source_id',source.id);
      if (error) return json({ error:error.message },500);
    } else if (body.action === 'matrix') {
      const carriers = Array.isArray(body.carriers) ? body.carriers.map(normalizeCarrier) : null;
      if (!STATES.has(body.state) || typeof body.agent_id !== 'string' || !carriers ||
        carriers.some(c => !CARRIERS.includes(c))) return json({ error:'Invalid matrix row' },400);
      const { data:agent } = await db.from('tenant_agents').select('id').eq('tenant_id',NGHS_TENANT_ID)
        .eq('id',body.agent_id).maybeSingle();
      if (!agent) return json({ error:'Agent not found' },404);
      if (body.licensed === false) {
        const { error } = await db.from('vendor_agent_state_eligibility').delete().eq('source_id',source.id)
          .eq('plan_year',currentConfig.plan_year)
          .eq('agent_id',agent.id).eq('state',body.state);
        if (error) return json({ error:error.message },500);
      } else {
        const flags = Object.fromEntries(CARRIERS.map(c => [c,carriers.includes(c)]));
        const { error } = await db.from('vendor_agent_state_eligibility').upsert({
          source_id:source.id,plan_year:currentConfig.plan_year,agent_id:agent.id,state:body.state,...flags,
          updated_by:auth.userId || auth.user?.id || 'admin',updated_at:new Date().toISOString(),
        },{ onConflict:'source_id,plan_year,agent_id,state' });
        if (error) return json({ error:error.message },500);
      }
    } else if (body.action === 'report_token_rotate') {
      newReportToken = randomBytes(32).toString('base64url');
      const token_hash = createHash('sha256').update(newReportToken).digest('hex');
      const { error } = await db.from('paragon_report_tokens').upsert({
        source_id:source.id,token_hash,updated_at:new Date().toISOString(),updated_by:auth.userId || 'admin',
      },{onConflict:'source_id'});
      if (error) return json({ error:'Unable to rotate report token' },503);
    } else if (body.action === 'report_token_revoke') {
      const { error } = await db.from('paragon_report_tokens').delete().eq('source_id',source.id);
      if (error) return json({ error:'Unable to revoke report token' },503);
    } else return json({ error:'Invalid action' },400);
  }
  const config = request.method === 'POST' && (await db.from('vendor_routing_config').select('*').eq('source_id',source.id).single()) || { data:currentConfig };
  const [matrix,agents,reportToken] = await Promise.all([
    db.from('vendor_agent_state_eligibility').select('*').eq('source_id',source.id)
      .eq('plan_year',config.data.plan_year).order('state'),
    db.from('tenant_agents').select('id,name,npn,agent_slug,is_active').eq('tenant_id',NGHS_TENANT_ID).eq('is_active',true).order('name'),
    db.from('paragon_report_tokens').select('updated_at').eq('source_id',source.id).maybeSingle(),
  ]);
  if (config.error || matrix.error || agents.error || reportToken.error) return json({ error:'Routing settings unavailable' },503);
  return json({ config:config.data,matrix:matrix.data,agents:agents.data,
    report_token_updated_at:reportToken.data?.updated_at || null,
    ...(newReportToken ? {report_link:`/vendor/paragon?token=${newReportToken}`} : {}),
  });
};
