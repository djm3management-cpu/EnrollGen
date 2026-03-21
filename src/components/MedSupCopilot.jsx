/**
 * MedSupCopilot.jsx — Medicare Supplement Eligibility & Compliance Copilot
 *
 * Decision engine that answers:
 *   Can this person buy Medigap, under what right, and with what compliance path?
 *
 * 4 phases:
 *   1. Medicare Status & Timing
 *   2. Rights Engine (GI, OEP, Trial, State)
 *   3. Plan Fit Guidance
 *   4. Replacement & Documentation Compliance
 *
 * 4 outputs:
 *   - Eligible with protected right, no underwriting
 *   - Eligible, underwriting required
 *   - Not appropriate yet, missing Medicare setup or timing issue
 *   - Possible state-specific exception, verify state rule
 */

import { useState, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ACCENT = "#C7CEDA";
const ACCENT_DIM = "rgba(199,206,218,";

/* ═══════════════════════════════════════════════════════
   STATE PROTECTION RULES BY STATE
   ═══════════════════════════════════════════════════════ */

const STATE_PROTECTIONS = {
  CT: { under65: true, giBeyondFederal: true, note: "CT guarantees Medigap access for under-65 Medicare beneficiaries. Continuous OEP for Plans A, B, C, D, or high-deductible F." },
  MA: { under65: true, giBeyondFederal: true, note: "MA requires insurers to offer Medigap to under-65 Medicare beneficiaries during their Medigap OEP at the same rates as 65+." },
  ME: { under65: true, giBeyondFederal: false, note: "ME requires Medigap availability for under-65 disabled Medicare beneficiaries." },
  MN: { under65: true, giBeyondFederal: true, note: "MN has unique standardized Medigap plans (not federal letter plans). Requires under-65 access." },
  NY: { under65: true, giBeyondFederal: true, note: "NY has continuous open enrollment — insurers must offer Medigap year-round with no medical underwriting, at any age on Medicare." },
  OR: { under65: true, giBeyondFederal: true, note: "OR guarantees Medigap access for under-65 disabled Medicare beneficiaries during OEP at standard rates." },
  VT: { under65: true, giBeyondFederal: true, note: "VT has community-rated Medigap with guaranteed issue for under-65 beneficiaries." },
  WA: { under65: true, giBeyondFederal: true, note: "WA guarantees Medigap access for under-65 disabled Medicare beneficiaries during their first 6-month OEP." },
  WI: { under65: true, giBeyondFederal: true, note: "WI has unique standardized Medigap (base + riders). Requires under-65 access." },
  NJ: { under65: true, giBeyondFederal: true, note: "NJ requires Medigap availability for under-65 Medicare beneficiaries with guaranteed issue during OEP." },
  MO: { under65: false, giBeyondFederal: true, note: "MO provides additional GI rights for certain Medicare beneficiaries switching from MA plans." },
  CA: { under65: false, giBeyondFederal: true, note: "CA provides annual 30-day birthday rule — GI right to switch Medigap plans within 30 days after your birthday each year (same or lower letter)." },
  IL: { under65: false, giBeyondFederal: true, note: "IL requires Medigap availability for under-65 disabled beneficiaries and provides additional switching rights." },
  OK: { under65: false, giBeyondFederal: true, note: "OK provides additional replacement GI rights during an annual window." },
};

const GI_TRIGGERS = [
  { id: "ma_disenroll", label: "Leaving Medicare Advantage (voluntary or plan withdrawal)", gi: true, note: "Federal GI right within 63 days of MA disenrollment. Eligible for Plans A, B, C, F, K, or L." },
  { id: "ma_trial_return", label: "Returning to Original Medicare within 12 months of first trying MA (trial right)", gi: true, note: "Trial right — left Medigap to try MA for the first time. Must return within 12 months. Entitled to same Medigap plan or Plans A, B, C, F, K, or L." },
  { id: "employer_loss", label: "Losing employer/union group coverage (including retiree coverage)", gi: true, note: "Federal GI right. Must apply within 63 days of coverage loss." },
  { id: "plan_nonrenewal", label: "Medigap insurer left the market or plan non-renewed", gi: true, note: "Federal GI right if insurer went bankrupt, left the state, or the plan was non-renewed through no fault of the insured." },
  { id: "medicaid_loss", label: "Lost Medicaid eligibility", gi: true, note: "Federal GI right. Must apply within 63 days of losing Medicaid." },
  { id: "select_move", label: "Moved out of Medigap SELECT plan service area", gi: true, note: "Federal GI right due to SELECT network restriction. Must apply within 63 days." },
  { id: "misled", label: "Misled into dropping coverage / material misrepresentation", gi: true, note: "Federal GI right. Must apply within 63 days of discovering the misrepresentation." },
  { id: "none", label: "None of the above — no qualifying event", gi: false, note: "No federal GI right. Subject to medical underwriting unless state protections apply." },
];

const PLAN_INFO = {
  G: {
    name: "Plan G",
    summary: "Covers all Original Medicare gaps except the Part B deductible ($257 in 2025). After the deductible, 100% of Medicare-approved charges are covered. No network restrictions. No referrals needed.",
    excess: "Covers Part B excess charges (doctors who don't accept Medicare assignment).",
    foreign: "Includes foreign travel emergency benefit (80% after $250 deductible, up to $50,000 lifetime).",
    fit: "Best for: clients who want comprehensive coverage and predictable costs after the annual deductible.",
  },
  N: {
    name: "Plan N",
    summary: "Covers most Original Medicare gaps. Client pays Part B deductible, up to $20 copay for office visits, and up to $50 copay for ER visits not resulting in admission.",
    excess: "Does NOT cover Part B excess charges. Client exposed if provider doesn't accept assignment.",
    foreign: "Includes foreign travel emergency benefit.",
    fit: "Best for: clients who want lower premiums and are comfortable with small copays. Works well for healthy, low-utilization clients.",
  },
  HDG: {
    name: "High Deductible Plan G",
    summary: "Same coverage as Plan G but with a high annual deductible ($2,870 in 2025). Client pays all costs until deductible is met, then 100% covered. Significantly lower premiums.",
    excess: "Covers Part B excess charges (after deductible).",
    foreign: "Includes foreign travel emergency benefit (after deductible).",
    fit: "Best for: healthy clients who want catastrophic protection at the lowest premium. Not available in all states.",
  },
};

const DOCUMENTATION_ITEMS = [
  { id: "current_coverage", label: "Current coverage documented (carrier, plan letter, premium, effective date)", required: true },
  { id: "replacement_intent", label: "Replacement intent confirmed — is this replacing existing Medigap, MA, or employer coverage?", required: true },
  { id: "effective_dates", label: "Requested effective date confirmed and aligned with coverage transition", required: true },
  { id: "gi_proof", label: "Guaranteed issue proof documented (if applicable — termination letter, MA disenrollment confirmation, etc.)", required: "gi" },
  { id: "underwriting_disclosed", label: "Underwriting requirement disclosed to client (if applicable — health questions, possible denial)", required: "uw" },
  { id: "part_d_reminder", label: "Part D reminder delivered — Medigap does NOT include prescription drug coverage", required: true },
  { id: "not_covered_disclosure", label: "Disclosed: Medigap does not cover dental, vision, hearing, long-term care, or routine prescriptions", required: true },
  { id: "state_forms", label: "State-required forms or notices identified and prepared", required: true },
  { id: "outline_of_coverage", label: "Outline of Coverage provided or scheduled to deliver", required: true },
];

/* ═══════════════════════════════════════════════════════
   DETERMINATION ENGINE
   ═══════════════════════════════════════════════════════ */

function computeDetermination(intake) {
  const {
    hasPartA, hasPartB, partBEffective, medicareSource,
    currentCoverage, state: clientState, age,
    inOEP, giTrigger, hasMedigap,
  } = intake;

  // Phase 1: Medicare readiness
  if (!hasPartA || !hasPartB) {
    return {
      code: "NOT_READY",
      label: "Not appropriate yet — missing Medicare setup or timing issue",
      color: "#f87171",
      icon: "✕",
      detail: !hasPartA && !hasPartB
        ? "Client does not have Part A or Part B. Both are required for Medigap eligibility."
        : !hasPartA
        ? "Client does not have Part A active. Part A is required for Medigap."
        : "Client does not have Part B active. Part B is required for Medigap. Advise client to enroll in Part B before pursuing Medigap.",
    };
  }

  if (currentCoverage === "ma" && medicareSource !== "leaving_ma") {
    return {
      code: "NOT_READY",
      label: "Not appropriate yet — missing Medicare setup or timing issue",
      color: "#f87171",
      icon: "✕",
      detail: "Client is currently enrolled in Medicare Advantage. They must disenroll from MA and return to Original Medicare before a Medigap policy can take effect. Confirm their MA disenrollment date and coordinate timing.",
    };
  }

  // Phase 2: Rights determination
  const stateRules = STATE_PROTECTIONS[clientState];
  const isUnder65 = age && parseInt(age) < 65;

  // Check for state-specific exception first
  if (isUnder65 && stateRules?.under65) {
    return {
      code: "PROTECTED",
      label: "Eligible with protected right — no underwriting path",
      color: "#4ade80",
      icon: "✓",
      detail: `Client is under 65 with state protection in ${clientState}. ${stateRules.note}`,
      stateNote: stateRules.note,
    };
  }

  if (isUnder65 && !stateRules?.under65) {
    if (stateRules?.giBeyondFederal) {
      return {
        code: "STATE_EXCEPTION",
        label: "Possible state-specific exception — verify state rule",
        color: "#EAB308",
        icon: "◆",
        detail: `Client is under 65 in ${clientState}. ${stateRules.note} Verify current state rules for under-65 Medigap access.`,
        stateNote: stateRules.note,
      };
    }
    return {
      code: "STATE_EXCEPTION",
      label: "Possible state-specific exception — verify state rule",
      color: "#EAB308",
      icon: "◆",
      detail: `Client is under 65 in ${clientState}. Federal law does not require Medigap access for under-65 beneficiaries, but some states provide protections. Check ${clientState} insurance department for current rules. Medicare.gov notes additional rights may exist under state law.`,
    };
  }

  // 6-month Medigap OEP
  if (inOEP) {
    return {
      code: "PROTECTED",
      label: "Eligible with protected right — no underwriting path",
      color: "#4ade80",
      icon: "✓",
      detail: "Client is within their 6-month Medigap Open Enrollment Period (starts when they are both 65+ and enrolled in Part B). During OEP, insurers must sell any Medigap policy at the best available rate with no medical underwriting.",
    };
  }

  // Federal GI right
  const trigger = GI_TRIGGERS.find((t) => t.id === giTrigger);
  if (trigger?.gi) {
    return {
      code: "PROTECTED",
      label: "Eligible with protected right — no underwriting path",
      color: "#4ade80",
      icon: "✓",
      detail: `Client has a federal guaranteed issue right: ${trigger.note}`,
      giNote: trigger.note,
    };
  }

  // State GI beyond federal
  if (stateRules?.giBeyondFederal && clientState === "CA") {
    return {
      code: "STATE_EXCEPTION",
      label: "Possible state-specific exception — verify state rule",
      color: "#EAB308",
      icon: "◆",
      detail: `${stateRules.note} Check if client is within 30 days of their birthday for the CA birthday rule.`,
      stateNote: stateRules.note,
    };
  }

  if (stateRules?.giBeyondFederal && clientState === "NY") {
    return {
      code: "PROTECTED",
      label: "Eligible with protected right — no underwriting path",
      color: "#4ade80",
      icon: "✓",
      detail: stateRules.note,
      stateNote: stateRules.note,
    };
  }

  if (stateRules?.giBeyondFederal) {
    return {
      code: "STATE_EXCEPTION",
      label: "Possible state-specific exception — verify state rule",
      color: "#EAB308",
      icon: "◆",
      detail: `${stateRules.note} Verify whether client qualifies for state-level protections before proceeding with underwriting.`,
      stateNote: stateRules.note,
    };
  }

  // No protections — underwriting
  return {
    code: "UNDERWRITING",
    label: "Eligible — underwriting required",
    color: "#fbbf24",
    icon: "▲",
    detail: "Client has no federal GI right and is outside the Medigap OEP. Medical underwriting applies. Carrier may ask health questions and can deny coverage, charge higher premiums, or exclude pre-existing conditions. Disclose this to the client before proceeding.",
  };
}

/* ═══════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════ */

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7a8d", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>
        {label}
      </label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%", padding: "8px 10px", background: "#2a2a32",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
          color: value ? "#f0f0f0" : "#8a8a9a", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif", outline: "none",
          appearance: "auto",
        }}
      >
        <option value="" style={{ background: "#2a2a32", color: "#8a8a9a" }}>{placeholder || "Select..."}</option>
        {options.map((opt) => (
          <option key={typeof opt === "string" ? opt : opt.value} value={typeof opt === "string" ? opt : opt.value} style={{ background: "#2a2a32", color: "#f0f0f0" }}>
            {typeof opt === "string" ? opt : opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ label, value, onChange, description }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        className="check"
        style={{
          padding: "8px 12px",
          border: `1px solid ${value ? `${ACCENT_DIM}0.2)` : "rgba(255,255,255,0.06)"}`,
          background: value ? `${ACCENT_DIM}0.04)` : "rgba(255,255,255,0.08)",
          color: value ? ACCENT : "#dfe6f0",
          borderRadius: 6, cursor: "pointer",
        }}
      >
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ margin: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      </label>
      {description && <div style={{ fontSize: 11, color: "#5a6070", marginTop: 4, marginLeft: 24, lineHeight: 1.4 }}>{description}</div>}
    </div>
  );
}

