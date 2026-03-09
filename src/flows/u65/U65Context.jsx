import { createContext, useContext, useReducer, useMemo } from "react";

const U65Context = createContext(null);

const initialState = {
  // gate completion flags
  gate0Ok: false,
  gate1Ok: false,
  gate2Ok: false,
  gate3Ok: false,
  gate4Ok: false,
  gate5Ok: false,
  gate6Ok: false,
  gate7Ok: false,

  // entry source — controls Gate 0 script variant
  entrySource: null, // 'direct' | 'aca_transition'

  // selected products to present in Gate 3
  selectedProducts: [], // ['enrollprime', 'palic', 'lifex']

  // UW risk level — set during Gate 2
  uwRisk: null, // null | 'low' | 'moderate' | 'high'

  // client profile (from spec Section 3.1)
  clientProfile: {
    name: null,
    dob: null,
    age: null,
    state: null,
    county: null,
    zipCode: null,
    householdSize: null,
    householdIncome: null,
    fpl: null,
    employmentType: null,
    currentCoverage: null,
    coverageGapReason: null,
    healthStatus: null,
    preExistingConditions: [],
    tobaccoUse: null,
    existingProviders: [],
    rxList: [],
    monthlyBudget: null,
    priorityRank: null,
    householdMembers: [],
    productInterest: null,
    uwConcerns: [],
    enrollmentPlatform: null,
  },

  // derived signals (from spec Section 3.1)
  derivedSignals: {
    subsidyCliffClient: false,
    uwRisk: "unknown",
    medicalUWRequired: false,
    networkMatchScore: null,
    productFit: null,
    cobraActive: false,
    aetnaExitAffected: false,
    ancillaryNeeded: false,
  },

  // checklist (from spec Section 3.1)
  checklist: {
    identityVerified: false,
    consentRecorded: false,
    notMECDisclosed: false,
    notACASubstituteDisclosed: false,
    preExDisclosureGiven: false,
    uwPreScreenCompleted: false,
    productBenefitsReviewed: false,
    networkChecked: false,
    rxCoverageReviewed: false,
    premiumQuoteProvided: false,
    applicationSubmitted: false,
    confirmationRecorded: false,
    ancillaryDiscussed: false,
    followUpScheduled: false,
  },

  gateHistory: [],
  sectionTimestamps: {},
  callStart: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "START_CALL":
      return { ...state, callStart: Date.now() };

    case "SET_ENTRY_SOURCE":
      return { ...state, entrySource: action.source };

    case "SET_UW_RISK":
      return { ...state, uwRisk: action.risk };

    case "TOGGLE_PRODUCT": {
      const p = action.product;
      const already = state.selectedProducts.includes(p);
      return {
        ...state,
        selectedProducts: already
          ? state.selectedProducts.filter((x) => x !== p)
          : [...state.selectedProducts, p],
      };
    }

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
  if (!state.gate1Ok) return 1;
  if (!state.gate2Ok) return 2;
  if (!state.gate3Ok) return 3;
  if (!state.gate4Ok) return 4;
  if (!state.gate5Ok) return 5;
  if (!state.gate6Ok) return 6;
  if (!state.gate7Ok) return 7;
  return 8; // complete
}

export function U65Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    callStart: Date.now(),
  });

  const activeGate = useMemo(() => getActiveGate(state), [state]);

  const value = useMemo(
    () => ({ state, dispatch, activeGate }),
    [state, dispatch, activeGate]
  );

  return <U65Context.Provider value={value}>{children}</U65Context.Provider>;
}

export function useU65() {
  const ctx = useContext(U65Context);
  if (!ctx) throw new Error("useU65 must be used inside U65Provider");
  return ctx;
}
