// Decides which carrier reference popups an agent utterance triggers. Kept free
// of React so node tests can exercise it directly.
import { CARRIER_REFERENCE_POPUPS } from "./carrierReferencePopupData.js";

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

// Every final utterance from both speakers, plus the raw transcript string, so
// context such as "Medicare Advantage" counts no matter who said it. Kept in
// original case because the "MA" check is case-sensitive.
function buildContextText({ transcript, mergedTranscript }) {
  const entries = Array.isArray(mergedTranscript)
    ? mergedTranscript
        .filter((entry) => entry?.isFinal && entry?.text)
        .map((entry) => entry.text)
    : [];
  return [String(transcript || ""), ...entries].join("\n");
}

export function findTriggeredCarrierIds({
  transcript,
  mergedTranscript,
  popups = CARRIER_REFERENCE_POPUPS,
}) {
  const agentUtterances = Array.isArray(mergedTranscript) && mergedTranscript.length
    ? mergedTranscript
        .filter(
          (entry) =>
            entry?.speaker === "agent" && entry?.isFinal && entry?.text?.trim()
        )
        .map((entry) => entry.text)
    : splitTranscriptIntoUtterances(transcript);

  const matches = new Set();

  const contextText = buildContextText({ transcript, mergedTranscript });

  agentUtterances.forEach((utterance) => {
    popups.forEach((popup) => {
      if (carrierWasSelectedInUtterance(utterance, popup.aliases)) {
        matches.add(popup.id);
        return;
      }

      const contextMatch = (popup.contextAliases || []).some(
        (rule) =>
          carrierWasSelectedInUtterance(utterance, [rule.alias]) &&
          !rule.excludeInUtterance?.test(utterance) &&
          rule.requireContext.some((pattern) => pattern.test(contextText))
      );
      if (contextMatch) {
        matches.add(popup.id);
      }
    });
  });

  return [...matches];
}
