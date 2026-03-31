import { useCallback, useEffect, useState } from "react";
import { CARRIER_REFERENCE_POPUPS } from "./carrierReferencePopupData";

const STORAGE_KEY = "enrollgen_carrier_reference_popup_v1";

const EMPTY_STATE = {
  activeCarrierId: null,
  dismissedCarriers: {},
  collapsedCarriers: {},
  lastInteractedAt: {},
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
      activeCarrierId:
        typeof parsed?.activeCarrierId === "string"
          ? parsed.activeCarrierId
          : null,
      dismissedCarriers:
        parsed?.dismissedCarriers &&
        typeof parsed.dismissedCarriers === "object"
          ? parsed.dismissedCarriers
          : {},
      collapsedCarriers:
        parsed?.collapsedCarriers &&
        typeof parsed.collapsedCarriers === "object"
          ? parsed.collapsedCarriers
          : {},
      lastInteractedAt:
        parsed?.lastInteractedAt &&
        typeof parsed.lastInteractedAt === "object"
          ? parsed.lastInteractedAt
          : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

function getLastMatchIndex(text, pattern) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let lastMatchIndex = -1;

  for (const match of text.matchAll(regex)) {
    if (typeof match.index === "number") {
      lastMatchIndex = match.index;
    }
  }

  return lastMatchIndex;
}

function findLatestCarrierId(transcript) {
  if (!transcript?.trim()) {
    return null;
  }

  let latestCarrierId = null;
  let latestMatchIndex = -1;

  CARRIER_REFERENCE_POPUPS.forEach((popup) => {
    const matchIndex = getLastMatchIndex(transcript, popup.triggerPattern);
    if (matchIndex > latestMatchIndex) {
      latestMatchIndex = matchIndex;
      latestCarrierId = popup.id;
    }
  });

  return latestCarrierId;
}

export default function useCarrierReferencePopup({
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
    if (!callStarted || !transcript?.trim()) {
      return;
    }

    const nextCarrierId = findLatestCarrierId(transcript);
    if (!nextCarrierId) {
      return;
    }

    setPopupState((prev) => {
      if (prev.activeCarrierId === nextCarrierId) {
        return prev;
      }

      return {
        ...prev,
        activeCarrierId: nextCarrierId,
        collapsedCarriers: {
          ...prev.collapsedCarriers,
          [nextCarrierId]: false,
        },
        lastInteractedAt: {
          ...prev.lastInteractedAt,
          [nextCarrierId]: Date.now(),
        },
      };
    });
  }, [callStarted, transcript]);

  const activeCarrierId = popupState.activeCarrierId;
  const isVisible =
    callStarted &&
    Boolean(activeCarrierId) &&
    !popupState.dismissedCarriers[activeCarrierId];
  const collapsed = activeCarrierId
    ? Boolean(popupState.collapsedCarriers[activeCarrierId])
    : false;
  const lastInteractedAt = activeCarrierId
    ? popupState.lastInteractedAt[activeCarrierId] ?? 0
    : 0;

  useEffect(() => {
    if (!isVisible || collapsed || !activeCarrierId) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setPopupState((prev) => ({
        ...prev,
        collapsedCarriers: {
          ...prev.collapsedCarriers,
          [activeCarrierId]: true,
        },
      }));
    }, 30000);

    return () => window.clearTimeout(timerId);
  }, [activeCarrierId, collapsed, isVisible, lastInteractedAt]);

  const noteInteraction = useCallback(() => {
    setPopupState((prev) => {
      if (!prev.activeCarrierId) {
        return prev;
      }

      return {
        ...prev,
        collapsedCarriers: {
          ...prev.collapsedCarriers,
          [prev.activeCarrierId]: false,
        },
        lastInteractedAt: {
          ...prev.lastInteractedAt,
          [prev.activeCarrierId]: Date.now(),
        },
      };
    });
  }, []);

  const dismissPopup = useCallback(() => {
    setPopupState((prev) => {
      if (!prev.activeCarrierId) {
        return prev;
      }

      return {
        ...prev,
        dismissedCarriers: {
          ...prev.dismissedCarriers,
          [prev.activeCarrierId]: true,
        },
      };
    });
  }, []);

  const expandPopup = useCallback(() => {
    setPopupState((prev) => {
      if (!prev.activeCarrierId) {
        return prev;
      }

      return {
        ...prev,
        collapsedCarriers: {
          ...prev.collapsedCarriers,
          [prev.activeCarrierId]: false,
        },
        lastInteractedAt: {
          ...prev.lastInteractedAt,
          [prev.activeCarrierId]: Date.now(),
        },
      };
    });
  }, []);

  return {
    activeCarrierId,
    isVisible,
    collapsed,
    noteInteraction,
    dismissPopup,
    expandPopup,
  };
}