function PhaseHeader({ num, title, complete, active }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: complete ? "#34d399" : active ? ACCENT : "#4a5568",
        background: complete ? "rgba(52,211,153,0.08)" : active ? `${ACCENT_DIM}0.08)` : "rgba(255,255,255,0.03)",
        border: `1px solid ${complete ? "rgba(52,211,153,0.15)" : active ? `${ACCENT_DIM}0.15)` : "rgba(255,255,255,0.08)"}`,
        borderRadius: 5, padding: "3px 8px", fontVariantNumeric: "tabular-nums",
      }}>
        {complete ? "✓" : num}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#dfe6f0" }}>{title}</span>
    </div>
  );
}

function InfoBox({ color, children }) {
  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}22`,
      borderRadius: 8, padding: "10px 14px", marginBottom: 12,
      fontSize: 12, color: `${color}cc`, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

const MedSupCopilot = memo(function MedSupCopilot() {
  const [expanded, setExpanded] = useState(false);
  // Intake state
  const [intake, setIntake] = useState({
    // Phase 1
    hasPartA: null,
    hasPartB: null,
    partBEffective: "",
    age: "",
    state: null,
    medicareSource: null, // "aging_in" | "disability" | "esrd" | "leaving_ma" | "leaving_employer"
    currentCoverage: null, // "original" | "ma" | "employer" | "medigap" | "none"
    // Phase 2
    inOEP: null,
    giTrigger: null,
    // Phase 4
    docs: {},
  });

  const [activePhase, setActivePhase] = useState(1);
  const [showPlanGuide, setShowPlanGuide] = useState(null); // "G" | "N" | "HDG"

  const update = useCallback((field, value) => {
    setIntake((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleDoc = useCallback((id) => {
    setIntake((prev) => ({ ...prev, docs: { ...prev.docs, [id]: !prev.docs[id] } }));
  }, []);

  // Phase completion checks
  const phase1Complete = intake.hasPartA !== null && intake.hasPartB !== null && intake.state && intake.currentCoverage && intake.medicareSource;
  const phase2Complete = phase1Complete && (intake.inOEP !== null || intake.giTrigger !== null);

  // Determination
  const determination = useMemo(() => {
    if (!phase2Complete) return null;
    return computeDetermination(intake);
  }, [intake, phase2Complete]);

  const phase3Complete = determination && determination.code !== "NOT_READY";
  const docsRequired = DOCUMENTATION_ITEMS.filter((d) => {
    if (d.required === true) return true;
    if (d.required === "gi" && determination?.code === "PROTECTED") return true;
    if (d.required === "uw" && determination?.code === "UNDERWRITING") return true;
    return false;
  });
  const docsComplete = docsRequired.every((d) => intake.docs[d.id]);
  const phase4Complete = docsComplete;

  return (
    <section className="card prompter-card" style={{ marginTop: 12, marginBottom: 14 }}>
      {/* ── Header ── */}
      <div className="prompter-header" onClick={() => setExpanded((p) => !p)}>
        <div className="prompter-header-left">
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#2e2e38",
            flexShrink: 0, display: "inline-block",
          }} />
          <div>
            <h2 style={{ margin: 0 }}>MED SUP ELIGIBILITY</h2>
            <span className="muted" style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
              Phase {activePhase} of 4
            </span>
          </div>
        </div>
        <span className="prompter-toggle">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (<>

      {/* ── PHASE 1: Medicare Status & Timing ── */}
      <div
        style={{
          background: activePhase === 1 ? `${ACCENT_DIM}0.08)` : "rgba(255,255,255,0.08)",
          border: `1px solid ${activePhase === 1 ? `${ACCENT_DIM}0.15)` : "rgba(255,255,255,0.08)"}`,
          borderRadius: 10, padding: "16px 16px", marginBottom: 10, cursor: "pointer",
        }}
        onClick={() => setActivePhase(1)}
      >
        <PhaseHeader num="1" title="Medicare Status & Timing" complete={phase1Complete} active={activePhase === 1} />

        {activePhase === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            <Select
              label="Client State"
              value={intake.state}
              onChange={(v) => update("state", v)}
              options={US_STATES}
              placeholder="Select state..."
            />

            {intake.state && STATE_PROTECTIONS[intake.state] && (
              <InfoBox color="#EAB308">
                <strong>{intake.state} State Protection:</strong> {STATE_PROTECTIONS[intake.state].note}
              </InfoBox>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7a8d", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>Age</label>
                <input
                  type="number"
                  value={intake.age}
                  onChange={(e) => update("age", e.target.value)}
                  placeholder="e.g. 67"
                  style={{
                    width: "100%", padding: "8px 10px", background: "#2a2a32",
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
                    color: "#f0f0f0", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7a8d", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>Part B Effective Date</label>
                <input
                  type="month"
                  value={intake.partBEffective}
                  onChange={(e) => update("partBEffective", e.target.value)}
                  style={{
                    width: "100%", padding: "8px 10px", background: "#2a2a32",
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
                    color: "#f0f0f0", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}><Toggle label="Has Part A" value={intake.hasPartA === true} onChange={(v) => update("hasPartA", v)} /></div>
              <div style={{ flex: 1 }}><Toggle label="Has Part B" value={intake.hasPartB === true} onChange={(v) => update("hasPartB", v)} /></div>
            </div>

            <Select
              label="How did client become Medicare-eligible?"
              value={intake.medicareSource}
              onChange={(v) => update("medicareSource", v)}
              options={[
                { value: "aging_in", label: "Aging in (turning/turned 65)" },
                { value: "disability", label: "Disability (under 65, SSDI 24+ months)" },
                { value: "esrd", label: "End-Stage Renal Disease (ESRD)" },
                { value: "leaving_ma", label: "Leaving Medicare Advantage" },
                { value: "leaving_employer", label: "Leaving employer/retiree coverage" },
              ]}
              placeholder="Select..."
            />

            <Select
              label="Current coverage type"
              value={intake.currentCoverage}
              onChange={(v) => update("currentCoverage", v)}
              options={[
                { value: "original", label: "Original Medicare (Parts A & B only)" },
                { value: "ma", label: "Medicare Advantage (Part C)" },
                { value: "medigap", label: "Existing Medigap policy" },
                { value: "employer", label: "Employer/union group coverage" },
                { value: "none", label: "No current coverage" },
              ]}
              placeholder="Select..."
            />

            {intake.currentCoverage === "ma" && intake.medicareSource !== "leaving_ma" && (
              <InfoBox color="#f87171">
                Client is on Medicare Advantage. They must disenroll from MA and return to Original Medicare before Medigap can take effect. Confirm if they are planning to leave MA.
              </InfoBox>
            )}

            {phase1Complete && (
              <button
                onClick={() => setActivePhase(2)}
                style={{
                  marginTop: 8, width: "100%", padding: "10px", borderRadius: 8,
                  background: `linear-gradient(145deg, ${ACCENT_DIM}0.12), ${ACCENT_DIM}0.04))`,
                  border: `1px solid ${ACCENT_DIM}0.25)`, color: ACCENT,
                  fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                }}
              >
                Continue to Rights Engine →
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* ── PHASE 2: Rights Engine ── */}
      <div
        style={{
          background: activePhase === 2 ? `${ACCENT_DIM}0.08)` : "rgba(255,255,255,0.08)",
          border: `1px solid ${activePhase === 2 ? `${ACCENT_DIM}0.15)` : "rgba(255,255,255,0.08)"}`,
          borderRadius: 10, padding: "16px 16px", marginBottom: 10, cursor: phase1Complete ? "pointer" : "default",
          opacity: phase1Complete ? 1 : 0.4,
        }}
        onClick={() => phase1Complete && setActivePhase(2)}
      >
        <PhaseHeader num="2" title="Rights Engine" complete={phase2Complete} active={activePhase === 2} />

        {activePhase === 2 && phase1Complete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            <InfoBox color={ACCENT}>
              <strong>Before showing plans or rates</strong>, determine the client's enrollment right. This determines whether the carrier can medically underwrite or must issue guaranteed.
            </InfoBox>

            <Toggle
              label="Within 6-month Medigap Open Enrollment Period"
              value={intake.inOEP === true}
              onChange={(v) => update("inOEP", v)}
              description="Starts when the person is both 65+ AND enrolled in Part B. Lasts 6 months. During this window, any Medigap plan must be sold at best available rate with no underwriting."
            />

            {!intake.inOEP && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7a8d", marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Federal Guaranteed Issue Trigger
                </div>
                {GI_TRIGGERS.map((trigger) => (
                  <div
                    key={trigger.id}
                    onClick={() => update("giTrigger", trigger.id)}
                    style={{
                      padding: "10px 12px", marginBottom: 6, borderRadius: 8, cursor: "pointer",
                      background: intake.giTrigger === trigger.id
                        ? trigger.gi ? `${ACCENT_DIM}0.06)` : "rgba(251,191,36,0.06)"
                        : "rgba(255,255,255,0.06)",
                      border: `1px solid ${intake.giTrigger === trigger.id
                        ? trigger.gi ? `${ACCENT_DIM}0.2)` : "rgba(251,191,36,0.2)"
                        : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div style={{
                      fontSize: 13, fontWeight: intake.giTrigger === trigger.id ? 600 : 400,
                      color: intake.giTrigger === trigger.id ? (trigger.gi ? ACCENT : "#fbbf24") : "#8fa4bc",
                    }}>
                      {intake.giTrigger === trigger.id ? "● " : "○ "}{trigger.label}
                    </div>
                    {intake.giTrigger === trigger.id && (
                      <div style={{ fontSize: 11, color: "#6b7a8d", marginTop: 4, lineHeight: 1.4 }}>
                        {trigger.note}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {phase2Complete && (
              <button
                onClick={() => setActivePhase(3)}
                style={{
                  marginTop: 8, width: "100%", padding: "10px", borderRadius: 8,
                  background: `linear-gradient(145deg, ${ACCENT_DIM}0.12), ${ACCENT_DIM}0.04))`,
                  border: `1px solid ${ACCENT_DIM}0.25)`, color: ACCENT,
                  fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                }}
              >
                See Determination →
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* ── DETERMINATION OUTPUT ── */}
      {determination && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: `${determination.color}0a`,
              border: `1px solid ${determination.color}33`,
              borderRadius: 12, padding: "18px 18px", marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22, color: determination.color }}>{determination.icon}</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: determination.color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  DETERMINATION
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#dfe6f0", marginTop: 2 }}>
                  {determination.label}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#b0b8c8", lineHeight: 1.6 }}>
              {determination.detail}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── PHASE 3: Plan Fit Guidance ── */}
      <div
        style={{
          background: activePhase === 3 ? `${ACCENT_DIM}0.08)` : "rgba(255,255,255,0.08)",
          border: `1px solid ${activePhase === 3 ? `${ACCENT_DIM}0.15)` : "rgba(255,255,255,0.08)"}`,
          borderRadius: 10, padding: "16px 16px", marginBottom: 10, cursor: phase3Complete ? "pointer" : "default",
          opacity: phase3Complete ? 1 : 0.4,
        }}
        onClick={() => phase3Complete && setActivePhase(3)}
      >
        <PhaseHeader num="3" title="Plan Fit Guidance" complete={false} active={activePhase === 3} />

        {activePhase === 3 && phase3Complete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>

            <InfoBox color="#f87171">
              <strong>Part D Reminder:</strong> Medigap policies sold after 2005 do NOT include prescription drug coverage. If the client needs drug coverage, they must enroll in a standalone Part D plan. Failing to enroll during their Initial Enrollment Period may result in a late enrollment penalty.
            </InfoBox>

            <InfoBox color="#EAB308">
              <strong>Not Covered by Medigap:</strong> Dental, vision, hearing, long-term care, and routine prescription drugs. Medigap covers gaps in Original Medicare only.
            </InfoBox>

            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7a8d", marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Standardized Plan Comparison
            </div>

            {Object.entries(PLAN_INFO).map(([key, plan]) => (
              <div
                key={key}
                onClick={() => setShowPlanGuide(showPlanGuide === key ? null : key)}
                style={{
                  marginBottom: 8, borderRadius: 8, cursor: "pointer",
                  background: showPlanGuide === key ? `${ACCENT_DIM}0.04)` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${showPlanGuide === key ? `${ACCENT_DIM}0.18)` : "rgba(255,255,255,0.08)"}`,
                  overflow: "hidden",
                }}
              >
                <div style={{
                  padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>{plan.name}</span>
                    {key === "HDG" && <span style={{ fontSize: 10, color: "#6b7a8d", marginLeft: 8 }}>(where offered)</span>}
                  </div>
                  <span style={{ fontSize: 12, color: "#4a5568" }}>{showPlanGuide === key ? "▲" : "▼"}</span>
                </div>

                {showPlanGuide === key && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ padding: "0 14px 14px", fontSize: 12, color: "#8fa4bc", lineHeight: 1.6 }}
                  >
                    <div style={{ marginBottom: 6 }}>{plan.summary}</div>
                    <div style={{ marginBottom: 6 }}>
                      <strong style={{ color: plan.excess.includes("NOT") ? "#f87171" : ACCENT }}>Excess Charges:</strong> {plan.excess}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong style={{ color: ACCENT }}>Foreign Travel:</strong> {plan.foreign}
                    </div>
                    <div style={{
                      background: `${ACCENT_DIM}0.04)`, border: `1px solid ${ACCENT_DIM}0.12)`,
                      borderRadius: 6, padding: "8px 10px", marginTop: 8,
                    }}>
                      <strong style={{ color: ACCENT }}>Best for:</strong> {plan.fit.replace("Best for: ", "")}
                    </div>
                  </motion.div>
                )}
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <InfoBox color={ACCENT}>
                <strong>Medigap is guaranteed renewable</strong> as long as premiums are paid, regardless of health changes after the policy is issued.
              </InfoBox>
            </div>

            <button
              onClick={() => setActivePhase(4)}
              style={{
                marginTop: 4, width: "100%", padding: "10px", borderRadius: 8,
                background: `linear-gradient(145deg, ${ACCENT_DIM}0.12), ${ACCENT_DIM}0.04))`,
                border: `1px solid ${ACCENT_DIM}0.25)`, color: ACCENT,
                fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
              }}
            >
              Continue to Documentation →
            </button>
          </motion.div>
        )}
      </div>

      {/* ── PHASE 4: Replacement & Documentation Compliance ── */}
      <div
        style={{
          background: activePhase === 4 ? `${ACCENT_DIM}0.08)` : "rgba(255,255,255,0.08)",
          border: `1px solid ${activePhase === 4 ? `${ACCENT_DIM}0.15)` : "rgba(255,255,255,0.08)"}`,
          borderRadius: 10, padding: "16px 16px", marginBottom: 10, cursor: phase3Complete ? "pointer" : "default",
          opacity: phase3Complete ? 1 : 0.4,
        }}
        onClick={() => phase3Complete && setActivePhase(4)}
      >
        <PhaseHeader num="4" title="Replacement & Documentation Compliance" complete={phase4Complete} active={activePhase === 4} />

        {activePhase === 4 && phase3Complete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>

            {intake.currentCoverage === "medigap" && (
              <InfoBox color="#f87171">
                <strong>REPLACEMENT ALERT:</strong> This is a Medigap replacement. NAIC model regulations require proper disclosure. Confirm the client understands they are replacing an existing policy. Ensure no gap in coverage between old and new effective dates. State-required replacement forms must be completed.
              </InfoBox>
            )}

            {determination?.code === "PROTECTED" && (
              <InfoBox color={ACCENT}>
                <strong>Guaranteed Issue:</strong> Document the GI right source. Carrier cannot deny or rate up. Collect proof of qualifying event (termination letter, MA disenrollment confirmation, etc.).
              </InfoBox>
            )}

            {determination?.code === "UNDERWRITING" && (
              <InfoBox color="#fbbf24">
                <strong>Underwriting Required:</strong> Client must answer health questions. Disclose that the application may be declined, rated up, or have pre-existing condition exclusions. Do NOT submit an application until the client understands the underwriting process.
              </InfoBox>
            )}

            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7a8d", marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Documentation Checklist
            </div>

            {docsRequired.map((item) => (
              <label
                key={item.id}
                className="check"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "8px 12px", marginBottom: 6, borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${intake.docs[item.id] ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.06)"}`,
                  background: intake.docs[item.id] ? "rgba(52,211,153,0.04)" : "rgba(255,255,255,0.08)",
                  color: intake.docs[item.id] ? "#34d399" : "#b0b8c8",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!intake.docs[item.id]}
                  onChange={() => toggleDoc(item.id)}
                  style={{ margin: "2px 0 0 0", flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>{item.label}</span>
              </label>
            ))}

            {phase4Complete && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: 14, textAlign: "center", padding: "16px",
                  background: `${ACCENT_DIM}0.04)`, border: `1px solid ${ACCENT_DIM}0.15)`,
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>
                  Copilot Complete — Ready to Proceed
                </div>
                <div style={{ fontSize: 12, color: "#6b7a8d", marginTop: 6 }}>
                  Determination: {determination.label}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
      </>)}
    </section>
  );
});

export default MedSupCopilot;
