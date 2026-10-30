import {canonicalCarrier} from '../../integrations/converselySelection.js';
export const CARRIERS=['Devoted Health','Aetna','Elevance / Anthem','UnitedHealthcare','Humana','Cigna / HealthSpring','Wellcare / Centene','Zing Health','HCSC / BCBS','Manhattan Life','Other'];
export const WRITING_AGENTS=['Mike Shiomos','Mark Endres','Dylan Maria'];
export const GHL_USERS={'Mark Endres':'1UVVwLG5sFIzHVOJJjmE','Dylan Maria':'ybc6Z1qfF5PgD1k0DzOo','Mike Shiomos':''};
export const INTAKE_FIELDS=[
 ['firstName','First Name','text',true],['lastName','Last Name','text',true],['dob','Date of Birth','date',true],['phone','Phone','tel',true],['email','Email','email'],['state','State','text',true],['zip','ZIP','text'],['mbi','MBI','text',true],['medicaid','Medicaid/Subsidy Eligible','yesno'],['medicaidNum','Medicaid #/Case #','text'],
 ['prevCarrier','Previous Carrier','text',true],['newCarrier','New Carrier','carrier',true],['planName','Plan Name','text',true],['enrollCode','Plan/Enrollment Code','text',true],['premium','Monthly Premium','text',true],['personalCode','Personal Code (Sunfire/CRM)','text'],['effectiveDate','Effective Date','date'],['sixtyDayDate','60 Day Follow-Up Date','date',true],['sep','SEP/Special Circumstance','yesno'],
 ['contractId','Contract ID','text',true],['planId','Plan ID','text',true],['segmentId','Segment ID','text'],['enrollmentId','Enrollment ID','text'],['pcpName','PCP Name','text'],['agency','Agency','text',true],['aor','Writing Agent','agent',true],['hra','HRA Completed','yesno',true],['hraDate','Date of HRA','date'],['sunfireCode','SunFire Confirmation Code','text'],
];
export const fieldVisible=(key,d)=>key==='medicaidNum'?d.medicaid==='Yes':key==='hraDate'?d.hra==='Yes':true;
export const emptyIntake=(agent='')=>Object.fromEntries([...INTAKE_FIELDS.map(([key])=>[key,'']),...Object.entries({agency:'New Gen Health Solutions',aor:WRITING_AGENTS.includes(agent)?agent:'',medicaid:'No',sep:'No',hra:'No',segmentId:'0'})]);
export function formatPhone(value){let s=String(value||'').replace(/\D/g,'');if(s.length===11 && s[0]==='1')s=s.slice(1);s=s.slice(0,10);return s.length>6?`(${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`:s.length>3?`(${s.slice(0,3)}) ${s.slice(3)}`:s?`(${s}`:'';}
export function formatMbi(value){const s=String(value||'').replace(/[^a-z0-9]/gi,'').toUpperCase().slice(0,11);return [s.slice(0,4),s.slice(4,7),s.slice(7)].filter(Boolean).join('-');}
export function formatPremium(value){const s=String(value??'').replace(/[$,\s]/g,'');return /^\d+(\.\d{0,2})?$/.test(s)?`$${Number(s).toFixed(2)}`:'';}
export const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
export function followUpDate(value){if(!validDate(value))return '';const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+60);return date.toISOString().slice(0,10);}
export const carrierKey=label=>canonicalCarrier(label) || ({'HCSC / BCBS':'HCSC','Manhattan Life':'ManhattanLife',Other:'Other'}[label] || null);
export function landscapeCarrierMatches(name,label){
 const key=carrierKey(name);if(key)return key===carrierKey(label);
 const patterns={'UnitedHealthcare':/united\s*healthcare|aarp/i,'Devoted Health':/devoted/i,Aetna:/aetna|cvs/i,'Elevance / Anthem':/anthem|elevance|amerigroup|wellpoint/i,Humana:/humana/i,'Cigna / HealthSpring':/cigna|healthspring/i,'Wellcare / Centene':/wellcare|centene|allwell/i,'Zing Health':/zing/i,'HCSC / BCBS':/hcsc|blue cross|blue shield|bcbs/i,'Manhattan Life':/manhattan/i};
 if(label==='HCSC / BCBS' && patterns['Elevance / Anthem'].test(name))return false;
 return Boolean(patterns[label]?.test(name));
}
export function normalizeIntake(input){const d=Object.fromEntries(INTAKE_FIELDS.map(([key])=>[key,String(input[key]??'').trim()]));return {...d,phone:formatPhone(d.phone),mbi:formatMbi(d.mbi),premium:formatPremium(d.premium),state:d.state.toUpperCase(),segmentId:d.segmentId||'0',medicaidNum:d.medicaid==='Yes'?d.medicaidNum:'',hraDate:d.hra==='Yes'?d.hraDate:''};}
export function intakeErrors(d){const errors={};for(const [key,label,type,required] of INTAKE_FIELDS){if(required && !String(d[key]??'').trim())errors[key]=label;if(type==='date' && d[key] && !validDate(d[key]))errors[key]=`${label} (valid date required)`;if(String(d[key]||'').length>500)errors[key]=`${label} (too long)`;}
 if(!/^\(\d{3}\) \d{3}-\d{4}$/.test(d.phone||''))errors.phone='Phone (10 digits required)';
 if(!/^[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{4}$/.test(d.mbi||''))errors.mbi='MBI (11 characters required)';
 if(!/^[A-Z]{2}$/.test(d.state||''))errors.state='State (two-letter code required)';
 if(!formatPremium(d.premium))errors.premium='Monthly Premium';
 if(!CARRIERS.includes(d.newCarrier))errors.newCarrier='New Carrier';
 if(!WRITING_AGENTS.includes(d.aor))errors.aor='Writing Agent';
 for(const key of ['medicaid','sep','hra'])if(!['Yes','No'].includes(d[key]))errors[key]=key;
 if(d.newCarrier==='UnitedHealthcare' && !d.sunfireCode?.trim())errors.sunfireCode='SunFire Confirmation Code (required for UnitedHealthcare)';
 if(d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))errors.email='Email (valid email required)';
 return errors;}
export const planAutofill=plan=>({planName:plan.plan_name,contractId:plan.contract_id,planId:plan.plan_id,segmentId:plan.segment_id||'0',premium:plan.monthly_premium==null?'':formatPremium(plan.monthly_premium)});
export function ghlPayload(d,submittedAt,users=GHL_USERS){const assigned=users[d.aor]||users['Mark Endres'];return Object.fromEntries(['firstName','lastName','dob','phone','email','state','mbi','medicaid','medicaidNum','prevCarrier','newCarrier','planName','enrollCode','premium','sunfireCode','effectiveDate','sixtyDayDate','sep','contractId','planId','segmentId','enrollmentId','pcpName','agency','aor','assignedUserId','assignedTo','hra','hraDate','submittedAt'].map(key=>[key,({assignedUserId:assigned,assignedTo:assigned,submittedAt,agency:'New Gen Health Solutions'})[key]??d[key]??'']));}
export function intakeCallFields(call,intake){const d=intake.data;return {...call,enrollment_intake_id:intake.id,carrier_name:d.newCarrier,plan_name:d.planName,plan_id:d.planId,effective_date:d.effectiveDate,enrollment_confirmation_number:d.enrollmentId,sunfire_code:d.sunfireCode,customer_first_name:d.firstName,customer_last_name:d.lastName,customer_phone:d.phone,customer_state:d.state,zip_code:d.zip,metadata:{...call.metadata,contract_id:d.contractId,segment_id:d.segmentId,submission_date:intake.submitted_at}};}
