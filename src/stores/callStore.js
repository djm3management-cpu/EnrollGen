import { useSyncExternalStore } from "react";
import { getAuthToken } from "../context/AuthContext";
import { getAuthSupabase, supabase } from "../lib/supabase";

const initialState = {
  callActive: false,
  callStartedAt: null,
  agentId: null,
  callId: null,
};

const DEV_CALL_ID = "__dev_call__";
const DEV_AGENT_ID = "__dev_agent__";
const DEV_SHORTCUT_FLAG = "__enrollgen_call_timer_shortcut_installed__";

const listeners = new Set();
let state = { ...initialState };
let snapshot;

function identity(value) {
  return value;
}

function isDevelopment() {
  return (
    globalThis.process?.env?.NODE_ENV === "development" ||
    import.meta.env.DEV
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isDevCall(callId) {
  return callId === DEV_CALL_ID;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function updateState(nextState) {
  state = {
    ...state,
    ...nextState,
  };
  snapshot = {
    ...state,
    ...actions,
  };
  emit();
}

async function persistCallLog(record) {
  if (!record || isDevCall(record.call_id)) {
    return;
  }

  if (!record.call_id || !record.agent_id) {
    console.error("[CallStore] Missing call metadata for call_logs insert.", record);
    return;
  }

  try {
    const token = await getAuthToken();
    const sb = token ? getAuthSupabase(token) : supabase;
    const { error } = await sb.from("call_logs").insert(record);

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error("[CallStore] call_logs insert failed:", err);
  }
}

const actions = {
  startCall(agentId, callId) {
    const nextAgentId = isNonEmptyString(agentId) ? agentId : null;
    const nextCallId = isNonEmptyString(callId) ? callId : null;

    if (
      state.callActive &&
      state.callId === nextCallId &&
      state.agentId === nextAgentId
    ) {
      return snapshot;
    }

    updateState({
      callActive: true,
      callStartedAt: Date.now(),
      agentId: nextAgentId,
      callId: nextCallId,
    });

    return snapshot;
  },

  async endCall() {
    if (!state.callActive || !state.callStartedAt) {
      return null;
    }

    const endedAt = Date.now();
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt - state.callStartedAt) / 1000)
    );
    const finalizedCall = {
      call_id: state.callId,
      agent_id: state.agentId,
      started_at: new Date(state.callStartedAt).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      duration_seconds: durationSeconds,
      billable: durationSeconds >= 90,
    };

    updateState({ ...initialState });
    await persistCallLog(finalizedCall);
    return finalizedCall;
  },

  reset() {
    updateState({ ...initialState });
    return snapshot;
  },
};

snapshot = {
  ...state,
  ...actions,
};

function getSnapshot() {
  return snapshot;
}

export function useCallStore(selector = identity) {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getSnapshot())
  );
}

useCallStore.getState = getSnapshot;
useCallStore.subscribe = subscribe;

if (isDevelopment() && typeof window !== "undefined" && !window[DEV_SHORTCUT_FLAG]) {
  window[DEV_SHORTCUT_FLAG] = true;
  window.addEventListener("keydown", (event) => {
    if (!event.shiftKey || event.key.toLowerCase() !== "t") {
      return;
    }

    if (!event.metaKey && !event.ctrlKey) {
      return;
    }

    const { callActive, callId, startCall, endCall } = getSnapshot();

    if (callActive && !isDevCall(callId)) {
      return;
    }

    event.preventDefault();

    if (callActive) {
      void endCall();
      return;
    }

    startCall(DEV_AGENT_ID, DEV_CALL_ID);
  });
}
