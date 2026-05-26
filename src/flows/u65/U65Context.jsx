import { createContext, useContext, useReducer, useMemo } from "react";
import {
  U65_GATES,
  calcFplPercent,
  getFplThreshold,
  getAcaEstimate,
  getProductRecommendation,
} from "./U65Data";

const U65Context = createContext(null);

const initialGateState = U65_GATES.reduce((acc, gate) => {
  acc[gate.key] = false;
  return acc;
}, {});

const initialState = {
  // gate completion flags
  ...initialGateState,

  // call started gate
  callStarted: false,

  // entry source, controls Gate 0 script variant
  entrySource: null, // 'direct' | 'aca_transition'

  // selected products to present in Gate 3
  selectedProducts: [], // ['enrollprime', 'palic']

  // UW risk level, set during Gate 2
  uwRisk: null, // null | 'low' | 'moderate' | 'high'

  // product recommendation, derived after UW risk set
  productRecommendation: null,

  // NOT-MEC disclosure acknowledged, lockgate for G3
  mecDisclosureAcknowledged: false,

  // subsidy cliff calculator
  subsidyCalc: {
    householdSize: null,
    annualIncome: null,
    clientAge: null,
    fplPercent: null,
    aboveCliff: null,
    fplThreshold: null,
    acaEstimate: null,
  },

  // client profile
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

  // derived signals
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

  // checklist
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

  // follow-up tracker
  followUp: {
    date: "",
    method: "call", // 'call' | 'text' | 'email'
    notes: "",
  },

  gateHistory: [],
  sectionTimestamps: {},
  callStart: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "START_CALL":
      return { ...state, callStarted: true, callStart: Date.now() };

    case "SET_ENTRY_SOURCE":
      return { ...state, entrySource: action.source };

    case "SET_UW_RISK": {
      const rec = getProductRecommendation(action.risk);
      return {
        ...state,
        uwRisk: action.risk,
        productRecommendation: rec,
        // Auto-select top recommended products (skip aca_pivot)
        selectedProducts: rec.filter((r) => r.id !== "aca_pivot").map((r) => r.id),
      };
    }

    case "ACK_MEC_DISCLOSURE":
      return { ...state, mecDisclosureAcknowledged: true };

    case "SET_SUBSIDY_CALC": {
      const { householdSize, annualIncome, clientAge } = action;
      const hs = householdSize ?? state.subsidyCalc.householdSize;
      const ai = annualIncome ?? state.subsidyCalc.annualIncome;
      const age = clientAge ?? state.subsidyCalc.clientAge;

      if (!hs || !ai) {
        return {
          ...state,
          subsidyCalc: {
            householdSize: hs,
            annualIncome: ai,
            clientAge: age,
            fplPercent: null,
            aboveCliff: null,
            fplThreshold: hs ? getFplThreshold(hs) : null,
            acaEstimate: age ? getAcaEstimate(age) : null,
          },
          derivedSignals: {
            ...state.derivedSignals,
            subsidyCliffClient: false,
          },
        };
      }

      const fplThreshold = getFplThreshold(hs);
      const fplPercent = calcFplPercent(hs, ai);
      const aboveCliff = fplPercent > 400;
      const acaEstimate = age ? getAcaEstimate(age) : null;

      return {
        ...state,
        subsidyCalc: {
          householdSize: hs,
          annualIncome: ai,
          clientAge: age,
          fplPercent,
          aboveCliff,
          fplThreshold,
          acaEstimate,
        },
        derivedSignals: {
          ...state.derivedSignals,
          subsidyCliffClient: aboveCliff,
        },
      };
    }

    case "SET_FOLLOW_UP":
      return {
        ...state,
        followUp: { ...state.followUp, ...action.payload },
      };

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
      if (state.sectionTimestamps[sectionNum]?.start) return state;
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
      return { ...initialState };

    default:
      return state;
  }
}

function getActiveGate(state) {
  const nextGate = U65_GATES.find((gate) => !state[gate.key]);
  return nextGate ? nextGate.num : U65_GATES.length; // complete
}

export function U65Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

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
