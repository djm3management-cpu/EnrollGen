import {requireClerkAuth} from './_clerkAuth.js';
import {EvidenceError,checked,evidenceJson,evidenceFailure,getEvidenceServiceClient,resolveCallAccessIdentity,scopeCallToIdentity} from './_evidenceAccess.js';
import {emptyIntake,normalizeIntake,intakeErrors,ghlPayload,carrierKey,CARRIERS,landscapeCarrierMatches} from '../../src/lib/enrollmentIntake.js';
import {deliverEnrollmentWebhooks} from '../../integrations/enrollmentWebhook.js';
export function createEnrollmentIntakesHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,deliver=deliverEnrollmentWebhooks,now=()=>new Date().toISOString()}={}){
 return async request=>{
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth),{agent,tenant}=identity,url=new URL(request.url);
   const callId=url.searchParams.get('call_id');
   if(!/^[0-9a-f-]{36}$/i.test(callId||''))throw new EvidenceError(400,'Call ID is required.');
   const call=checked(await scopeCallToIdentity(db.from('call_records').select('*').eq('id',callId),identity).maybeSingle());
   if(!call)throw new EvidenceError(403,'Call is unavailable for this agent.');
   if(url.searchParams.has('plans')){
    const state=url.searchParams.get('state')||'',carrier=url.searchParams.get('carrier');
    if(!/^[A-Z]{2}$/.test(state)||!CARRIERS.includes(carrier))throw new EvidenceError(400,'Choose a carrier and state.');
    const search=(url.searchParams.get('q')||'').replace(/[^a-z0-9 -]/gi,'').slice(0,80);
    // Read all matching state rows in pages: landscape rows repeat by county.
    let plans=[];
    for(let offset=0;;offset+=1000){
     let query=db.from('cms_plans_py2027').select('id,carrier,plan_name,contract_id,plan_id,segment_id,monthly_premium,county_name').eq('plan_year',2027).eq('state_code',state).in('category',['MA','MA-PD','SNP']).order('id').range(offset,offset+999);
     if(search)query=query.ilike('plan_name',`%${search}%`);
     const page=checked(await query)||[];plans.push(...page);if(page.length<1000)break;
    }
    const seen=new Set();
    plans=plans.filter(p=>{
     const matches=landscapeCarrierMatches(p.carrier,carrier);
     const key=[p.contract_id,p.plan_id,p.segment_id,p.monthly_premium].join(':');
     if(!matches||seen.has(key))return false;seen.add(key);return true;
    });
    return evidenceJson(200,{plans});
   }
   if(request.method==='POST'){
    let input;try{input=await request.json();}catch{throw new EvidenceError(400,'Invalid JSON.');}
    if(!input?.data || typeof input.data!=='object')throw new EvidenceError(400,'Intake fields are required.');
    const data=normalizeIntake(input.data),errors=intakeErrors(data);
    if(Object.keys(errors).length)return evidenceJson(400,{error:`Complete or correct: ${Object.values(errors).join(', ')}`,fields:errors});
    const contactId=input.contact_id||call.contact_id;
    const contact=checked(await db.from('contacts').select('id').eq('id',contactId).eq('tenant_id',tenant.id).maybeSingle());
    if(!contact)throw new EvidenceError(400,'Link a contact before saving the enrollment intake.');
    let previous=null;
    if(input.id){
     previous=checked(await db.from('enrollment_intakes').select('id,submitted_at').eq('id',input.id).eq('call_id',callId).eq('tenant_id',tenant.id).maybeSingle());
     if(!previous)throw new EvidenceError(403,'Intake unavailable for this call.');
    }
    const submittedAt=previous?.submitted_at||now();
    const id=checked(await db.rpc('save_enrollment_intake',{p_id:previous?.id||null,p_tenant:tenant.id,p_call:callId,p_contact:contactId,p_data:data,p_carrier:carrierKey(data.newCarrier),p_payload:ghlPayload(data,submittedAt)}));
    // Durable save precedes delivery. Provider failures never change save success.
    try{await deliver(db,{limit:1});}catch{ /* No submitted PII or provider response is logged. */ }
    return evidenceJson(200,{saved:true,id});
   }
   const rows=checked(await db.from('enrollment_intakes').select('*').eq('call_id',callId).eq('tenant_id',tenant.id).order('submitted_at'))||[];
   const intakes=[];
   for(const row of rows){
    const data={...row.data};
    for(const key of ['dob','mbi','medicaidNum'])data[key]=checked(await db.rpc('decrypt_pii_value',{p_encrypted:row.pii_encrypted[key]}))||'';
    const jobs=checked(await db.from('ghl_enrollment_deliveries').select('status,attempts,last_error,created_at').eq('intake_id',row.id).order('revision',{ascending:false}).limit(1));
    intakes.push({id:row.id,contact_id:row.contact_id,data,submitted_at:row.submitted_at,sync:jobs[0]||{status:'pending'}});
   }
   let contact={};
   if(call.contact_id){
    const row=checked(await db.from('contacts').select('*').eq('id',call.contact_id).eq('tenant_id',tenant.id).maybeSingle());
    contact={...row};
    for(const key of ['first_name','last_name','dob','phone','email','mbi_full'])if(row?.pii_encrypted?.[key])contact[key]=checked(await db.rpc('decrypt_pii_value',{p_encrypted:row.pii_encrypted[key]}));
   }
   const callAgent=call.agent_id===agent?.id?agent:call.agent_id?checked(await db.from('enrolled_agents').select('id,name').eq('id',call.agent_id).eq('tenant_id',tenant.id).maybeSingle()):null;
   const prefill={...emptyIntake(callAgent?.name||call.agent_name||''),firstName:contact.first_name||call.customer_first_name||'',lastName:contact.last_name||call.customer_last_name||'',dob:contact.dob||call.customer_dob||'',phone:contact.phone||call.customer_phone||'',email:contact.email||call.customer_email||'',state:contact.state||call.customer_state||call.state_code||'',zip:contact.zip||call.zip_code||'',mbi:contact.mbi_full||call.customer_mbi||'',prevCarrier:contact.current_carrier||'',sunfireCode:call.sunfire_code||''};
   return evidenceJson(200,{intakes,prefill,contact_id:call.contact_id,product_type:call.product_type});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createEnrollmentIntakesHandler();
