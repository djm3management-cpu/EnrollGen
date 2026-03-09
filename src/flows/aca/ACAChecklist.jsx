/**
 * ACAChecklist.jsx — ACA On-Exchange compliance checklist
 * All items from spec Section 2.2 gate checklists
 */

import { useState } from "react";
import { useACA } from "./ACAContext";

const CHECKLIST_ITEMS = [
  // Gate 0
  { key: "identityVerified", label: "Identity verified (name + DOB confirmed)", gate: 0 },
  { key: "consentRecorded", label: "Call recording consent obtained", gate: 0 },
  // Gate 1 (SEP only)
  { key: "sepEventConfirmed", label: "SEP qualifying event confirmed", gate: 1, sepOnly: true },
  { key: "sepWindowVerified", label: "SEP date within 60-day window verified", gate: 1, sepOnly: true },
  { key: "sepDocsNoted", label: "SEP documentation identified / noted", gate: 1, sepOnly: true },
  // Gate 2
  { key: "householdDocumented", label: "Household size documented", gate: 2 },
  { key: "incomeDocumented", label: "Income documented / estimated", gate: 2 },
  { key: "fplCalculated", label: "FPL% calculated and subsidy eligibility determined", gate: 2 },
  // Gate 3
  { key: "providersDocumented", label: "Provider preferences documented", gate: 3 },
  { key: "rxDocumented", label: "Prescription list documented", gate: 3 },
  { key: "utilizationAssessed", label: "Utilization level assessed", gate: 3 },
  { key: "budgetNoted", label: "Budget range noted", gate: 3 },
  // Gate 4
  { key: "planBenefitsReviewed", label: "Plan benefits reviewed with client", gate: 4 },
  { key: "networkChecked", label: "Network adequacy checked for client providers", gate: 4 },
  { key: "formularyChecked", label: "Formulary checked for client prescriptions", gate: 4 },
  { key: "premiumDisclosed", label: "Premium amount disclosed (with subsidy if applicable)", gate: 4 },
  // Gate 5
  { key: "aptcConfirmed", label: "APTC election amount confirmed", gate: 5 },
  { key: "enrollmentSubmitted", label: "Enrollment submitted successfully", gate: 5 },
  { key: "confirmationRecorded", label: "Confirmation number recorded", gate: 5 },
  { key: "effectiveDateConfirmed", label: "Effective date confirmed", gate: 5 },
  { key: "firstPremiumDisclosed", label: "First premium amount and due date disclosed", gate: 5 },
  // Gate 6
  { key: "recapProvided", label: "Coverage recap provided to client", gate: 6 },
  { key: "paymentInstructionsGiven", label: "First premium payment instructions given", gate: 6 },
  { key: "followUpScheduled", label: "Follow-up scheduled", gate: 6 },
  { key: "clientConfirmed", label: "Client confirmed understanding of next steps", gate: 6 },
];

const GATE_LABELS = {
  0: "Gate 0 — Opening",
  1: "Gate 1 — SEP (Conditional)",
  2: "Gate 2 — Income",
  3: "Gate 3 — Needs",
  4: "Gate 4 — Plans",
  5: "Gate 5 — Enrollment",
  6: "Gate 6 — Closing",
};

export default function ACAChecklist() {
  const { state, dispatch } = useACA();
  const [localChecks, setLocalChecks] = useState({});

  const toggle = (key) => {
    setLocalChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const gateNums = [...new Set(CHECKLIST_ITEMS.map((i) => i.gate))];
  const completed = CHECKLIST_ITEMS.filter((i) => {
    if (i.sepOnly && state.enrollmentPeriod !== "SEP") return false;
    return localChecks[i.key];
  }).length;
  const total = CHECKLIST_ITEMS.filter((i) => {
    if (i.sepOnly && state.enrollmentPeriod !== "SEP") return false;
    return true;
  }).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

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
        <span style={{ fontSize: 13, fontWeight: 700, color: "#dfe6f0" }}>ACA Compliance Checklist</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: pct === 100 ? "#34d399" : "#EAB308",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {completed}/{total}
        </span>
      </div>

      <div style={{ height: 3, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", background: pct === 100 ? "#34d399" : "#EAB308", borderRadius: 2, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>

      {gateNums.map((gateNum) => {
        const items = CHECKLIST_ITEMS.filter((i) => {
          if (i.gate !== gateNum) return false;
          if (i.sepOnly && state.enrollmentPeriod !== "SEP") return false;
          return true;
        });
        if (items.length === 0) return null;
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
                  color: localChecks[item.key] ? "#34d399" : "#8fa4bc",
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

