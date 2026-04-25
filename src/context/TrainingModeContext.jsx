import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "enrollgen_training_mode_v1";

const TrainingModeContext = createContext({
  enabled: false,
  setEnabled: () => {},
  toggle: () => {},
});

function readPersisted() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function TrainingModeProvider({ children }) {
  const [enabled, setEnabledState] = useState(readPersisted);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      // Ignore storage failures.
    }
  }, [enabled]);

  const setEnabled = useCallback((next) => {
    setEnabledState((current) => {
      const value = typeof next === "function" ? next(current) : Boolean(next);
      return value;
    });
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((current) => !current);
  }, []);

  const value = useMemo(
    () => ({ enabled, setEnabled, toggle }),
    [enabled, setEnabled, toggle]
  );

  return (
    <TrainingModeContext.Provider value={value}>
      {children}
    </TrainingModeContext.Provider>
  );
}

export function useTrainingMode() {
  return useContext(TrainingModeContext);
}
