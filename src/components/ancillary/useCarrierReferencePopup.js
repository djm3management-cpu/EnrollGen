import { useCallback, useEffect, useState } from "react";
import { CARRIER_REFERENCE_POPUPS } from "./carrierReferencePopupData";

const STORAGE_KEY = "enrollgen_carrier_reference_popup_v2";

const EMPTY_STATE = {
  activeCarrierIds: [],
  dismissedCarriers: {},
  triggeredCarriers: {},
};

const ENROLLMENT_INTENT_PATTERNS = [
  (carrierPattern) =>
    `(?:today\\s+)?i(?:\\s+am|'m)?\\s+(?:going\\s+to\\s+)?(?:enroll(?:ing)?\\s+you|sign(?:ing)?\\s+you\\s+up|put(?:ting)?\\s+you|place(?:ing)?\\s+you)\\s+(?:in|into|with)\\s+(?:the\\s+)?${carrierPattern}(?:\\s+plan)?`,
  (carrierPattern) =>
    `we(?:\\s+are|'re)?\\s+(?:going\\s+to\\s+)?(?:go\\s+with|move\\s+forward\\s+with|enroll\\s+you\\s+in|put\\s+you\\s+in|do)\\s+(?:the\\s+)?${carrierPattern}(?:\\s+plan)?`,
  (carrierPattern) =>
    `let(?:\\s+us|'s)\\s+(?:get\\s+you\\s+signed\\s+up\\s+with|go\\s+ahead\\s+with|go\\s+with|do)\\s+(?:the\\s+)?${carrierPattern}(?:\\s+plan)?`,
  (carrierPattern) =>
    `we(?:\\s+will|'ll)\\s+do\\s+(?:the\\s+)?${carrierPattern}(?:\\s+plan)?`,
];

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliasPattern(aliases = []) {
  return `(?:${aliases
    .map((alias) => normalizeText(alias))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((alias) => escapeRegex(alias).replace(/\s+/g, "\\s+"))
    .join("|")})`;
}

function splitTranscriptIntoUtterances(transcript) {
  return String(transcript || "")
    .split(/[.!?\n]+/)
    .map((utterance) => utterance.trim())
    .filter(Boolean);
}

function carrierWasSelectedInUtterance(utterance, aliases) {
  const normalizedUtterance = normalizeText(utterance);
  if (!normalizedUtterance) {
    return false;
  }

  const carrierPattern = buildAliasPattern(aliases);
  if (!carrierPattern || carrierPattern === "(?:)") {
    return false;
  }

  return ENROLLMENT_INTENT_PATTERNS.some((patternBuilder) =>
    new RegExp(patternBuilder(carrierPattern), "i").test(normalizedUtterance)
  );
}

function findTriggeredCarrierIds({ transcript, mergedTranscript }) {
  const agentUtterances = Array.isArray(mergedTranscript) && mergedTranscript.length
    ? mergedTranscript
        .filter(
          (entry) =>
            entry?.speaker === "agent" && entry?.isFinal && entry?.text?.trim()
        )
        .map((entry) => entry.text)
    : splitTranscriptIntoUtterances(transcript);

  const matches = new Set();

  agentUtterances.forEach((utterance) => {
    CARRIER_REFERENCE_POPUPS.forEach((popup) => {
      if (carrierWasSelectedInUtterance(utterance, popup.aliases)) {
        matches.add(popup.id);
      }
    });
  });

  return [...matches];
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
