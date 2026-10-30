import {postJson} from './transport.js';
const checked=({data,error})=>{if(error)throw Error('database_error');return data;};
export async function deliverEnrollmentWebhooks(db,{env=process.env,send=postJson,limit=10}={}){
 // Queue is durable even before the server secret is configured.
 if(!env.GHL_ENROLLMENT_WEBHOOK_URL)return;
 for(let n=0;n<limit;n++){
  const [job]=checked(await db.rpc('claim_compliance_upload',{p_provider:'ghl'}))||[];
  if(!job)break;
  let success=false,error=null;
  try{
   const snapshot=checked(await db.from('ghl_enrollment_deliveries').select('payload_encrypted').eq('id',job.id).single());
   const payload=checked(await db.rpc('decrypt_pii_value',{p_encrypted:snapshot.payload_encrypted}));
   const response=await send(env.GHL_ENROLLMENT_WEBHOOK_URL,payload,{'Idempotency-Key':job.id});
   if(response.status<200 || response.status>=300)throw Error('webhook_failed');
   success=true;
  }catch{error='ghl_delivery_failed';}
  checked(await db.rpc('finish_compliance_upload',{p_provider:'ghl',p_id:job.id,p_token:job.lease_token,p_success:success,p_error:error}));
 }
}
