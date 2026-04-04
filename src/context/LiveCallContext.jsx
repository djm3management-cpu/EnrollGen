import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const DEFAULT_LIVE_CALL_STATE = {
  callStarted: false,
  callDirection: "inbound",
  activeSection: 1,
  transcript: "",
  customerTranscript: "",
  mergedTranscript: [],
  isListening: false,
  complianceResult: null,
  updatedAt: 0,
};

const LiveCallContext = createContext(null);

export function LiveCallProvider({ children }) {
  const [liveCall, setLiveCall] = useState(DEFAULT_LIVE_CALL_STATE);

  const updateLiveCall = useCallback((patch) => {
    setLiveCall((prev) => {
      const nextPatch = typeof patch === "function" ? patch(prev) : patch;
      if (!nextPatch || typeof nextPatch !== "object") {
        return prev;
      }
      return {
        ...prev,
        ...nextPatch,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const resetLiveCall = useCallback(() => {
    setLiveCall({
      ...DEFAULT_LIVE_CALL_STATE,
      updatedAt: Date.now(),
    });
  }, []);

  const value = useMemo(
    () => ({
      liveCall,
      updateLiveCall,
      resetLiveCall,
    }),
    [liveCall, updateLiveCall, resetLiveCall]
  );

  return (
    <LiveCallContext.Provider value={value}>{children}</LiveCallContext.Provider>
  );
}

export function useLiveCall() {
  const context = useContext(LiveCallContext);
  if (!context) {
    throw new Error("useLiveCall must be used within <LiveCallProvider>");
  }
  return context;
}
