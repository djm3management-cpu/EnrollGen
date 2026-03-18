import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  scriptReducer,
  initialState,
  getActiveSection,
  getSectionUnlocked,
  allChecked,
} from "./scriptReducer";

const ScriptContext = createContext(null);

export function ScriptProvider({ children }) {
  const [state, dispatch] = useReducer(scriptReducer, initialState);

  const activeSection = useMemo(() => getActiveSection(state), [state]);
  const unlocked = useMemo(() => getSectionUnlocked(state), [state]);
  const preEnrollAllDone = useMemo(
    () => allChecked(state.preEnrollChecks),
    [state.preEnrollChecks]
  );
  const sobAllDone = useMemo(
    () => allChecked(state.sobChecks),
    [state.sobChecks]
  );
  const enrollAllDone = useMemo(
    () => allChecked(state.enrollChecks),
    [state.enrollChecks]
  );
  const enrollmentCodeOk =
    (state.notes.enrollmentCode || "").trim().length >= 4;

  // Track previous active section for auto-scroll
  const prevSection = useRef(activeSection);

  useEffect(() => {
    if (activeSection !== prevSection.current) {
      prevSection.current = activeSection;
      // Mark new section as started for per-section timing
      dispatch({ type: "MARK_SECTION_START", section: activeSection });
    }
  }, [activeSection]);

  // Initial section start is now triggered by the Start Call button in ScriptFlow
  // (via dispatch({ type: "MARK_SECTION_START", section: 1 }))

  const value = useMemo(
    () => ({
      state,
      dispatch,
      activeSection,
      unlocked,
      preEnrollAllDone,
      sobAllDone,
      enrollAllDone,
      enrollmentCodeOk,
    }),
    [
      state,
      dispatch,
      activeSection,
      unlocked,
      preEnrollAllDone,
      sobAllDone,
      enrollAllDone,
      enrollmentCodeOk,
    ]
  );

  return (
    <ScriptContext.Provider value={value}>{children}</ScriptContext.Provider>
  );
}

export function useScript() {
  const ctx = useContext(ScriptContext);
  if (!ctx) throw new Error("useScript must be used within ScriptProvider");
  return ctx;
}
