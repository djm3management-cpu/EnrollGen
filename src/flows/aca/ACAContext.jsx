import { createContext, useContext, useReducer, useMemo } from "react";

const ACAContext = createContext(null);

const initialState = {
  // gate completion flags
  gate0Ok: false,
  gate1Ok: false,
  gate2Ok: false,
  gate3Ok: false,
  gate4Ok: false,
  gate5Ok: false,
  gate6Ok: false,

  // enrollment period — controls Gate 1 conditional rendering
  enrollmentPeriod: null, // null | 'OEP' | 'SEP'

  // client profile (from spec Section 2.1)
  clientProfile: {
    name: null,
    dob: null,
    age: null,
    state: null,
    county: null,
    householdSize: null,
    householdIncome: null,
    fpl: null,
    subsidyEligible: null,
    estimatedAPTC: null,
    currentCoverage: null,
    enrollmentPeriod: null,
    sepType: null,
    sepDate: null,
    sepWindowEnd: null,
    planPreference: null,
    csr: null,
    selectedPlan: null,
    existingProviders: [],
    rxList: [],
    immigrationStatus: null,
    tobaccoUse: null,
  },

  // derived signals (from spec Section 2.1)
  derivedSignals: {
    subsidyCliffRisk: false,
    medicaidLikely: false,
    csrEligible: false,
    sepValid: false,
    sepExpiringSoon: false,
    planMismatch: false,
    stateBased: false,
  },

  // checklist (from spec Section 2.1)
  checklist: {
    identityVerified: false,
    consentRecorded: false,
    incomeDocumented: false,
    sepDocumented: false,
    subsidyDisclosed: false,
    planBenefitsReviewed: false,
    networkChecked: false,
    rxFormularyChecked: false,
    effectiveDateConfirmed: false,
    enrollmentSubmitted: false,
    confirmationNumberRecorded: false,
    followUpScheduled: false,
  },

  // call started gate
  callStarted: false,

  gateHistory: [],
  sectionTimestamps: {},
  callStart: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "START_CALL":
      return { ...state, callStarted: true, callStart: Date.now() };

    case "SET_ENROLLMENT_PERIOD":
      return { ...state, enrollmentPeriod: action.period };

    case "COMPLETE_SECTION": {
      const { key, sectionNum } = action;
      const now = Date.now();
      return {
        ...state,
        [key]: true,
        gateHistory: [...state.gateHistory, { key, completedAt: now }],
        sectionTimestamps: {
          ...state.sectionTimestamps,
          [sectionNum]: {
            start: state.sectionTimestamps[sectionNum]?.start ?? now,
            end: now,
          },
        },
      };
    }

    case "START_SECTION": {
      const { sectionNum } = action;
      return {
        ...state,
        sectionTimestamps: {
          ...state.sectionTimestamps,
          [sectionNum]: { start: Date.now(), end: null },
        },
      };
    }

    case "UNCOMPLETE_SECTION":
      return { ...state, [action.key]: false };

    case "SET_SIGNAL":
      return {
        ...state,
        derivedSignals: { ...state.derivedSignals, [action.signal]: action.value },
      };

    case "TOGGLE_CHECKLIST":
      return {
        ...state,
        checklist: {
          ...state.checklist,
          [action.item]: !state.checklist[action.item],
        },
      };

    case "RESET":
      return { ...initialState, callStart: Date.now() };

    default:
      return state;
  }
}

function getActiveGate(state) {
  if (!state.gate0Ok) return 0;
  if (state.enrollmentPeriod === "SEP" && !state.gate1Ok) return 1;
  if (!state.gate2Ok) return 2;
  if (!state.gate3Ok) return 3;
  if (!state.gate4Ok) return 4;
  if (!state.gate5Ok) return 5;
  if (!state.gate6Ok) return 6;
  return 7; // complete
}

export function ACAProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    callStart: Date.now(),
  });

  const activeGate = useMemo(() => getActiveGate(state), [state]);

  const value = useMemo(
    () => ({ state, dispatch, activeGate }),
    [state, dispatch, activeGate]
  );

  return <ACAContext.Provider value={value}>{children}</ACAContext.Provider>;
}

export function useACA() {
  const ctx = useContext(ACAContext);
  if (!ctx) throw new Error("useACA must be used inside ACAProvider");
  return ctx;
}
