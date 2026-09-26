import { requireClerkAuth } from './_clerkAuth.js';
import { isAdminAuth, NGHS_TENANT_ID, JSON_HEADERS, getSupabase } from './_tenantSettings.js';

export default async request => {
  if (!['GET','POST'].includes(request.method)) return new Response('Method Not Allowed',{status:405});
  const auth=await requireClerkAuth(request); if(auth.response)return auth.response;
  if(!isAdminAuth(auth)) return new Response(JSON.stringify({error:'Forbidden'}),{status:403,headers:JSON_HEADERS});
  const db=getSupabase();
  if(request.method==='POST'){
    const body=await request.json().catch(()=>({}));
    const paused=body.paused===true;
    const {error}=await db.rpc('set_vendor_pause',{p_tenant_id:NGHS_TENANT_ID,p_paused:paused,p_actor:auth.userId||auth.user?.id||'admin'});
    if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers:JSON_HEADERS});
  }
  const {data,error}=await db.from('vendor_controls').select('vendor_pause,updated_at,updated_by').eq('tenant_id',NGHS_TENANT_ID).maybeSingle();
  if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers:JSON_HEADERS});
  return new Response(JSON.stringify(data||{vendor_pause:false}),{status:200,headers:JSON_HEADERS});
};
