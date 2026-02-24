import { createContext, useContext, useReducer, useMemo } from "react";
import { MEDSUP_SECTIONS } from "./MedSupScript";

const MedSupContext = createContext(null);

const initialState = {
  // section completion gates
  recordingOk: false,
  tpmoOk: false,
  qualOk: false,
  branchOk: false,
  objectionOk: true, // optional — pre-checked
  enrollOk: false,
  wrapOk: false,

  // branch selection
  selectedBranch: null, // "branch-a" | "branch-b" | "branch-c"

  // CRM checklist
  crmChecked: [],

  // timestamps
  sectionTimestamps: {},
  callStart: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "START_CALL":
      return { ...state, callStart: Date.now() };

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

    case "SELECT_BRANCH":
      return { ...state, selectedBranch: action.branch };

    case "TOGGLE_CRM_ITEM": {
      const item = action.item;
      const already = state.crmChecked.includes(item);
      return {
        ...state,
        crmChecked: already
          ? state.crmChecked.filter((i) => i !== item)
          : [...state.crmChecked, item],
      };
    }

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
  if (!state.branchOk) return 4;
  if (!state.enrollOk) return 6; // skip optional objections
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
