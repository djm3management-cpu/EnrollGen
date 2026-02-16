/* =====================================================
   SCRIPT FLOW REDUCER
   Centralizes all enrollment flow state in one place.
   ===================================================== */

export const initialState = {
  // Section gates
  recordingOk: false,
  tpmoOk: false,
  soaOk: false,
  qualOk: false,
  neadsOk: false,
  sobOk: false,
  enrollOk: false,

  // SNP branching
  snpType: null, // "DSNP" | "CSNP" | null
  snpOk: false,

  // Optional wrap-up products
  hiActive: false,
  hiConsentOk: false,
  hiDiscussed: false,
  feActive: false,
  feConsentOk: false,
  feDiscussed: false,
  dvActive: false,
  dvConsentOk: false,
  dvDiscussed: false,

  // Agent & TPMO fields
  agentName: "",
  tpmoZip: "",
  tpmoOrgs: "",
  tpmoPlans: "",

  // Part B reduction toggle
  partBReduction: false,

  // Local notes
  notes: {
    planName: "",
    effectiveDate: "",
    enrollmentCode: "",
    confirmation: "",
  },

  // Pre-enrollment checklist
  preEnrollChecks: {
    providers: false,
    rx: false,
    costs: false,
    moop: false,
    rules: false,
    coverageImpact: false,
  },

  // SOB checklist
  sobChecks: {
    premium: false,
    deductible: false,
    moop: false,
    network: false,
    rx: false,
    referralsPA: false,
    extras: false,
    limitations: false,
  },

  // Enrollment checklist
  enrollChecks: {
    epConfirmed: false,
    piiConsent: false,
    planConfirm: false,
    submitConsent: false,
  },

  // Main timer
  tpmoRunning: false,
  tpmoStart: null,
};

export function scriptReducer(state, action) {
  switch (action.type) {
    /* ---- Simple boolean gates ---- */
    case "SET_GATE":
      return { ...state, [action.field]: action.value };

    /* ---- Text field updates ---- */
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };

    /* ---- Notes (nested object) ---- */
    case "SET_NOTE":
      return {
        ...state,
        notes: { ...state.notes, [action.field]: action.value },
      };

    /* ---- Checklist items (nested objects) ---- */
    case "SET_PRE_ENROLL_CHECK":
      return {
        ...state,
        preEnrollChecks: {
          ...state.preEnrollChecks,
          [action.field]: action.value,
        },
      };

    case "SET_SOB_CHECK":
      return {
        ...state,
        sobChecks: { ...state.sobChecks, [action.field]: action.value },
      };

    case "SET_ENROLL_CHECK":
      return {
        ...state,
        enrollChecks: { ...state.enrollChecks, [action.field]: action.value },
      };

    /* ---- SNP ---- */
    case "SET_SNP_TYPE":
      return { ...state, snpType: action.value, snpOk: false };

    /* ---- Timer controls ---- */
    case "START_TIMER":
      return { ...state, tpmoRunning: true, tpmoStart: Date.now() };

    case "RESET_TIMER":
      return { ...state, tpmoRunning: false, tpmoStart: null };

    /* ---- Toggle optional products ---- */
    case "TOGGLE_PRODUCT":
      return { ...state, [action.field]: !state[action.field] };

    default:
      return state;
  }
}

/* ---- Derived state helpers ---- */
export function getActiveSection(state) {
  if (!state.recordingOk) return 1;
  if (!state.tpmoOk) return 2;
  // SNP section shows between TPMO and SOA when SNP type is selected but not confirmed
  if (state.snpType && !state.snpOk) return 2.5;
  if (!state.soaOk) return 3;
  if (!state.qualOk) return 4;
  if (!state.neadsOk) return 5;
  if (!state.sobOk) return 6;
  if (!state.enrollOk) return 7;
  return 8;
}

export function getSectionUnlocked(state) {
  return {
    s1: true,
    s2: state.recordingOk,
    s2_5: state.tpmoOk,
    s3: state.tpmoOk && (!state.snpType || state.snpOk),
    s4: state.soaOk,
    s5: state.qualOk,
    s6: state.neadsOk,
    s7: state.sobOk,
    s8: state.enrollOk,
  };
}

export function allChecked(obj) {
  return Object.values(obj).every(Boolean);
}
