// CMS-4212-F: full disclaimer before benefits, not an elapsed-minute deadline.
export const TPMO_RULE_VERSION='MA-CY2027-full-rubric-5';
const number='(?:\\d[\\d,]*|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[ -]+(?:and|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand)){0,4})';
const gap='[\\s,;:.]+';
const org=new RegExp(`represent${gap}(?:[a-z]+${gap}){0,5}${number}(?:[ -]+or[ -]+so)?${gap}(?:organizations?|carriers?|companies)`,'i');
const plans=new RegExp(`${number}${gap}(?:results?${gap})?(?:products?|plans?)\\b`,'i');
export const hasTpmoOrgCount=text=>org.test(text);
export const hasTpmoPlanCount=text=>plans.test(text);
export const hasMedicareResource=text=>/medicare(?:\s*\.\s*gov|\s+dot\s+gov)|\bone[ -]+eight[ -]+hundred(?:[ -]+medicare)?\b|\b1\s*[-–—]?\s*800(?:\s*[-–—]?\s*medicare)?\b/i.test(text);
export function hasTpmo2027(text,context={}){return org.test(text)&&plans.test(text)&&hasMedicareResource(text)&&/all (?:of )?(?:your )?options|help with plan choices/i.test(text)&&(context.tpmo_sells_all===true||/\b(?:we (?:do )?not|we don't|we don’t|do not|not) offer (?:every|free) plan\b/i.test(text));}
export function findBenefitTrigger(line,{plan_name,carrier_name}={}){
 const text=String(line.text||'');
 // Product qualification, unrelated spending and generic verification are not plan benefits.
 if(/\b(?:internet|t.?mobile|cell ?phone bill|cable bill)\b/i.test(text)&&!/\b(?:medicare|health plan|plan benefit)\b/i.test(text))return null;
 if(/(?:plan has to|plan must).{0,30}verif|(?:part b |part b)?premium.{0,45}(?:medicaid|extra help)|(?:medicaid|extra help).{0,45}premium/i.test(text)&&!/(?:this plan (?:gives|offers)|giveback|\$\s*\d)/i.test(text))return null;
 const needs=/(?:are you|do you|would you|looking for|interested in|what (?:benefits|coverage)|which (?:benefits|coverage)|do you (?:want|need|prefer)).{0,100}(?:give.?back|otc|benefit|dental|vision|hearing|premium|allowance)/i;
 if(needs.test(text))return null;
 if(plan_name&&text.toLowerCase().includes(plan_name.toLowerCase()))return {...line,trigger_reason:'Plan name'};
 const carrier=carrier_name?text.toLowerCase().includes(carrier_name.toLowerCase()):/\b(?:humana|aetna|united ?healthcare|wellcare|cigna|anthem|devoted|alignment)\b/i.test(text);
 const pitch=carrier&&/\b(?:plan|offers?|gives?|includes?|premium|covers?)\b/i.test(text);
 const trigger=/(?:\$\s*\d+|\b(?:zero|one|two|three|four|five|ten|twenty|fifty|hundred|thousand|\d+)\s+dollars?\b|\b(?:monthly\s+)?premium\b|\bcopay(?:ment)?\b|\bdeductible\b|\bout.of.pocket maximum\b|\b(?:this|the|your) plan\s+(?:has(?! to\b)|gives you|includes|covers|offers|provides)\b)/i.exec(text);
 return pitch||trigger?{...line,trigger_reason:pitch?'Carrier plan pitch':'Plan benefit or price',trigger_index:trigger?.index??0}:null;
}
export function evaluateTpmo2027(utterances=[],context={}){
 const ordered=[...(Array.isArray(utterances)?utterances:[])].filter(u=>u?.speaker==='agent').sort((a,b)=>(a.start_ms??0)-(b.start_ms??0));
 let passage=[],disclaimer=null,firstBenefit=null,earlyDisclosure=null;const coachingFlags=[];
 for(const u of ordered){
  const value=String(u.text||'');
  if(/\bwe (?:do not|don't|don’t) offer\b/i.test(value))passage=[];
  passage.push(u);passage=passage.filter(p=>(u.end_ms??u.start_ms)-(p.start_ms??0)<=90000);
  const text=passage.map(p=>p.text).join(' '),prior=passage.slice(0,-1).map(p=>p.text).join(' ');
  const trigger=findBenefitTrigger(u,context);
  if(trigger&&!firstBenefit){
   const prefix=prior+' '+value.slice(0,trigger.trigger_index||0);
   firstBenefit={...trigger,disclaimer_before_trigger_in_same_line:hasTpmo2027(prefix,context)};
  }
  if(!disclaimer&&hasTpmo2027(text,context))disclaimer={...u,text,start_ms:passage[0].start_ms,completion_ms:u.end_ms??u.start_ms};
  if(!earlyDisclosure&&org.test(text)&&plans.test(text)&&hasMedicareResource(text))earlyDisclosure={...u,text,start_ms:passage[0].start_ms,completion_ms:u.end_ms??u.start_ms};
  if(!disclaimer&&!trigger&&/\b(?:dental|vision|hearing|grocery|food|otc|give.?back)\b/i.test(value))coachingFlags.push({...u,reason:'Extras mentioned before disclaimer'});
 }
 const beforeBenefits=!!disclaimer&&(!firstBenefit||firstBenefit.disclaimer_before_trigger_in_same_line||disclaimer.completion_ms!=null&&firstBenefit.start_ms!=null&&disclaimer.completion_ms<=firstBenefit.start_ms);
 const timingUncertain=!beforeBenefits&&!!earlyDisclosure&&!!firstBenefit&&earlyDisclosure.completion_ms<=firstBenefit.start_ms;
 return {disclaimer,firstBenefit,earlyDisclosure,beforeBenefits,timingOk:beforeBenefits,timingUncertain,coachingFlags};
}
