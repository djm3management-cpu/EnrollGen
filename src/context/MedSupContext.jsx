import { createContext, useContext, useReducer, useMemo } from "react";

const MedSupContext = createContext(null);

const initialState = {
  // section completion gates
  recordingOk: false,
  tpmoOk: false,
  qualOk: false,
  discoveryOk: false,
  quoteOk: false,
  enrollOk: false,
  wrapOk: false,

  // call started gate
  callStarted: false,

  // timestamps
  sectionTimestamps: {},
  callStart: null,

  enrollmentDisposition: "enrolled",
  crossSellAcknowledged: false,
  crossSellPayload: null,

  clientProfile: {
    name: "",
    dob: "",
    state: "",
    zipCode: "",
    age: "",
    gender: "",
    tobaccoUse: "",
  },

  quoteInputs: {
    primaryCarrier: "",
    selectedPlanType: "standard",
    planLetter: "G",
    planGMonthly: "",
    planNMonthly: "",
    standardGMonthly: "",
    hdgMonthly: "",
    hipMonthly: "",
    hipDailyBenefit: "",
    averageStayDays: "4.5",
  },
};

function reducer(state, action) {
  switch (action.type) {
    case "START_CALL":
      return { ...state, callStarted: true, callStart: Date.now() };

    case "COMPLETE_SECTION": {
      const { key, sectionNum } = action;
      const now = Date.now();
      return {
        ...state,
        [key]: true,
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
          [sectionNum]: {
            start: Date.now(),
            end: null,
          },
        },
      };
    }

    case "UNCOMPLETE_SECTION":
      return { ...state, [action.key]: false };

    case "SET_ENROLLMENT_DISPOSITION":
      return {
        ...state,
        enrollmentDisposition: action.value || "enrolled",
        crossSellAcknowledged:
          action.value && action.value !== "enrolled" ? true : state.crossSellAcknowledged,
      };

    case "SET_CLIENT_PROFILE_FIELD":
      return {
        ...state,
        clientProfile: {
          ...state.clientProfile,
          [action.field]: action.value,
        },
      };

    case "SET_QUOTE_FIELD":
      return {
        ...state,
        quoteInputs: {
          ...state.quoteInputs,
          [action.field]: action.value,
        },
      };

    case "SET_CROSS_SELL_ACKNOWLEDGED":
      return {
        ...state,
        crossSellAcknowledged: Boolean(action.value),
        crossSellPayload: action.payload || state.crossSellPayload,
      };

    case "RESET":
      return { ...initialState };

    default:
      return state;
  }
}

// derive active section from completion state
function getActiveSection(state) {
  if (!state.recordingOk) return 1;
  if (!state.tpmoOk) return 2;
  if (!state.qualOk) return 3;
  if (!state.discoveryOk) return 4;
  if (!state.quoteOk) return 5;
  if (!state.enrollOk) return 6;
  if (!state.wrapOk) return 7;
  return 8; // complete
}

export function MedSupProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    callStart: Date.now(),
  });

  const activeSection = useMemo(() => getActiveSection(state), [state]);

  const value = useMemo(
    () => ({ state, dispatch, activeSection }),
    [state, dispatch, activeSection]
  );

  return (
    <MedSupContext.Provider value={value}>{children}</MedSupContext.Provider>
  );
}

export function useMedSup() {
  const ctx = useContext(MedSupContext);
  if (!ctx) throw new Error("useMedSup must be used inside MedSupProvider");
  return ctx;
}
