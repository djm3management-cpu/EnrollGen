/* =====================================================
   SCRIPT FLOW REDUCER
   Centralizes all enrollment flow state in one place.
   ===================================================== */

/* ---- localStorage helpers for auto-fill carry-forward ---- */
function loadPersisted() {
  try {
    const raw = localStorage.getItem("enrollgen_persist");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

const persisted = loadPersisted();

export const SECTION_LABELS = {
  1: "Recording Disclosure",
  2: "TPMO Disclaimer",
  2.5: "SNP Disclosure",
  3: "POA & Scope of Appointment",
  4: "Qualifications",
  5: "NEADS Assessment",
  6: "Plan Selection & SOB",
  7: "Enrollment",
  8: "Wrap-Up",
};

export const TOTAL_SECTIONS = 8; // for progress bar (SNP is conditional)

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

  // Agent & TPMO fields — auto-filled from localStorage
  agentName: persisted.agentName || "",
  callDirection: "inbound",
  tpmoZip: "",
  tpmoOrgs: persisted.tpmoOrgs || "",
  tpmoPlans: persisted.tpmoPlans || "",

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

  // Section timing — tracks start/end per section
  sectionTimestamps: {},
  // e.g. { 1: { start: Date.now(), end: Date.now() }, 2: { start: ... } }

  // Undo history for critical gates
  undoHistory: [],
  // e.g. [{ field: "recordingOk", prevValue: false, timestamp: ... }]

  // Session start time
  sessionStart: Date.now(),
};

/* ---- Persist carry-forward fields ---- */
function persistFields(state) {
  try {
    localStorage.setItem(
      "enrollgen_persist",
      JSON.stringify({
        agentName: state.agentName,
        tpmoOrgs: state.tpmoOrgs,
        tpmoPlans: state.tpmoPlans,
      })
    );
  } catch {
    /* ignore */
  }
}

export function scriptReducer(state, action) {
  let next;
  switch (action.type) {
    /* ---- Simple boolean gates ---- */
    case "SET_GATE": {
      const prevValue = state[action.field];
      const undoEntry = {
        field: action.field,
        prevValue,
        timestamp: Date.now(),
        actionType: "SET_GATE",
      };
      next = {
        ...state,
        [action.field]: action.value,
        undoHistory: [...state.undoHistory, undoEntry],
      };

      // Track section completion timestamp
      if (action.value === true) {
        const sectionNum = gateToSection(action.field);
        if (sectionNum !== null) {
          const existing = state.sectionTimestamps[sectionNum] || {};
          next.sectionTimestamps = {
            ...state.sectionTimestamps,
            [sectionNum]: { ...existing, end: Date.now() },
          };
        }
      }
      return next;
    }

    /* ---- Text field updates ---- */
    case "SET_FIELD":
      next = { ...state, [action.field]: action.value };
      // Persist carry-forward fields
      if (["agentName", "tpmoOrgs", "tpmoPlans"].includes(action.field)) {
        persistFields(next);
      }
      return next;

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

    /* ---- Track section start time ---- */
    case "MARK_SECTION_START": {
      const sectionNum = action.section;
      const existing = state.sectionTimestamps[sectionNum] || {};
      if (existing.start) return state; // already started
      return {
        ...state,
        sectionTimestamps: {
          ...state.sectionTimestamps,
          [sectionNum]: { ...existing, start: Date.now() },
        },
      };
    }

    /* ---- Undo last critical gate ---- */
    case "UNDO_LAST_GATE": {
      if (state.undoHistory.length === 0) return state;
      const lastEntry = state.undoHistory[state.undoHistory.length - 1];
      return {
        ...state,
        [lastEntry.field]: lastEntry.prevValue,
        undoHistory: state.undoHistory.slice(0, -1),
      };
    }

    default:
      return state;
  }
}

/* ---- Map gate fields to section numbers ---- */
function gateToSection(field) {
  const map = {
    recordingOk: 1,
    tpmoOk: 2,
    snpOk: 2.5,
    soaOk: 3,
    qualOk: 4,
    neadsOk: 5,
    sobOk: 6,
    enrollOk: 7,
  };
  return map[field] ?? null;
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

function formatSectionDuration(ts, nowTs) {
  if (!ts?.start) return "—";
  const end = ts.end || nowTs;
  const sec = Math.max(0, Math.round((end - ts.start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function summarizeOptionalProducts(state) {
  return {
    hospitalIndemnity: state.hiDiscussed
      ? "Discussed"
      : state.hiActive
      ? "Opened"
      : "Skipped",
    dentalVision: state.dvDiscussed
      ? "Discussed"
      : state.dvActive
      ? "Opened"
      : "Skipped",
    finalExpense: state.feDiscussed
      ? "Discussed"
      : state.feActive
      ? "Opened"
      : "Skipped",
  };
}

function buildSectionDetail(field, state, optionalProducts) {
  switch (field) {
    case "recordingOk":
      return state.agentName
        ? `Agent: ${state.agentName}`
        : "Agent name not entered";
    case "tpmoOk": {
      const parts = [];
      if (state.tpmoZip) parts.push(`ZIP ${state.tpmoZip}`);
      if (state.tpmoOrgs) parts.push(`${state.tpmoOrgs} orgs`);
      if (state.tpmoPlans) parts.push(`${state.tpmoPlans} plans`);
      return parts.length ? parts.join(" • ") : "TPMO counts not entered";
    }
    case "snpOk":
      return `${state.snpType || "SNP"} disclosure`;
    case "soaOk":
      return "POA/SOA permission confirmed";
    case "qualOk":
      return "Qualification questions completed";
    case "neadsOk":
      return "Needs assessment reviewed";
    case "sobOk":
      return state.partBReduction
        ? "Plan reviewed • Part B reduction discussed"
        : "Plan benefits reviewed";
    case "enrollOk": {
      const parts = [];
      if (state.notes.planName) parts.push(state.notes.planName);
      if (state.notes.effectiveDate)
        parts.push(`Eff. ${state.notes.effectiveDate}`);
      if (state.notes.enrollmentCode)
        parts.push(`App ID ${state.notes.enrollmentCode}`);
      return parts.length ? parts.join(" • ") : "Enrollment submitted";
    }
    case "wrapUp": {
      const parts = [];
      if (state.notes.confirmation)
        parts.push(`Confirmation ${state.notes.confirmation}`);
      if (optionalProducts.hospitalIndemnity !== "Skipped")
        parts.push(`HI: ${optionalProducts.hospitalIndemnity}`);
      if (optionalProducts.dentalVision !== "Skipped")
        parts.push(`DV: ${optionalProducts.dentalVision}`);
      if (optionalProducts.finalExpense !== "Skipped")
        parts.push(`FE: ${optionalProducts.finalExpense}`);
      return parts.length ? parts.join(" • ") : "No wrap-up notes entered";
    }
    default:
      return "";
  }
}

/* ---- Generate session summary ---- */
export function generateSessionSummary(state) {
  const now = new Date();
  const nowTs = now.getTime();
  const sessionStartDate = new Date(state.sessionStart);
  const optionalProducts = summarizeOptionalProducts(state);
  const wrapUpTouched = Boolean(
    state.sectionTimestamps[8]?.start ||
      state.notes.confirmation ||
      state.hiActive ||
      state.dvActive ||
      state.feActive
  );

  const completedSections = [];
  const sectionGates = [
    { num: 1, field: "recordingOk", label: "Recording Disclosure" },
    { num: 2, field: "tpmoOk", label: "TPMO Disclaimer" },
    { num: 3, field: "soaOk", label: "POA & Scope of Appointment" },
    { num: 4, field: "qualOk", label: "Qualifications" },
    { num: 5, field: "neadsOk", label: "NEADS Assessment" },
    { num: 6, field: "sobOk", label: "Plan Selection & SOB" },
    { num: 7, field: "enrollOk", label: "Enrollment" },
    { num: 8, field: "wrapUp", label: "Wrap-Up" },
  ];

  if (state.snpType) {
    sectionGates.splice(2, 0, {
      num: 2.5,
      field: "snpOk",
      label: `SNP Disclosure (${state.snpType})`,
    });
  }

  for (const sg of sectionGates) {
    const ts = state.sectionTimestamps[sg.num];
    const completed =
      sg.field === "wrapUp" ? wrapUpTouched : Boolean(state[sg.field]);
    completedSections.push({
      section: sg.label,
      completed,
      duration: formatSectionDuration(ts, nowTs),
      detail: buildSectionDetail(sg.field, state, optionalProducts),
    });
  }

  return {
    agentName: state.agentName || "(not entered)",
    callDirection: state.callDirection || "inbound",
    sessionStart: sessionStartDate.toLocaleString(),
    sessionEnd: now.toLocaleString(),
    planName: state.notes.planName || "(not entered)",
    effectiveDate: state.notes.effectiveDate || "(not entered)",
    enrollmentCode: state.notes.enrollmentCode || "(not entered)",
    confirmationNumber: state.notes.confirmation || "(not entered)",
    snpType: state.snpType || "None",
    sections: completedSections,
    optionalProducts,
  };
}
