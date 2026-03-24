import { lazy, Suspense, useState, useEffect, useRef, useCallback, startTransition } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import { ScriptProvider } from "./context/ScriptContext";
import { MedSupProvider } from "./context/MedSupContext";
import { NGHS_SEP_SCRIPT } from "./context/SEPScript";
import { SignedIn, SignedOut, SignIn, useUser, useClerk } from "@clerk/clerk-react";
import { BookOpen, Menu, X } from "lucide-react";

const loadScriptFlow = () => import("./components/ScriptFlow");
const loadMedSupFlow = () => import("./components/MedSupFlow");
const loadMedSupCopilot = () => import("./components/MedSupCopilot");
const loadMedSupAiCopilot = () => import("./components/MedSupAiCopilot");
const loadACAScript = () => import("./flows/aca/ACAScript");
const loadU65Script = () => import("./flows/u65/U65Script");
const loadAgentTools = () => import("./components/AgentTools");
const loadSEPLookup = () => import("./components/SEPLookup");
const loadSessionSummary = () => import("./components/SessionSummary");
const loadReviewWorkspace = () => import("./components/ReviewWorkspace");
const loadTranscriptUpload = () => import("./components/TranscriptUpload");
const loadCarrierRef = () => import("./components/CarrierRef");
const loadCallHistory = () => import("./components/CallHistory");
const loadDailyVerse = () => import("./components/DailyVerse");
const loadACAIntelligence = () => import("./components/ACAIntelligence");
const loadComplianceDashboard = () => import("./components/ComplianceDashboard");

const ScriptFlow = lazy(loadScriptFlow);
const MedSupFlow = lazy(loadMedSupFlow);
const MedSupCopilot = lazy(loadMedSupCopilot);
const MedSupAiCopilot = lazy(loadMedSupAiCopilot);
const ACAScript = lazy(loadACAScript);
const U65Script = lazy(loadU65Script);
const AgentTools = lazy(loadAgentTools);
const SEPLookup = lazy(loadSEPLookup);
const SessionSummary = lazy(loadSessionSummary);
const ReviewWorkspace = lazy(loadReviewWorkspace);
const TranscriptUpload = lazy(loadTranscriptUpload);
const CarrierRef = lazy(loadCarrierRef);
const CallHistory = lazy(loadCallHistory);
const DailyVerse = lazy(loadDailyVerse);
const ACAIntelligence = lazy(loadACAIntelligence);
const ComplianceDashboard = lazy(loadComplianceDashboard);
const COMPLIANCE_HUB_TAB_IDS = new Set(["complianceHub", "history", "upload", "review"]);
const AGENT_TOOLS_TAB_IDS = new Set(["tools", "objections", "decisionTree"]);

/* ── Daily Verse accordion wrapper for main flow ── */
function DailyVerseAccordion() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10, marginBottom: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button
        onClick={() => setOpen((p) => !p)}
        title="Daily Scripture"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: open
            ? "linear-gradient(145deg, rgba(157,0,255,0.12) 0%, rgba(42,42,50,0.95) 100%)"
            : "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
          border: open ? "1px solid rgba(157,0,255,0.25)" : "1px solid rgba(255,255,255,0.07)",
          borderRadius: 50, width: 36, height: 36, cursor: "pointer",
          boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
          transition: "all 0.15s",
        }}
      >
        <BookOpen size={16} strokeWidth={2} style={{ color: open ? "#B84DFF" : "#7a7f8e" }} />
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <Suspense fallback={<div style={{ color: "#8fa4bc", fontSize: "0.9rem", padding: 12 }}>Loading…</div>}>
            <DailyVerse />
          </Suspense>
        </div>
      )}
    </div>
  );
}

