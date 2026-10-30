import {requireClerkAuth} from './_clerkAuth.js';
import {EvidenceError,checked,evidenceJson,evidenceFailure,getEvidenceServiceClient,resolveCallAccessIdentity,scopeCallToIdentity} from './_evidenceAccess.js';
import {OPTIONAL_CALL_FIELDS,optionalCallDetailsPatch} from '../../src/lib/callRecordDetails.js';
export function createCallRecordDetailsHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient}={}){
 return async request=>{
  if(!['GET','PATCH'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
   const id=new URL(request.url).searchParams.get('call_record_id');
   if(!/^[0-9a-f-]{36}$/i.test(id||''))throw new EvidenceError(400,'Call record ID is required.');
   const accessible=()=>scopeCallToIdentity(db.from('call_records').select(['id',...OPTIONAL_CALL_FIELDS.map(([key])=>key)].join(',')).eq('id',id),identity).maybeSingle();
   const record=checked(await accessible());if(!record)throw new EvidenceError(403,'Call is unavailable for this agent.');
   if(request.method==='GET')return evidenceJson(200,{record});
   let input;try{input=await request.json();}catch{throw new EvidenceError(400,'Invalid JSON.');}
   if(!input || Array.isArray(input) || typeof input!=='object')throw new EvidenceError(400,'Invalid details.');
   let patch;try{patch=optionalCallDetailsPatch(input);}catch(error){throw new EvidenceError(400,error.message);}
   if(Object.keys(patch).length)checked(await scopeCallToIdentity(db.from('call_records').update(patch).eq('id',id),identity));
   // Edits never queue scoring, create an opportunity, or alter disposition.
   return evidenceJson(200,{record:checked(await accessible())});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createCallRecordDetailsHandler();
