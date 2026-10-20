import {normalizeDateInput} from './dateInput.js';

// Optional record enrichment. None of these fields is a wrap-up/scoring gate.
export const OPTIONAL_CALL_FIELDS = [
 ['agent_notes','Notes','textarea'],
 ['customer_first_name','First name'],['customer_last_name','Last name'],
 ['customer_phone','Phone'],['customer_email','Email'],['customer_dob','Date of birth','date'],
 ['customer_state','State'],['customer_mbi','MBI / Member ID'],['medicaid','Medicaid eligible'],
 ['medicaid_number','Medicaid number'],['previous_carrier','Previous carrier'],
 ['carrier_name','New carrier'],['plan_name','Plan name'],['plan_id','Plan ID'],
 ['enrollment_code','Plan / enrollment code'],['premium','Monthly premium'],['sunfire_code','Sunfire code'],
 ['effective_date','Effective date','date'],['sixty_day_date','Follow-up date','date'],
 ['enrollment_confirmation_number','Confirmation number'],['sep','SEP'],['agency','Agency'],
 ['writing_agent','Writing agent'],['hra','HRA completed'],['hra_date','HRA date','date'],
];
export function optionalCallDetailsPatch(input) {
 const patch={};
 for(const [key,label,type] of OPTIONAL_CALL_FIELDS){
  if(!Object.hasOwn(input,key))continue;
  const value=input[key];
  if(value!==null && typeof value!=='string')throw new Error(`${label} must be text.`);
  if(typeof value==='string' && value.length>10000)throw new Error(`${label} is too long.`);
  const text=value?.trim()||null;
  if(type==='date' && text){
   const date=normalizeDateInput(text);if(!date)throw new Error(`Enter a valid ${label.toLowerCase()}.`);
   patch[key]=date;
  }else patch[key]=text;
 }
 return patch;
}
