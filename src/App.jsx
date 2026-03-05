import { lazy, Suspense, useState } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import ScriptFlow from "./components/ScriptFlow";
import MedSupFlow from "./components/MedSupFlow";
import { ScriptProvider } from "./context/ScriptContext";
import { MedSupProvider } from "./context/MedSupContext";
import { NGHS_SEP_SCRIPT } from "./context/SEPScript";
import "./styles.css";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";

const AgentTools = lazy(() => import("./components/AgentTools"));
const SessionSummary = lazy(() => import("./components/SessionSummary"));
const ReviewWorkspace = lazy(() => import("./components/ReviewWorkspace"));
const TranscriptUpload = lazy(() => import("./components/TranscriptUpload"));

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

/* ─── ModeToggle ─────────────────────────────────────────────────────────── */
function ModeToggle({ mode, onChange }) {
  const isMS = mode === "medsup";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "6px 12px",
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: !isMS ? "#38bdf8" : "var(--text-muted)",
          transition: "color 0.25s ease",
          cursor: "pointer",
        }}
        onClick={() => onChange("ma")}
      >
        MA
      </span>

      <div
        onClick={() => onChange(isMS ? "ma" : "medsup")}
        role="switch"
        aria-checked={isMS}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(isMS ? "ma" : "medsup");
          }
        }}
        style={{
          position: "relative",
          width: 44,
          height: 24,
          background: isMS ? "rgba(251,191,36,0.15)" : "rgba(56,189,248,0.12)",
          border: `1px solid ${
            isMS ? "rgba(251,191,36,0.35)" : "rgba(56,189,248,0.3)"
          }`,
          borderRadius: 12,
          cursor: "pointer",
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: isMS ? 22 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: isMS ? "#fbbf24" : "#38bdf8",
            boxShadow: `0 0 8px ${
              isMS ? "rgba(251,191,36,0.5)" : "rgba(56,189,248,0.5)"
            }`,
            transition:
              "left 0.25s cubic-bezier(.34,1.56,.64,1), background 0.25s ease, box-shadow 0.25s ease",
          }}
        />
      </div>

      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: isMS ? "#fbbf24" : "var(--text-muted)",
          transition: "color 0.25s ease",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        onClick={() => onChange("medsup")}
      >
        MED SUP
      </span>
    </div>
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

/* ─── AppContent (the actual app) ────────────────────────────────────────── */
function AppContent() {
  const [tab, setTab] = useState("script");
  const [mode, setMode] = useState("ma");

  return (
    <>
      <div className="viewport-bg" />
      <div className="app-shell">
        <div className="app">
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 86,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 50,
              }}
            >
              <EnrollGenLogo
                width={350}
                className="app-logo"
                style={{ margin: 0 }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ModeToggle mode={mode} onChange={setMode} />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "3px 10px",
                borderRadius: 4,
                background:
                  mode === "medsup"
                    ? "rgba(251,191,36,0.08)"
                    : "rgba(56,189,248,0.08)",
                border: `1px solid ${
                  mode === "medsup"
                    ? "rgba(251,191,36,0.25)"
                    : "rgba(56,189,248,0.25)"
                }`,
                color: mode === "medsup" ? "#fbbf24" : "#38bdf8",
                transition: "all 0.25s ease",
              }}
            >
              INBOUND —{" "}
              {mode === "medsup" ? "MEDICARE SUPPLEMENT" : "MEDICARE ADVANTAGE"}
            </span>
          </div>

          <div className="tabs">
            <button
              className={tab === "script" ? "tab active" : "tab"}
              onClick={() => setTab("script")}
            >
              Script
            </button>
            <button
              className={tab === "tools" ? "tab active" : "tab"}
              onClick={() => setTab("tools")}
            >
              Agent Tools
            </button>
            <button
              className={tab === "upload" ? "tab active" : "tab"}
              onClick={() => setTab("upload")}
            >
              Upload Transcript
            </button>
            {mode === "ma" && (
              <button
                className={tab === "review" ? "tab active" : "tab"}
                onClick={() => setTab("review")}
              >
                Review
              </button>
            )}
          </div>

          {mode === "ma" && (
            <ScriptProvider>
              {tab === "script" && (
                <>
                  <SepScriptSidebar />
                  <div className="main-script-layout">
                    <div className="main-script-primary">
                      <ScriptFlow />
                      <LazyPanel>
                        <SessionSummary />
                      </LazyPanel>
                    </div>
                  </div>
                </>
              )}
              <div style={{ display: tab === "review" ? "block" : "none" }}>
                <LazyPanel>
                  <ReviewWorkspace />
                </LazyPanel>
              </div>
              <div style={{ display: tab === "tools" ? "block" : "none" }}>
                <LazyPanel>
                  <AgentTools />
                </LazyPanel>
              </div>
              <div style={{ display: tab === "upload" ? "block" : "none" }}>
                <LazyPanel>
                  <TranscriptUpload />
                </LazyPanel>
              </div>
            </ScriptProvider>
          )}

          {mode === "medsup" && (
            <MedSupProvider>
              {tab === "script" && <MedSupFlow />}
              <div style={{ display: tab === "tools" ? "block" : "none" }}>
                <LazyPanel>
                  <AgentTools />
                </LazyPanel>
              </div>
              <div style={{ display: tab === "upload" ? "block" : "none" }}>
                <LazyPanel>
                  <TranscriptUpload />
                </LazyPanel>
              </div>
            </MedSupProvider>
          )}
        </div>
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
