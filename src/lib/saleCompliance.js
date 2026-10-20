// Post-call compliance eligibility only. Live Co-Pilot has its own lifecycle.
export const COMPLIANCE_SALE_OUTCOMES = ['enrolled', 'enrolled_pending_verification'];
export const isComplianceSale = outcome => COMPLIANCE_SALE_OUTCOMES.includes(outcome);