const LOGIN_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const SUNFIRE_SEP_LABELS = [
  "Weather Related Emergency or Major Disaster Special Enrollment Period",
  "Loss of Employer or Union Coverage Special Enrollment Period",
  "Permanent Move Outside of Plan Service Area Special Enrollment Period",
  "5 Star Plan Special Enrollment Period",
  "Failure to Provide Required Notices or Accessible Materials Special Enrollment Period",
  "Disenrollment to Enroll in or Maintain Other Creditable Coverage Special Enrollment Period",
  "Auto Assignment by CMS or State Medicaid Agency Special Enrollment Period",
  "Release from Incarceration Special Enrollment Period",
  "Becoming Lawfully Present in the United States Special Enrollment Period",
  "Loss of Creditable Prescription Drug Coverage Special Enrollment Period",
  "Plan Rated Below 3 Stars for Three Consecutive Years Special Enrollment Period",
  "Institutionalized Individual Special Enrollment Period",
  "Move Out of an Institution Special Enrollment Period",
  "Change in Medicaid Eligibility Status Special Enrollment Period",
  "Plan Non Renewal Special Enrollment Period",
  "Gain, Loss, or Change in Low Income Subsidy Status Special Enrollment Period",
  "Exceptional or Other Special Circumstances Special Enrollment Period",
  "Enrollment in the Program of All Inclusive Care for the Elderly Special Enrollment Period",
  "Plan Contract Termination or State Receivership Special Enrollment Period",
  "Return to the United States After Living Abroad Special Enrollment Period",
  "Loss of Special Needs Plan Eligibility Special Enrollment Period",
  "Newly Eligible for Medicare Due to Part A and or Part B Effective Date Special Enrollment Period",
];

