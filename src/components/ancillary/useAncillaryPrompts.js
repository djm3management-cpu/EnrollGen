import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getActivePopup,
  getFollowUpDate,
  getPortalProducts,
  getSeedMentions,
} from "./ancillaryPopupData";

const STORAGE_KEY = "enrollgen_ancillary_prompts_v1";

const EMPTY_STATE = {
  triggersDetected: [],
  ancillaryEnrolled: [],
  followUpDate: null,
  popupsDismissed: {},
  collapsedPopups: {},
  lastInteractedAt: {},
  followUpCompleted: false,
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
      triggersDetected: Array.isArray(parsed?.triggersDetected)
        ? parsed.triggersDetected
        : [],
      ancillaryEnrolled: Array.isArray(parsed?.ancillaryEnrolled)
        ? parsed.ancillaryEnrolled
        : [],
      popupsDismissed:
        parsed?.popupsDismissed && typeof parsed.popupsDismissed === "object"
          ? parsed.popupsDismissed
          : {},
      collapsedPopups: {},
      lastInteractedAt: {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

function mergeEnrolledProduct(products, nextProduct) {
  const existing = products.find((product) => product.id === nextProduct.id);

  if (!existing) {
    return [...products, nextProduct];
  }

  return products.map((product) =>
    product.id === nextProduct.id
      ? {
          ...product,
          ...nextProduct,
        }
      : product
  );
}

export default function useAncillaryPrompts({
  currentCard,
  scriptState,
  followUpContext,
}) {
  const [ancillaryState, setAncillaryState] = useState(loadStoredState);

  const popupKey = useMemo(
    () => getActivePopup(currentCard, ancillaryState, followUpContext),
    [currentCard, ancillaryState, followUpContext]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ancillaryState));
  }, [ancillaryState]);

  useEffect(() => {
    if (!scriptState?.enrollOk || ancillaryState.followUpDate) {
      return;
    }

    if (ancillaryState.ancillaryEnrolled.length > 0) {
      return;
    }

    const enrollmentEnd = scriptState.sectionTimestamps?.[7]?.end;
    const nextFollowUpDate = getFollowUpDate(
      enrollmentEnd ? new Date(enrollmentEnd).toISOString() : null
    );

    if (!nextFollowUpDate) {
      return;
    }

    setAncillaryState((prev) => {
      if (prev.followUpDate) {
        return prev;
      }

      return {
        ...prev,
        followUpDate: nextFollowUpDate,
      };
    });
  }, [
    scriptState?.enrollOk,
    scriptState?.sectionTimestamps,
    ancillaryState.followUpDate,
    ancillaryState.ancillaryEnrolled.length,
  ]);

  useEffect(() => {
    if (!popupKey) {
      return;
    }

    setAncillaryState((prev) => {
      if (prev.popupsDismissed[popupKey] || prev.lastInteractedAt[popupKey]) {
        return prev;
      }

      return {
        ...prev,
        lastInteractedAt: {
          ...prev.lastInteractedAt,
          [popupKey]: Date.now(),
        },
      };
    });
  }, [popupKey]);

  const activeDismissed = popupKey
    ? Boolean(ancillaryState.popupsDismissed[popupKey])
    : false;
  const activeCollapsed = popupKey
    ? Boolean(ancillaryState.collapsedPopups[popupKey])
    : false;
  const lastInteractedAt = popupKey
    ? ancillaryState.lastInteractedAt[popupKey] ?? 0
    : 0;

  useEffect(() => {
    if (!popupKey || activeDismissed || activeCollapsed) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setAncillaryState((prev) => ({
        ...prev,
        collapsedPopups: {
          ...prev.collapsedPopups,
          [popupKey]: true,
        },
      }));
    }, 30000);

    return () => window.clearTimeout(timerId);
  }, [popupKey, activeDismissed, activeCollapsed, lastInteractedAt]);

  const noteInteraction = useCallback(() => {
    if (!popupKey) {
      return;
    }

    setAncillaryState((prev) => ({
      ...prev,
      collapsedPopups: {
        ...prev.collapsedPopups,
        [popupKey]: false,
      },
      lastInteractedAt: {
        ...prev.lastInteractedAt,
        [popupKey]: Date.now(),
      },
    }));
  }, [popupKey]);

  const dismissPopup = useCallback(() => {
    if (!popupKey) {
      return;
    }

    setAncillaryState((prev) => ({
      ...prev,
      popupsDismissed: {
        ...prev.popupsDismissed,
        [popupKey]: true,
      },
    }));
  }, [popupKey]);

  const expandPopup = useCallback(() => {
    if (!popupKey) {
      return;
    }

    setAncillaryState((prev) => ({
      ...prev,
      collapsedPopups: {
        ...prev.collapsedPopups,
        [popupKey]: false,
      },
      lastInteractedAt: {
        ...prev.lastInteractedAt,
        [popupKey]: Date.now(),
      },
    }));
  }, [popupKey]);

  const toggleTrigger = useCallback((triggerId) => {
    setAncillaryState((prev) => {
      const isActive = prev.triggersDetected.includes(triggerId);
      return {
        ...prev,
        triggersDetected: isActive
          ? prev.triggersDetected.filter((id) => id !== triggerId)
          : [...prev.triggersDetected, triggerId],
      };
    });
  }, []);

  const openPortalProduct = useCallback(
    (product) => {
      noteInteraction();

      if (typeof window !== "undefined") {
        window.open(product.href, "_blank", "noopener,noreferrer");
      }

      setAncillaryState((prev) => ({
        ...prev,
        ancillaryEnrolled: mergeEnrolledProduct(prev.ancillaryEnrolled, {
          id: product.id,
          product: product.recapName,
          carrier: product.carrier,
          premium: null,
          effectiveDate: scriptState?.notes?.effectiveDate?.trim() || null,
        }),
      }));
    },
    [noteInteraction, scriptState?.notes?.effectiveDate]
  );

  const markFollowUpComplete = useCallback(() => {
    setAncillaryState((prev) => ({
      ...prev,
      followUpDate: null,
      followUpCompleted: true,
      popupsDismissed: {
        ...prev.popupsDismissed,
        E: true,
      },
    }));
  }, []);

  const portalProducts = useMemo(
    () => getPortalProducts(ancillaryState.triggersDetected),
    [ancillaryState.triggersDetected]
  );

  const seedMentions = useMemo(
    () => getSeedMentions(ancillaryState.triggersDetected),
    [ancillaryState.triggersDetected]
  );

  return {
    ancillaryState,
    popupKey,
    activeDismissed,
    activeCollapsed,
    portalProducts,
    seedMentions,
    noteInteraction,
    dismissPopup,
    expandPopup,
    toggleTrigger,
    openPortalProduct,
    markFollowUpComplete,
  };
}
