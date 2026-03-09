/**
 * U65Checklist.jsx — U65 Off-Exchange compliance checklist
 * All items from spec Section 3.2 gate checklists
 */

import { useState } from "react";
import { useU65 } from "./U65Context";

const CHECKLIST_ITEMS = [
  // Gate 0
  { key: "identityVerified", label: "Identity verified (name + DOB confirmed)", gate: 0 },
  { key: "consentRecorded", label: "Call recording consent obtained", gate: 0 },
  // Gate 1
  { key: "currentCoverageDocumented", label: "Current coverage status documented", gate: 1 },
  { key: "employmentTypeDocumented", label: "Employment type documented", gate: 1 },
  { key: "gapReasonUnderstood", label: "Coverage gap reason understood", gate: 1 },
  // Gate 2
  { key: "healthStatusAssessed", label: "Health status assessed", gate: 2 },
  { key: "preExDocumented", label: "Pre-existing conditions documented", gate: 2 },
  { key: "tobaccoDocumented", label: "Tobacco use documented", gate: 2 },
  { key: "uwPreScreenCompleted", label: "UW pre-screen completed", gate: 2 },
  // Gate 3 — CRITICAL compliance items
  { key: "notMECDisclosed", label: "NOT minimum essential coverage — disclosed to client", gate: 3, critical: true },
  { key: "notACASubstituteDisclosed", label: "NOT a substitute for major medical — disclosed to client", gate: 3, critical: true },
  // Gate 3 PALIC-specific
  { key: "preExWaitingPeriodDisclosed", label: "Pre-existing condition exclusion period disclosed (12 months) — PALIC", gate: 3 },
  { key: "fixedBenefitExplained", label: "Fixed-benefit payout structure explained clearly — PALIC", gate: 3 },
  // Gate 3 LIFE-X specific
  { key: "researchAssociateExplained", label: "Research Associate model explained — LIFE-X", gate: 3 },
  { key: "bhpiStructureDisclosed", label: "BHPI/TPA structure disclosed — LIFE-X", gate: 3 },
  { key: "nonTraditionalDisclosed", label: "Non-traditional plan nature disclosed — LIFE-X", gate: 3 },
  // Gate 4
  { key: "productComparisonReviewed", label: "Product comparison reviewed with client", gate: 4 },
  { key: "clientQuestionsAddressed", label: "Client questions addressed", gate: 4 },
  { key: "productSelected", label: "Product selected", gate: 4 },
  // Gate 5
  { key: "ancillaryDiscussed", label: "Ancillary products discussed with client", gate: 5 },
  // Gate 6
  { key: "applicationCompleted", label: "Application completed accurately", gate: 6 },
  { key: "uwQuestionsHonest", label: "UW questions answered honestly — PALIC", gate: 6 },
  { key: "applicationSubmitted", label: "Application submitted", gate: 6 },
  { key: "confirmationRecorded", label: "Confirmation/application number recorded", gate: 6 },
  { key: "effectiveDateConfirmed", label: "Anticipated effective date confirmed", gate: 6 },
  { key: "premiumDisclosed", label: "Premium and payment date disclosed", gate: 6 },
  // Gate 7
  { key: "recapProvided", label: "Coverage recap provided", gate: 7 },
  { key: "nextStepsExplained", label: "Next steps explained (UW timeline, ID cards, payments)", gate: 7 },
  { key: "followUpScheduled", label: "Follow-up scheduled", gate: 7 },
  { key: "clientConfirmed", label: "Client confirmed understanding", gate: 7 },
];

const GATE_LABELS = {
  0: "Gate 0 — Opening",
  1: "Gate 1 — Situation",
  2: "Gate 2 — Health / UW",
  3: "Gate 3 — Products",
  4: "Gate 4 — Selection",
  5: "Gate 5 — Ancillary",
  6: "Gate 6 — Application",
  7: "Gate 7 — Closing",
};

export default function U65Checklist() {
  const { state } = useU65();
  const [localChecks, setLocalChecks] = useState({});

  const toggle = (key) => setLocalChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  const gateNums = [...new Set(CHECKLIST_ITEMS.map((i) => i.gate))];
  const completed = CHECKLIST_ITEMS.filter((i) => localChecks[i.key]).length;
  const total = CHECKLIST_ITEMS.length;
  const pct = Math.round((completed / total) * 100);

  const criticalMissing = CHECKLIST_ITEMS.filter(
    (i) => i.critical && !localChecks[i.key]
  );

  return (
    <div
      style={{
        marginTop: 16,
        padding: "18px 18px",
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 10,
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#dfe6f0" }}>U65 Compliance Checklist</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: pct === 100 ? "#34d399" : "#a855f7",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {completed}/{total}
        </span>
      </div>

      <div style={{ height: 3, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", background: pct === 100 ? "#34d399" : "#a855f7", borderRadius: 2, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>

      {criticalMissing.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: "9px 12px",
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 7,
            fontSize: 11,
            color: "#f87171",
          }}
        >
          🚨 Critical disclosures not yet checked: {criticalMissing.map((i) => i.label).join(" · ")}
        </div>
      )}

      {gateNums.map((gateNum) => {
        const items = CHECKLIST_ITEMS.filter((i) => i.gate === gateNum);
        return (
          <div key={gateNum} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>
              {GATE_LABELS[gateNum]}
            </div>
            {items.map((item) => (
              <label
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "5px 2px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: localChecks[item.key] ? "#34d399" : item.critical ? "#f87171" : "#8fa4bc",
                  lineHeight: 1.4,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!localChecks[item.key]}
                  onChange={() => toggle(item.key)}
                  style={{ marginTop: 1, flexShrink: 0 }}
                />
                <span style={{ textDecoration: localChecks[item.key] ? "line-through" : "none", opacity: localChecks[item.key] ? 0.6 : 1 }}>
                  {item.label}
                  {item.critical && !localChecks[item.key] && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 3, padding: "1px 5px" }}>
                      REQUIRED
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        );
      })}

      {pct === 100 && (
        <div style={{ marginTop: 8, padding: "10px", textAlign: "center", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 7, fontSize: 13, color: "#34d399", fontWeight: 700 }}>
          ✓ All compliance items complete
        </div>
      )}
    </div>
  );
}
