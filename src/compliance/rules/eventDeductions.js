// Original definitions/weights remain intact. Only duplicate deductions are neutralized.
export const EVENT_GROUPS=[
 {id:'soa',rules:['SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','SOA_001_SOA_REFERENCE','SOA_004_SOA_SCOPE_STATED']},
 {id:'tpmo',rules:['CALL_OPEN_009_TPMO_TIMING_2027','CALL_OPEN_008_TPMO_DISCLAIMER_2027','CALL_OPEN_010_TPMO_ORG_COUNT','CALL_OPEN_011_TPMO_PLAN_COUNT','CALL_OPEN_013_TPMO_RESOURCE_2027']},
 {id:'coverage-effect',rules:['PECL_010_DISENROLLMENT_UNDERSTOOD','IMPACT_001_CURRENT_PLAN_DISENROLL']},
 {id:'premium',rules:['PECL_002_PREMIUM_CONFIRMED','PLAN_004_PREMIUM_STATED']},
 {id:'service-cost',rules:['PECL_009_COST_SHARING_UNDERSTOOD','PLAN_007_COPAY_STRUCTURE']},
 {id:'drug-topic',rules:['PECL_007_DRUG_COVERAGE_CONFIRMED','PLAN_010_DRUG_COVERAGE_OVERVIEW']},
 {id:'provider-network',rules:['PECL_005_PROVIDER_NETWORK_CONFIRMED','PLAN_014_PROVIDER_NETWORK_CHECK']},
 {id:'voluntary',rules:['ENROLL_001_ENROLLMENT_VOLUNTARY','IMPACT_009_VOLUNTARY_DISENROLLMENT']},
 {id:'scope-violation',sameEvidence:true,rules:['SOA_005_SOA_SCOPE_MATCH','SOA_006_SOA_SCOPE_VIOLATION','CONDUCT_005_NO_SCOPE_CREEP']},
 {id:'misleading-conduct',sameEvidence:true,rules:['CONDUCT_004_NO_MISLEADING_LANGUAGE','CONDUCT_009_ACCURATE_INFORMATION','CONDUCT_010_NO_GUARANTEES','CONDUCT_011_NO_SAVINGS_CLAIMS','PLAN_025_BENEFITS_ACCURATE','PLAN_027_NO_MISLEADING_COMPARISONS','PLAN_028_NO_UNSUBSTANTIATED_CLAIMS']},
];
const code=i=>i.rule_id||i.intent_code;
export function applyEventDeductions(items){
 for(const group of EVENT_GROUPS){
  const members=items.filter(i=>group.rules.includes(code(i)));
  const failed=members.filter(i=>i.result==='fail'&&i.points_possible>i.points_earned);
  if(!failed.length)continue;
  const evidenceGroups=new Map();
  for(const item of failed){const key=`${item.evidence_timestamp_ms}:${item.evidence_text||code(item)}`;const rows=evidenceGroups.get(key)||[];rows.push(item);evidenceGroups.set(key,rows);}
  const batches=group.sameEvidence?[...evidenceGroups.values()]:[failed];
  for(const batch of batches){
   let candidates=batch;
   if(group.id==='tpmo'){
    const timing=batch.find(i=>code(i)==='CALL_OPEN_009_TPMO_TIMING_2027'&&/after/.test(i.missing||i.notes||''));
    const specific=batch.filter(i=>/TPMO_(?:ORG_COUNT|PLAN_COUNT|RESOURCE)/.test(code(i)));
    const anyPass=members.some(i=>i.result==='pass');
    if(timing)candidates=[timing];else if(anyPass&&specific.length)candidates=specific;
   }
   const primary=[...candidates].sort((a,b)=>b.points_possible-a.points_possible||group.rules.indexOf(code(a))-group.rules.indexOf(code(b)))[0];
   for(const item of batch)if(item!==primary){
    Object.assign(item,{result:'na',points_earned:0,points_possible:0,auto_fail_triggered:false,is_auto_fail:false,covered_by_rule_id:code(primary),notes:`Covered by ${code(primary)}`,missing_reason:`Covered by ${code(primary)}`});
   }
  }
 }
 return items;
}
