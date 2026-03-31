import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "enrollgen_devoted_reference_popup_v1";
const DEVOTED_TRIGGER_RE = /\bdevoted\b/i;

const EMPTY_STATE = {
  triggered: false,
  dismissed: false,
  collapsed: false,
  lastInteractedAt: 0,
};

function loadStoredState() {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }

    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_STATE,
      ...parsed,
    };
  } catch {
    return EMPTY_STATE;
  }
}

export default function useDevotedReferencePopup({
  callStarted,
  transcript,
}) {
  const [popupState, setPopupState] = useState(loadStoredState);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(popupState));
  }, [popupState]);

  useEffect(() => {
    if (!callStarted || popupState.triggered || !transcript?.trim()) {
      return;
    }

    if (!DEVOTED_TRIGGER_RE.test(transcript)) {
      return;
    }

    setPopupState((prev) => {
      if (prev.triggered) {
        return prev;
      }

      return {
        ...prev,
        triggered: true,
        collapsed: false,
        lastInteractedAt: Date.now(),
      };
    });
  }, [callStarted, popupState.triggered, transcript]);

  const isVisible = callStarted && popupState.triggered && !popupState.dismissed;

  useEffect(() => {
    if (!isVisible || popupState.collapsed) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setPopupState((prev) => ({
        ...prev,
        collapsed: true,
      }));
    }, 30000);

    return () => window.clearTimeout(timerId);
  }, [isVisible, popupState.collapsed, popupState.lastInteractedAt]);

  const noteInteraction = useCallback(() => {
    setPopupState((prev) => ({
      ...prev,
      collapsed: false,
      lastInteractedAt: Date.now(),
    }));
  }, []);

  const dismissPopup = useCallback(() => {
    setPopupState((prev) => ({
      ...prev,
      dismissed: true,
    }));
  }, []);

  const expandPopup = useCallback(() => {
    setPopupState((prev) => ({
      ...prev,
      collapsed: false,
      lastInteractedAt: Date.now(),
    }));
  }, []);

  return {
    isVisible,
    collapsed: popupState.collapsed,
    noteInteraction,
    dismissPopup,
    expandPopup,
  };
}
