import { useCallback, useEffect, useState } from "react";
import { findTriggeredCarrierIds } from "./carrierPopupMatching.js";

const STORAGE_KEY = "enrollgen_carrier_reference_popup_v2";

const EMPTY_STATE = {
  activeCarrierIds: [],
  dismissedCarriers: {},
  triggeredCarriers: {},
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
      activeCarrierIds: Array.isArray(parsed?.activeCarrierIds)
        ? parsed.activeCarrierIds
        : [],
      dismissedCarriers:
        parsed?.dismissedCarriers && typeof parsed.dismissedCarriers === "object"
          ? parsed.dismissedCarriers
          : {},
      triggeredCarriers:
        parsed?.triggeredCarriers && typeof parsed.triggeredCarriers === "object"
          ? parsed.triggeredCarriers
          : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

export default function useCarrierReferencePopup({
  callStarted,
  transcript,
  mergedTranscript = [],
}) {
  const [popupState, setPopupState] = useState(loadStoredState);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(popupState));
  }, [popupState]);

  useEffect(() => {
    if (!callStarted) {
      return;
    }

    const matchedCarrierIds = findTriggeredCarrierIds({
      transcript,
      mergedTranscript,
    });

    if (!matchedCarrierIds.length) {
      return;
    }

    setPopupState((prev) => {
      let changed = false;
      const nextActiveCarrierIds = [...prev.activeCarrierIds];
      const nextTriggeredCarriers = { ...prev.triggeredCarriers };

      matchedCarrierIds.forEach((carrierId) => {
        if (nextTriggeredCarriers[carrierId]) {
          return;
        }

        nextTriggeredCarriers[carrierId] = true;
        nextActiveCarrierIds.push(carrierId);
        changed = true;
      });

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        activeCarrierIds: nextActiveCarrierIds,
        triggeredCarriers: nextTriggeredCarriers,
      };
    });
  }, [callStarted, transcript, mergedTranscript]);

  const dismissCarrier = useCallback((carrierId) => {
    setPopupState((prev) => {
      if (!carrierId || !prev.activeCarrierIds.includes(carrierId)) {
        return prev;
      }

      return {
        ...prev,
        activeCarrierIds: prev.activeCarrierIds.filter((id) => id !== carrierId),
        dismissedCarriers: {
          ...prev.dismissedCarriers,
          [carrierId]: true,
        },
      };
    });
  }, []);

  return {
    activeCarrierIds: popupState.activeCarrierIds,
    dismissCarrier,
  };
}
