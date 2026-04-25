import { callOpening } from './call-opening.js';
import { soaVerification } from './soa-verification.js';
import { eligibilityVerification } from './eligibility.js';
import { needsAssessment } from './needs-assessment.js';
import { planPresentation } from './plan-presentation.js';
import { impactCoverage } from './impact-coverage.js';
import { preEnrollmentChecklist } from './pecl.js';
import { enrollmentClosing } from './enrollment-closing.js';
import { salesConduct } from './sales-conduct.js';
import { callRecording } from './call-recording.js';

export const INTENT_CATEGORIES = {
  CALL_OPENING: callOpening,
  SOA_VERIFICATION: soaVerification,
  ELIGIBILITY_VERIFICATION: eligibilityVerification,
  NEEDS_ASSESSMENT: needsAssessment,
  PLAN_PRESENTATION: planPresentation,
  IMPACT_ON_CURRENT_COVERAGE: impactCoverage,
  PRE_ENROLLMENT_CHECKLIST: preEnrollmentChecklist,
  ENROLLMENT_CLOSING: enrollmentClosing,
  SALES_CONDUCT: salesConduct,
  CALL_RECORDING_COMPLIANCE: callRecording,
};

export const ALL_INTENTS = [
  ...callOpening,
  ...soaVerification,
  ...eligibilityVerification,
  ...needsAssessment,
  ...planPresentation,
  ...impactCoverage,
  ...preEnrollmentChecklist,
  ...enrollmentClosing,
  ...salesConduct,
  ...callRecording,
];

export const CATEGORY_WEIGHTS = {
  CALL_OPENING: { weight: 0.15, max_points: 30 },
  SOA_VERIFICATION: { weight: 0.08, max_points: 16 },
  ELIGIBILITY_VERIFICATION: { weight: 0.10, max_points: 20 },
  NEEDS_ASSESSMENT: { weight: 0.14, max_points: 28 },
  PLAN_PRESENTATION: { weight: 0.15, max_points: 30 },
  IMPACT_ON_CURRENT_COVERAGE: { weight: 0.10, max_points: 20 },
  PRE_ENROLLMENT_CHECKLIST: { weight: 0.12, max_points: 24 },
  ENROLLMENT_CLOSING: { weight: 0.08, max_points: 16 },
  SALES_CONDUCT: { weight: 0.06, max_points: 12 },
  CALL_RECORDING_COMPLIANCE: { weight: 0.02, max_points: 4 },
};

export function getIntentByCode(code) {
  return ALL_INTENTS.find(i => i.intent_code === code) || null;
}

export function getIntentsByCategory(category) {
  return INTENT_CATEGORIES[category] || [];
}

export function getAutoFailIntents() {
  return ALL_INTENTS.filter(i => i.auto_fail);
}

export function getSequenceSensitiveIntents() {
  return ALL_INTENTS.filter(i => i.is_sequence_sensitive);
}
