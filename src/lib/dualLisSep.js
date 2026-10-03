export const DUAL_LIS_GUIDANCE = "Full-benefit duals, partial-benefit duals, and people with Extra Help may make one election per calendar month to a standalone PDP, including leaving MA-PD for Original Medicare plus a PDP. Effective the first day of the next month. This SEP does not authorize an MA-to-MA switch. Not available to Part D at-risk or potential-at-risk beneficiaries.";
export const INTEGRATED_CARE_GUIDANCE = "Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.";
export const ALIGNMENT_GUIDANCE = "Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.";
export const PDP_LANE = "Dual/LIS SEP: monthly standalone PDP elections, including Original Medicare plus PDP; does not authorize standard MA enrollment. A standard MA fallback requires another valid election period.";
export const INTEGRATED_LANE = "Integrated Care SEP: monthly election for full-benefit duals into an eligible FIDE/HIDE/AIP D-SNP with verified Medicaid MCO alignment.";

export function isIntegratedDsnp(plan) {
  if (!plan || !['D-SNP', 'Dual-Eligible'].includes(plan.snp || plan.snp_type)) return false;
  const integration=String(plan.dsnpIntegrationStatus ?? plan.dsnp_integration_status ?? '').trim().toUpperCase();
  const aip=String(plan.dsnpAipIdentifier ?? plan.dsnp_aip_identifier ?? '').trim().toLowerCase();
  return ['FIDE','HIDE','FIDE SNP','HIDE SNP','FIDE-SNP','HIDE-SNP'].includes(integration) || ['yes','y','1','true','aip'].includes(aip);
}

function integratedPlanEvidence(plan) {
  if (!plan) return null;
  const snp=plan.snp || plan.snp_type;
  if (snp && !['D-SNP','Dual-Eligible'].includes(snp)) return false;
  if (isIntegratedDsnp(plan)) return true;
  const integration=String(plan.dsnpIntegrationStatus ?? plan.dsnp_integration_status ?? '').trim().toUpperCase();
  if (['NON-INTEGRATED','NON INTEGRATED','COORDINATION-ONLY','COORDINATION ONLY','CO','NONE','NOT INTEGRATED'].includes(integration)) return false;
  return null;
}

// Unknown evidence is guidance to verify, never an affirmative election right.
export function evaluateDualLisSep(subject = {}) {
  const dual=['full_dual','partial_dual'].includes(subject.medicaidStatus);
  const noDual=subject.medicaidStatus==='none';
  let pdp='verification_required', integrated='verification_required';
  if (subject.partDAtRisk===true || subject.pdpElectionUsedThisMonth===true || (noDual && subject.hasLis===false)) pdp='ineligible';
  else if ((dual || subject.hasLis===true) && subject.partDAtRisk===false && subject.pdpElectionUsedThisMonth===false) pdp='eligible';
  if (['none','partial_dual'].includes(subject.medicaidStatus) || subject.integratedElectionUsedThisMonth===true || subject.alignedEnrollmentVerified===false || subject.targetPlanInServiceArea===false || integratedPlanEvidence(subject.targetPlan)===false) integrated='ineligible';
  else if (subject.medicaidStatus==='full_dual' && isIntegratedDsnp(subject.targetPlan) && subject.alignedEnrollmentVerified===true && subject.targetPlanInServiceArea===true && subject.integratedElectionUsedThisMonth===false) integrated='eligible';
  return {pdp, integrated};
}

export function dualLisSepCards({subject, plans=[]} = {}) {
  const rights=evaluateDualLisSep(subject);
  const base={category:'Medicare',startDate:'Year-round',endDate:'Year-round',duration:'Once per calendar month; effective first day of next month',source:'CMS',urgency:'info'};
  return [
    {...base,id:'medicare-dual-lis',type:'Dual / LIS monthly PDP SEP',code:'DUAL/LIS',event:'Medicaid or Extra Help; verify eligibility and monthly use',description:DUAL_LIS_GUIDANCE,eligibleProducts:['PDP'],eligibilityStatus:rights.pdp,matchingPlans:plans.filter(plan=>plan.cat==='PDP')},
    {...base,id:'medicare-integrated-care',type:'Integrated-care monthly D-SNP SEP',code:'SEP-INT',event:'Full-benefit dual with verified aligned integrated-plan enrollment',description:INTEGRATED_CARE_GUIDANCE,eligibleProducts:['D-SNP'],eligibilityStatus:rights.integrated,matchingPlans:plans.filter(isIntegratedDsnp)},
  ];
}

// Pre-068 RPCs can still return the retired D-SNP/quarterly card. Do not
// reinterpret their generic D-SNP plan list as integrated-plan evidence.
export function normalizeDualLisRpcResult(result) {
  if (!Array.isArray(result?.seps) || !result.seps.some(sep=>sep?.sep_type==='Dual Eligible SNP (D-SNP) SEP')) return result;
  return {...result,seps:result.seps.flatMap(sep=>sep?.sep_type==='Dual Eligible SNP (D-SNP) SEP'
    ? dualLisSepCards().map(card=>({sep_type:card.type,period:card.duration,evidence:card.description,
      available:null,area_based:false,eligibility_status:'verification_required',eligible_products:card.eligibleProducts,plans:[]}))
    : [sep])};
}
