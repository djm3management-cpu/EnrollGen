import { useMemo } from "react";
import { ANNUITY_MODE } from "../flows/ancillary/ancillaryConstants";

function normalizeMode(mode) {
  return mode === ANNUITY_MODE.OUTBOUND ? ANNUITY_MODE.OUTBOUND : ANNUITY_MODE.INBOUND;
}

function parsePercent(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAge(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isReplacementFlagged(suitability = {}) {
  return ["yes", "exchange_1035", "replace_existing"].includes(
    String(suitability.replacementFunding || "").toLowerCase()
  );
}

function buildRiskWhisper(productState = {}) {
  const suitability = productState.annuitySuitability || {};
  const liquidPercent = parsePercent(suitability.liquidAssetsPercent);
  const age = parseAge(suitability.clientAge);

  if (liquidPercent !== null && liquidPercent > 50) {
    return "Liquidity concentration risk. Pause and document why this amount is still suitable.";
  }

  if (age !== null && age < 59.5) {
    return "Under 59 and a half. Disclose possible IRS penalty before any withdrawal discussion.";
  }

  if (age !== null && age > 85) {
    return "Over age 85. Verify carrier issue-age limits before quoting or applying.";
  }

  if (isReplacementFlagged(suitability)) {
    return "Replacement flagged. Review surrender charges, lost benefits, and 1035 paperwork.";
  }

  return "";
}

function buildDefaultSectionWhisper({ activeStep, productState }) {
  const mode = normalizeMode(productState?.annuityMode);
  const modeWhisper = activeStep?.coaching?.[mode] || activeStep?.coaching?.inbound || "";
  const riskWhisper = buildRiskWhisper(productState);

  if (riskWhisper) return riskWhisper;
  if (modeWhisper) return modeWhisper;

  return mode === ANNUITY_MODE.OUTBOUND
    ? "Keep the tone warm and protect the existing client relationship."
    : "Keep the flow direct and complete each gate before moving on.";
}

function buildAnalyzeWhisper({ complianceScore, productState }) {
  const riskWhisper = buildRiskWhisper(productState);
  if (riskWhisper) return riskWhisper;

  const score = complianceScore?.score ?? 0;
  return `Annuity score is ${score}%. Hard gates are recording consent and suitability completion.`;
}

export function useAnnuityCopilotEngine({ activeStep, productState, complianceScore }) {
  return useMemo(
    () => ({
      sectionMessage: buildDefaultSectionWhisper({ activeStep, productState }),
      analyzeMessage: buildAnalyzeWhisper({ complianceScore, productState }),
      mode: normalizeMode(productState?.annuityMode),
    }),
    [activeStep, complianceScore, productState]
  );
}