function normalizeSepText(value) {
  return value
    .toLowerCase()
    .replace(/special enrollment period/g, "")
    .replace(/program of all inclusive care for the elderly/g, "pace")
    .replace(/low income subsidy/g, "lis")
    .replace(/and or/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getAdditionalSunfireSeps() {
  const existing = new Set(
    NGHS_SEP_SCRIPT.sections.flatMap((section) =>
      section.items.map((item) => normalizeSepText(item.ask))
    )
  );

  return SUNFIRE_SEP_LABELS.filter((label) => {
    const normalized = normalizeSepText(label);
    return !Array.from(existing).some(
      (entry) =>
        entry.includes(normalized) ||
        normalized.includes(entry) ||
        (normalized.includes("move outside of plan service area") &&
          entry.includes("move")) ||
        (normalized.includes("weather related emergency") &&
          entry.includes("exceptional circumstances")) ||
        (normalized.includes("institutionalized individual") &&
          entry.includes("reside in or have you recently been discharged")) ||
        (normalized.includes("move out of an institution") &&
          entry.includes("recently been discharged")) ||
        (normalized.includes("change in medicaid eligibility status") &&
          entry.includes("lost medicaid")) ||
        (normalized.includes("gain loss or change in lis status") &&
          entry.includes("extra help")) ||
        (normalized.includes("return to the united states after living abroad") &&
          entry.includes("move back to the u s")) ||
        (normalized.includes("release from incarceration") &&
          entry.includes("released from jail")) ||
        (normalized.includes("loss of employer or union coverage") &&
          entry.includes("lost employer union or cobra coverage")) ||
        (normalized.includes("loss of creditable prescription drug coverage") &&
          entry.includes("lost other creditable drug coverage")) ||
        (normalized.includes("5 star plan") && entry.includes("five star")) ||
        (normalized.includes("plan rated below 3 stars") &&
          entry.includes("low performing plan")) ||
        (normalized.includes("plan contract termination or state receivership") &&
          entry.includes("sanctioned by medicare taken over by the state or had its contract terminated or non renewed")) ||
        (normalized.includes("enrollment in pace") && entry.includes("enroll in a pace")) ||
        (normalized.includes("disenrollment to enroll in or maintain other creditable coverage") &&
          entry.includes("va tricare")) ||
        (normalized.includes("loss of special needs plan eligibility") &&
          (entry.includes("dual eligible") || entry.includes("chronic care")))
    );
  });
}

function getSepOfficialExplanation(label) {
  const normalized = normalizeSepText(label);

  if (normalized.includes("weather related emergency")) {
    return "Official SEP: For beneficiaries impacted by a CMS/FEMA-declared emergency or major disaster who could not make a valid election, a time-limited SEP allows one MA or Part D enrollment change tied to the disaster period.";
  }
  if (normalized.includes("loss of employer or union coverage")) {
    return "Official SEP: When creditable employer or union coverage ends (or is reduced), the beneficiary may make one MA or Part D election around the loss-of-coverage window.";
  }
  if (normalized.includes("move outside of plan service area")) {
    return "Official SEP: A permanent move out of the current plan service area allows the beneficiary to switch/join MA or Part D plans available at the new address.";
  }
  if (normalized.includes("5 star plan")) {
    return "Official SEP: One time per year, a beneficiary may switch to an available 5-star MA, Cost, or Part D plan during the CMS 5-star SEP window.";
  }
  if (normalized.includes("required notices or accessible materials")) {
    return "Official SEP: If a plan fails to provide required notices or accessible communications in a compliant way, CMS may grant an SEP to make a corrective election.";
  }
  if (normalized.includes("disenrollment to enroll in or maintain other creditable coverage")) {
    return "Official SEP: Beneficiaries may disenroll from MA/Part D to enroll in or keep other creditable coverage, including certain employer, union, VA, or TRICARE-related coverage.";
  }
  if (normalized.includes("auto assignment by cms or state medicaid agency")) {
    return "Official SEP: CMS/state auto-assignment actions for dual/LIS beneficiaries create a limited SEP to choose a more appropriate MA or Part D plan.";
  }
  if (normalized.includes("release from incarceration")) {
    return "Official SEP: Individuals released from incarceration receive an SEP to enroll in coverage options available in their service area.";
  }
  if (normalized.includes("becoming lawfully present in the united states")) {
    return "Official SEP: Newly lawfully present individuals can use an SEP to join MA or Part D once eligibility and lawful presence criteria are met.";
  }
  if (normalized.includes("loss of creditable prescription drug coverage")) {
    return "Official SEP: Loss of other creditable prescription drug coverage triggers an SEP to join a Part D or MA-PD plan.";
  }
  if (normalized.includes("plan rated below 3 stars")) {
    return "Official SEP: When a plan is identified by CMS as low-performing, affected members may receive an SEP to move to a higher-quality plan option.";
  }
  if (normalized.includes("institutionalized individual")) {
    return "Official SEP: Beneficiaries who move into or reside in an institution (for example, nursing facility) may make monthly MA/Part D election changes while institutionalized.";
  }
  if (normalized.includes("move out of an institution")) {
    return "Official SEP: Leaving an institution creates a limited SEP to change MA or Part D elections after discharge.";
  }
  if (normalized.includes("change in medicaid eligibility status")) {
    return "Official SEP: Gaining, losing, or changing Medicaid eligibility creates SEP rights for MA/Part D election changes.";
  }
  if (normalized.includes("plan non renewal")) {
    return "Official SEP: If a current plan is non-renewed, enrollees receive SEP rights to select replacement MA/Part D coverage.";
  }
  if (normalized.includes("gain loss or change in lis status")) {
    return "Official SEP: Gaining, losing, or changing Low-Income Subsidy (LIS/Extra Help) status may trigger SEP election opportunities.";
  }
  if (normalized.includes("exceptional or other special circumstances")) {
    return "Official SEP: CMS may authorize an SEP case-by-case for exceptional conditions when normal election rules would otherwise create harm.";
  }
  if (normalized.includes("enrollment in the pace")) {
    return "Official SEP: Enrollment into PACE generally allows disenrollment from MA/Part D to coordinate coverage under PACE rules.";
  }
  if (normalized.includes("plan contract termination or state receivership")) {
    return "Official SEP: Contract termination, state receivership, or similar plan-level failure creates SEP rights so members can transition coverage.";
  }
  if (normalized.includes("return to the united states after living abroad")) {
    return "Official SEP: Returning to live in the U.S. after living abroad may trigger SEP eligibility for MA/Part D enrollment.";
  }
  if (normalized.includes("loss of special needs plan eligibility")) {
    return "Official SEP: When a beneficiary loses D-SNP/C-SNP/I-SNP eligibility, CMS provides an SEP to move into an appropriate non-SNP option.";
  }
  if (normalized.includes("newly eligible for medicare due to part a and part b effective date")) {
    return "Official SEP: Newly Medicare-eligible individuals can use initial election rights aligned to their Part A/Part B effective dates.";
  }

  return "Official SEP: Verify eligibility trigger date, allowable election type, and enrollment window before submitting.";
}

/* ─── FlowSelector — 4-circle indicator panel ────────────────────────────── */
const FLOWS = [
  { id: "ma",     label: "MA",     color: "#E8002D", rgb: "232,0,45"   },
  { id: "medsup", label: "SUP",    color: "#00D166", rgb: "0,209,102"  },
  { id: "aca",    label: "ACA",    color: "#EAB308", rgb: "234,179,8"  },
  { id: "u65",    label: "U65",    color: "#a855f7", rgb: "168,85,247" },
];

function FlowSelector({ mode, onChange }) {
  return (
    <>
      <style>{`
        @keyframes flow-pulse {
          0%   { box-shadow: 0 0 6px 2px var(--pulse-color); }
          50%  { box-shadow: 0 0 14px 5px var(--pulse-color); }
          100% { box-shadow: 0 0 6px 2px var(--pulse-color); }
        }
        .flow-circle-active {
          animation: flow-pulse 2.4s ease-in-out infinite;
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "linear-gradient(180deg, #141414 0%, #0E0E0E 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
          padding: "8px 16px",
          userSelect: "none",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {FLOWS.map((flow) => {
          const active = mode === flow.id;
          return (
            <button
              key={flow.id}
              onClick={() => onChange(flow.id)}
              title={flow.id === "ma" ? "Medicare Advantage" : flow.id === "medsup" ? "Medicare Supplement" : flow.id === "aca" ? "ACA On-Exchange" : "U65 Off-Exchange"}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "var(--font-body)",
              }}
            >
              <div
                className={active ? "flow-circle-active" : ""}
                style={{
                  "--pulse-color": `rgba(${flow.rgb},0.55)`,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: active ? flow.color : `rgba(${flow.rgb},0.18)`,
                  border: `1px solid ${active ? flow.color : `rgba(${flow.rgb},0.25)`}`,
                  boxShadow: active ? `0 0 8px 2px rgba(${flow.rgb},0.5)` : "none",
                  transition: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  color: active ? flow.color : `rgba(${flow.rgb},0.35)`,
                  transition: "color 0.2s ease",
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}
              >
                {flow.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function SepScriptSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [openAdditionalSep, setOpenAdditionalSep] = useState(null);
  const additionalSunfireSeps = getAdditionalSunfireSeps();

  return (
    <>
      <button
        type="button"
        className="sep-sidebar-launcher"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span>SEP Script</span>
        <span className="sep-sidebar-chevron">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <aside className="sep-sidebar-card">
          <div className="sep-sidebar-header">
            <div>
              <div className="sep-sidebar-eyebrow">Quick Reference</div>
              <h3 className="sep-sidebar-title">SEP Script</h3>
            </div>
            <button
              type="button"
              className="sep-sidebar-close"
              onClick={() => setIsOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="sep-sidebar-scroll">
            {additionalSunfireSeps.length > 0 && (
              <div className="sep-sidebar-group">
                <button
                  type="button"
                  className="sep-sidebar-toggle"
                  onClick={() =>
                    setOpenSection(
                      openSection === "sunfire-seps" ? null : "sunfire-seps"
                    )
                  }
                >
                  <span>SEPs</span>
                  <span className="sep-sidebar-chevron">
                    {openSection === "sunfire-seps" ? "−" : "+"}
                  </span>
                </button>

                {openSection === "sunfire-seps" && (
                  <div className="sep-sidebar-panel">
                    {additionalSunfireSeps.map((label) => (
                      <div key={label} className="sep-sidebar-item">
                        <button
                          type="button"
                          className="sep-sidebar-item-toggle"
                          onClick={() =>
                            setOpenAdditionalSep((prev) =>
                              prev === label ? null : label
                            )
                          }
                        >
                          <span className="sep-sidebar-ask">{label}</span>
                          <span className="sep-sidebar-chevron">
                            {openAdditionalSep === label ? "−" : "+"}
                          </span>
                        </button>
                        {openAdditionalSep === label && (
                          <div className="sep-sidebar-window">
                            {getSepOfficialExplanation(label)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {NGHS_SEP_SCRIPT.sections.map((section) => {
              const sectionOpen = openSection === section.id;
              return (
                <div key={section.id} className="sep-sidebar-group">
                  <button
                    type="button"
                    className="sep-sidebar-toggle"
                    onClick={() =>
                      setOpenSection(sectionOpen ? null : section.id)
                    }
                  >
                    <span>{section.name}</span>
                    <span className="sep-sidebar-chevron">
                      {sectionOpen ? "−" : "+"}
                    </span>
                  </button>

                  {sectionOpen && (
                    <div className="sep-sidebar-panel">
                      {section.items.map((item) => (
                        <div key={item.id} className="sep-sidebar-item">
                          <div className="sep-sidebar-ask">{item.ask}</div>
                          <div className="sep-sidebar-window">{item.window}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </>
  );
}

function LazyPanel({ children }) {
  return (
    <Suspense
      fallback={
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ color: "#8fa4bc", fontSize: "0.9rem" }}>Loading…</div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function AppTabButton({ activeTab, tabId, onSelect, onPreload, children }) {
  return (
    <button
      className={activeTab === tabId ? "tab active" : "tab"}
      onClick={() => onSelect(tabId)}
      onMouseEnter={onPreload}
      onFocus={onPreload}
    >
      {children}
    </button>
  );
}

/* ─── ProfileBar ─────────────────────────────────────────────────────────── */
function ProfileBar() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded || !user) return null;

  const displayName =
    user.publicMetadata?.agentName || user.fullName || user.firstName || "Agent";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: "linear-gradient(180deg, #141414 0%, #0E0E0E 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "8px 16px",
        userSelect: "none",
        boxShadow:
          "inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <img
        src={user.imageUrl}
        alt=""
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 600,
          letterSpacing: "0.05em",
          color: "#c8d6e5",
        }}
      >
        {displayName}
      </span>
      <button
        onClick={() => signOut()}
        style={{
          background: "none",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          color: "#556677",
          fontSize: 9,
          fontFamily: "'Barlow Condensed', sans-serif",
          padding: "2px 7px",
          cursor: "pointer",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

/* ─── AppContent (the actual app) ────────────────────────────────────────── */
function AppContent() {
  const [tab, setTab] = useState("script");
  const [mode, setMode] = useState("ma");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sidebarOpen]);

  // Close sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [sidebarOpen]);
  const activeTab = COMPLIANCE_HUB_TAB_IDS.has(tab)
    ? "complianceHub"
    : AGENT_TOOLS_TAB_IDS.has(tab)
      ? "tools"
      : tab;

  const preloadScriptForMode = (targetMode) => {
    if (targetMode === "ma") {
      loadScriptFlow();
      loadSessionSummary();
      loadDailyVerse();
      return;
    }
    if (targetMode === "medsup") {
      loadMedSupFlow();
      loadMedSupAiCopilot();
      loadMedSupCopilot();
      return;
    }
    if (targetMode === "aca") {
      loadACAScript();
      return;
    }
    if (targetMode === "u65") {
      loadU65Script();
    }
  };

  const preloadTab = (targetTab, targetMode = mode) => {
    if (COMPLIANCE_HUB_TAB_IDS.has(targetTab)) {
      loadCallHistory();
      if (targetMode === "ma" || targetMode === "medsup") {
        loadTranscriptUpload();
      }
      if (targetMode === "ma") {
        loadReviewWorkspace();
      }
      return;
    }
    if (AGENT_TOOLS_TAB_IDS.has(targetTab) && targetMode === "ma") {
      loadAgentTools();
      return;
    }
    if (targetTab === "script") {
      preloadScriptForMode(targetMode);
      return;
    }
    if (targetTab === "tools" && targetMode === "ma") {
      loadAgentTools();
      return;
    }
    if (targetTab === "sepTool" && targetMode === "ma") {
      loadSEPLookup();
      loadCarrierRef();
      return;
    }
    if (targetTab === "carrierRef") {
      if (targetMode === "ma") {
        loadSEPLookup();
        loadCarrierRef();
        return;
      }
      loadCarrierRef();
      return;
    }
    if (targetTab === "acaIntel") {
      loadACAIntelligence();
      return;
    }
  };

  const handleModeChange = (newMode) => {
    preloadScriptForMode(newMode);
    startTransition(() => {
      setMode(newMode);
      setTab("script");
    });
  };

  const handleTabChange = (nextTab) => {
    const normalizedTab = COMPLIANCE_HUB_TAB_IDS.has(nextTab)
      ? "complianceHub"
      : AGENT_TOOLS_TAB_IDS.has(nextTab)
        ? "tools"
        : nextTab === "carrierRef" && mode === "ma"
          ? "sepTool"
        : nextTab;
    preloadTab(normalizedTab);
    startTransition(() => {
      setTab(normalizedTab);
    });
  };

  const handleLogoClick = () => {
    window.location.reload();
  };

  return (
    <>
      <div className="viewport-bg" />
      <div className="app-shell">
        {/* ── HAMBURGER BUTTON (visible <1024px) ── */}
        <button
          className="sidebar-hamburger"
          onClick={() => setSidebarOpen((p) => !p)}
          aria-label="Toggle navigation"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Scrim behind sidebar on mobile */}
        {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

        {/* ── LEFT SIDEBAR ── */}
        <aside ref={sidebarRef} className={`app-sidebar${sidebarOpen ? " mobile-open" : ""}`}>
          <div className="sidebar-top">
            <EnrollGenLogo
              width={150}
              className="sidebar-logo"
              style={{ margin: 0 }}
              onClick={handleLogoClick}
              title="Refresh and return to the main page"
            />

            <FlowSelector mode={mode} onChange={handleModeChange} />

          </div>

          <nav className="sidebar-nav">
            <button
              className={`sidebar-tab${activeTab === "script" ? " active" : ""}`}
              onClick={() => { handleTabChange("script"); setSidebarOpen(false); }}
              onMouseEnter={() => preloadTab("script")}
              data-tab-label="Script"
            >
              <span className="sidebar-tab-text">Script</span>
            </button>
            {mode === "ma" && (
              <button
                className={`sidebar-tab${activeTab === "tools" ? " active" : ""}`}
                onClick={() => { handleTabChange("tools"); setSidebarOpen(false); }}
                onMouseEnter={() => preloadTab("tools")}
                data-tab-label="Tools"
              >
                <span className="sidebar-tab-text">Agent Tools</span>
              </button>
            )}
            {mode === "ma" && (
              <button
                className={`sidebar-tab${activeTab === "sepTool" ? " active" : ""}`}
                onClick={() => { handleTabChange("sepTool"); setSidebarOpen(false); }}
                onMouseEnter={() => preloadTab("sepTool")}
                data-tab-label="Intel"
              >
                <span className="sidebar-tab-text">Intelligence</span>
              </button>
            )}
            {mode === "aca" && (
              <button
                className={`sidebar-tab${activeTab === "acaIntel" ? " active" : ""}`}
                onClick={() => { handleTabChange("acaIntel"); setSidebarOpen(false); }}
                onMouseEnter={() => preloadTab("acaIntel")}
                data-tab-label="ACA"
              >
                <span className="sidebar-tab-text">ACA Intelligence</span>
              </button>
            )}
            <button
              className={`sidebar-tab${activeTab === "complianceHub" ? " active" : ""}`}
              onClick={() => { handleTabChange("complianceHub"); setSidebarOpen(false); }}
              onMouseEnter={() => preloadTab("complianceHub")}
              data-tab-label="Comply"
            >
              <span className="sidebar-tab-text">Compliance Hub</span>
            </button>
          </nav>

          {!LOGIN_DISABLED && (
            <div className="sidebar-profile">
              <ProfileBar />
            </div>
          )}
        </aside>

        {/* ── CENTER CONTENT ── */}
        <main className="app-center">
          {mode === "ma" && (
            <ScriptProvider>
              {activeTab === "script" && (
                <>
                  <div className="main-script-layout">
                    <div className="main-script-primary">
                      <LazyPanel>
                        <ScriptFlow />
                      </LazyPanel>
                      <LazyPanel>
                        <SessionSummary />
                      </LazyPanel>
                      <DailyVerseAccordion />
                    </div>
                  </div>
                </>
              )}
              {activeTab === "complianceHub" && (
                <>
                  <LazyPanel>
                    <ComplianceDashboard />
                  </LazyPanel>
                  <LazyPanel>
                    <ReviewWorkspace />
                  </LazyPanel>
                  <LazyPanel>
                    <CallHistory />
                  </LazyPanel>
                  <LazyPanel>
                    <TranscriptUpload />
                  </LazyPanel>
                </>
              )}
              {activeTab === "tools" && (
                <LazyPanel>
                  <AgentTools />
                </LazyPanel>
              )}
              {activeTab === "sepTool" && (
                <>
                  <LazyPanel>
                    <SEPLookup />
                  </LazyPanel>
                  <LazyPanel>
                    <CarrierRef />
                  </LazyPanel>
                </>
              )}
            </ScriptProvider>
          )}

          {mode === "medsup" && (
            <MedSupProvider>
              {activeTab === "script" && (
                <LazyPanel>
                  <MedSupAiCopilot />
                  <MedSupCopilot />
                  <MedSupFlow />
                </LazyPanel>
              )}
              {activeTab === "complianceHub" && (
                <>
                  <LazyPanel>
                    <CallHistory />
                  </LazyPanel>
                  <LazyPanel>
                    <TranscriptUpload />
                  </LazyPanel>
                </>
              )}
            </MedSupProvider>
          )}

          {mode === "aca" && activeTab === "script" && (
            <LazyPanel>
              <ACAScript />
            </LazyPanel>
          )}

          {mode === "aca" && activeTab === "acaIntel" && (
            <LazyPanel>
              <ACAIntelligence />
            </LazyPanel>
          )}

          {mode === "u65" && activeTab === "script" && (
            <LazyPanel>
              <U65Script />
            </LazyPanel>
          )}

          {activeTab === "carrierRef" && mode !== "ma" && (
            <LazyPanel>
              <CarrierRef />
            </LazyPanel>
          )}

          {(mode === "aca" || mode === "u65") && activeTab === "complianceHub" && (
            <LazyPanel>
              <CallHistory />
            </LazyPanel>
          )}
        </main>
      </div>
    </>
  );
}

/* ─── App (with Clerk gate) ──────────────────────────────────────────────── */
export default function App() {
  if (LOGIN_DISABLED) {
    return <AppContent />;
  }

  return (
    <>
      <SignedOut>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            background: "#0c1017",
          }}
        >
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <AppContent />
      </SignedIn>
    </>
  );
}
