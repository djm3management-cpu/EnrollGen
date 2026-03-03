function getDeterministicBlockers(state = {}) {
  const blockers = [];
  const notes = state.notes || {};
  const enrollChecks = state.enrollChecks || {};

  if (!state.recordingOk) {
    blockers.push({
      id: "recording_missing",
      severity: "high",
      label: "Recording disclosure incomplete",
      detail: "Complete the recording disclosure before advancing the sale.",
    });
  }

  if (!state.tpmoOk) {
    blockers.push({
      id: "tpmo_missing",
      severity: "critical",
      label: "TPMO disclaimer incomplete",
      detail: "Finish the TPMO disclaimer before recommendation or enrollment.",
    });
  }

  if (!String(state.tpmoZip || "").trim()) {
    blockers.push({
      id: "tpmo_zip_missing",
      severity: "high",
      label: "ZIP missing",
      detail: "Capture the beneficiary ZIP before plan-specific recommendation.",
    });
  }

  if (!String(state.tpmoOrgs || "").trim() || !String(state.tpmoPlans || "").trim()) {
    blockers.push({
      id: "tpmo_counts_missing",
      severity: "high",
      label: "TPMO counts missing",
      detail: "Enter represented organization and plan counts for the area.",
    });
  }

  if (!state.soaOk) {
    blockers.push({
      id: "soa_missing",
      severity: "critical",
      label: "Scope of appointment incomplete",
      detail: "Get permission to discuss the products before continuing.",
    });
  }

  if (state.snpType && !state.snpOk) {
    blockers.push({
      id: "snp_disclosure_missing",
      severity: "critical",
      label: `${state.snpType} disclosure incomplete`,
      detail: "Finish the applicable SNP verification/disclosure before submission.",
    });
  }

  if (!state.sobOk) {
    blockers.push({
      id: "sob_missing",
      severity: "high",
      label: "Summary of benefits incomplete",
      detail: "Complete the SOB review before enrollment.",
    });
  }

  if (!enrollChecks.epConfirmed) {
    blockers.push({
      id: "election_period_unconfirmed",
      severity: "critical",
      label: "Election period not confirmed",
      detail: "Confirm the enrollment period basis before submission.",
    });
  }

  if (!enrollChecks.piiConsent) {
    blockers.push({
      id: "pii_consent_missing",
      severity: "high",
      label: "PII consent incomplete",
      detail: "Obtain consent before completing enrollment submission steps.",
    });
  }

  if (!enrollChecks.planConfirm) {
    blockers.push({
      id: "plan_confirmation_missing",
      severity: "high",
      label: "Plan confirmation incomplete",
      detail: "Confirm the exact plan before submission.",
    });
  }

  if (!enrollChecks.submitConsent) {
    blockers.push({
      id: "submission_consent_missing",
      severity: "critical",
      label: "Submission consent incomplete",
      detail: "Get permission to submit the application before marking enrollment complete.",
    });
  }

  if (!String(notes.planName || "").trim()) {
    blockers.push({
      id: "plan_name_missing",
      severity: "medium",
      label: "Plan name missing",
      detail: "Enter the selected plan name for the session record.",
    });
  }

  if (!String(notes.effectiveDate || "").trim()) {
    blockers.push({
      id: "effective_date_missing",
      severity: "high",
      label: "Effective date missing",
      detail: "Capture the proposed effective date before submission.",
    });
  }

  return blockers;
}

module.exports = {
  getDeterministicBlockers,
};
