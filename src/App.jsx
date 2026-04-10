import { lazy, Suspense, useState, useEffect, useRef, startTransition } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import { ScriptProvider, useScript } from "./context/ScriptContext";
import { MedSupProvider, useMedSup } from "./context/MedSupContext";
import { useLiveCall } from "./context/LiveCallContext";
import { SignedIn, SignedOut, SignIn, useUser, useClerk } from "@clerk/clerk-react";
import { ChevronDown, Menu, Shuffle, X } from "lucide-react";
import DevotedPopupManager from "./components/ancillary/DevotedPopupManager";
import { wallpapers } from "./config/wallpapers";

const loadScriptFlow = () => import("./components/ScriptFlow");
const loadMedSupFlow = () => import("./components/MedSupFlow");
const loadMedSupAiCopilot = () => import("./components/MedSupAiCopilot");
const loadACAScript = () => import("./flows/aca/ACAScript");
const loadU65Script = () => import("./flows/u65/U65Script");
const loadAgentTools = () => import("./components/AgentTools");
const loadSEPLookup = () => import("./components/SEPLookup");
const loadSessionSummary = () => import("./components/SessionSummary");
const loadTranscriptUpload = () => import("./components/TranscriptUpload");
const loadCarrierRef = () => import("./components/CarrierRef");
const loadCallHistory = () => import("./components/CallHistory");
const loadDailyVerse = () => import("./components/DailyVerse");
const loadACAIntelligence = () => import("./components/ACAIntelligence");
const loadComplianceDashboard = () => import("./components/ComplianceDashboard");
const loadLeaderboard = () => import("./components/Leaderboard");

const ScriptFlow = lazy(loadScriptFlow);
const MedSupFlow = lazy(loadMedSupFlow);
const MedSupAiCopilot = lazy(loadMedSupAiCopilot);
const ACAScript = lazy(loadACAScript);
const U65Script = lazy(loadU65Script);
const AgentTools = lazy(loadAgentTools);
const SEPLookup = lazy(loadSEPLookup);
const SessionSummary = lazy(loadSessionSummary);
const TranscriptUpload = lazy(loadTranscriptUpload);
const CarrierRef = lazy(loadCarrierRef);
const CallHistory = lazy(loadCallHistory);
const DailyVerse = lazy(loadDailyVerse);
const ACAIntelligence = lazy(loadACAIntelligence);
const ComplianceDashboard = lazy(loadComplianceDashboard);
const Leaderboard = lazy(loadLeaderboard);
const COMPLIANCE_HUB_TAB_IDS = new Set(["complianceHub", "history", "upload", "review"]);
const AGENT_TOOLS_TAB_IDS = new Set(["tools", "objections", "decisionTree"]);
const BACKGROUND_SELECTION_STORAGE_KEY = "enrollgen_background_selection_v4";

function modeSupportsAgentTools(mode) {
  return mode === "ma" || mode === "aca";
}

/* ── Daily Verse accordion wrapper for main flow ── */
const LOGIN_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const FLOWS = [
  { id: "ma",     label: "MA",     color: "#E8002D", rgb: "232,0,45"   },
  { id: "aca",    label: "ACA",    color: "#EAB308", rgb: "234,179,8"  },
  { id: "medsup", label: "SUP",    color: "#00D166", rgb: "0,209,102"  },
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

function getTabDisplayStyle(isActive) {
  return { display: isActive ? "block" : "none" };
}

function SessionSummarySlot() {
  const { state } = useScript();

  if (!state.enrollOk) {
    return null;
  }

  return (
    <LazyPanel>
      <SessionSummary />
    </LazyPanel>
  );
}

function MainFlowComplianceHubTab() {
  const { liveCall } = useLiveCall();

  return (
    <LazyPanel>
      <ComplianceDashboard
        transcript={liveCall.transcript}
        customerTranscript={liveCall.customerTranscript}
        mergedTranscript={liveCall.mergedTranscript}
        result={liveCall.complianceResult}
        forceExpanded
        forceShowDetail
        forceExpandAllCategories
      />
    </LazyPanel>
  );
}

function MedSupScriptWorkspace() {
  const { state } = useMedSup();
  const [transcript, setTranscript] = useState("");
  const flowShellRef = useRef(null);
  const flowMainRef = useRef(null);

  return (
    <>
      <MedSupAiCopilot onTranscriptChange={setTranscript} />
      <div className="flow-shell" ref={flowShellRef}>
        <DevotedPopupManager
          callStarted={state.callStarted}
          transcript={transcript}
          anchorRef={flowMainRef}
        />
        <div className="flow-main" ref={flowMainRef}>
          <MedSupFlow />
        </div>
      </div>
    </>
  );
}

function loadBackgroundSelection() {
  const fallbackId = wallpapers[0]?.id || "none";

  if (typeof window === "undefined") {
    return fallbackId;
  }

  try {
    const storedId = window.localStorage.getItem(BACKGROUND_SELECTION_STORAGE_KEY);
    if (wallpapers.some((wallpaper) => wallpaper.id === storedId)) {
      return storedId;
    }
  } catch {
    // Ignore storage failures and use the default background.
  }

  return fallbackId;
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
  const [backgroundSelection, setBackgroundSelection] = useState(loadBackgroundSelection);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const sidebarRef = useRef(null);
  const selectedWallpaper =
    wallpapers.find((wallpaper) => wallpaper.id === backgroundSelection) || wallpapers[0];
  const wallpaperChoices = wallpapers.filter((wallpaper) => wallpaper.url);

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

  useEffect(() => {
    document.body.dataset.bgMode = selectedWallpaper?.url ? "wallpaper" : "clean";

    try {
      window.localStorage.setItem(
        BACKGROUND_SELECTION_STORAGE_KEY,
        selectedWallpaper?.id || wallpapers[0]?.id || "none"
      );
    } catch {
      // Ignore storage failures; the UI still works for the current session.
    }

    return () => {
      delete document.body.dataset.bgMode;
    };
  }, [selectedWallpaper?.id, selectedWallpaper?.url]);

  const activeTab = COMPLIANCE_HUB_TAB_IDS.has(tab)
    ? "complianceHub"
    : AGENT_TOOLS_TAB_IDS.has(tab)
      ? "tools"
      : tab;

  const preloadScriptForMode = (targetMode) => {
    if (targetMode === "ma") {
      loadScriptFlow();
      return;
    }
    if (targetMode === "medsup") {
      loadMedSupFlow();
      loadMedSupAiCopilot();
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
      if (targetMode === "ma") {
        loadComplianceDashboard();
      } else {
        loadCallHistory();
        if (targetMode === "medsup") loadTranscriptUpload();
      }
      return;
    }
    if (AGENT_TOOLS_TAB_IDS.has(targetTab) && modeSupportsAgentTools(targetMode)) {
      loadAgentTools();
      return;
    }
    if (targetTab === "script") {
      preloadScriptForMode(targetMode);
      return;
    }
    if (targetTab === "tools" && modeSupportsAgentTools(targetMode)) {
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
    if (targetTab === "leaderboard") {
      loadLeaderboard();
      return;
    }
    if (targetTab === "verse") {
      loadDailyVerse();
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

  const selectBackground = (nextSelection) => {
    setBackgroundSelection(nextSelection);
    setWallpaperPickerOpen(false);
  };

  const selectRandomWallpaper = () => {
    const candidates = wallpaperChoices.filter(
      (wallpaper) => wallpaper.id !== selectedWallpaper?.id
    );
    const source = candidates.length ? candidates : wallpaperChoices;
    if (!source.length) return;
    const randomWallpaper =
      source[Math.floor(Math.random() * source.length)];
    setBackgroundSelection(randomWallpaper.id);
  };

  return (
    <>
      <div className="viewport-bg">
        {selectedWallpaper?.url ? (
          <img
            key={selectedWallpaper.id}
            className="viewport-wallpaper-image"
            src={selectedWallpaper.url}
            alt=""
            aria-hidden="true"
            decoding="async"
          />
        ) : null}
      </div>
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
            {modeSupportsAgentTools(mode) && (
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
            <button
              className={`sidebar-tab${activeTab === "leaderboard" ? " active" : ""}`}
              onClick={() => { handleTabChange("leaderboard"); setSidebarOpen(false); }}
              onMouseEnter={() => preloadTab("leaderboard")}
              data-tab-label="Board"
            >
              <span className="sidebar-tab-text">Leaderboard</span>
            </button>
            <button
              className={`sidebar-tab${activeTab === "verse" ? " active" : ""}`}
              onClick={() => { handleTabChange("verse"); setSidebarOpen(false); }}
              onMouseEnter={() => preloadTab("verse")}
              data-tab-label="Verse"
            >
              <span className="sidebar-tab-text">Daily Verse</span>
            </button>
          </nav>

          <div className="sidebar-utility-stack">
            <div className={`sidebar-wallpaper-selector${wallpaperPickerOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="sidebar-wallpaper-toggle"
                onClick={() => setWallpaperPickerOpen((open) => !open)}
                aria-expanded={wallpaperPickerOpen}
                aria-controls="sidebar-wallpaper-panel"
              >
                <div className="sidebar-wallpaper-selector-copy">
                  <span className="sidebar-wallpaper-selector-label">Wallpaper</span>
                  <span className="sidebar-wallpaper-selector-active">
                    {selectedWallpaper?.label || "Default"}
                  </span>
                </div>
                <span className="sidebar-wallpaper-toggle-icon" aria-hidden="true">
                  <ChevronDown size={14} strokeWidth={2.2} />
                </span>
              </button>

              {wallpaperPickerOpen && (
                <div className="sidebar-wallpaper-panel" id="sidebar-wallpaper-panel">
                  <div className="sidebar-wallpaper-panel-header">
                    <span className="sidebar-wallpaper-panel-hint">
                      Pick a background
                    </span>
                    <button
                      type="button"
                      className="sidebar-wallpaper-random"
                      onClick={selectRandomWallpaper}
                      aria-label="Pick a random wallpaper"
                      title="Random wallpaper"
                    >
                      <Shuffle size={12} strokeWidth={2.1} />
                    </button>
                  </div>

                  <div className="sidebar-wallpaper-grid">
                    {wallpapers.map((wallpaper) => (
                      <button
                        key={wallpaper.id}
                        type="button"
                        className={`sidebar-wallpaper-tile${
                          backgroundSelection === wallpaper.id ? " is-active" : ""
                        }`}
                        onClick={() => selectBackground(wallpaper.id)}
                        aria-label={`Use the ${wallpaper.label} wallpaper`}
                        title={wallpaper.label}
                      >
                        {wallpaper.thumbUrl ? (
                          <img
                            className="sidebar-wallpaper-tile-image"
                            src={wallpaper.thumbUrl}
                            alt=""
                            aria-hidden="true"
                            decoding="async"
                          />
                        ) : (
                          <span className="sidebar-wallpaper-tile-none" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!LOGIN_DISABLED && (
              <div className="sidebar-profile">
                <ProfileBar />
              </div>
            )}
          </div>
        </aside>

        {/* ── CENTER CONTENT ── */}
        <main className="app-center">
          {mode === "ma" && (
            <ScriptProvider>
              <div
                className="main-script-layout"
                style={getTabDisplayStyle(activeTab === "script")}
              >
                <div className="main-script-primary">
                  <LazyPanel>
                    <ScriptFlow />
                  </LazyPanel>
                  <SessionSummarySlot />
                </div>
              </div>
              <div style={getTabDisplayStyle(activeTab === "complianceHub")}>
                <MainFlowComplianceHubTab />
              </div>
              <div style={getTabDisplayStyle(activeTab === "tools")}>
                <LazyPanel>
                  <AgentTools />
                </LazyPanel>
              </div>
              <div style={getTabDisplayStyle(activeTab === "sepTool")}>
                <LazyPanel>
                  <SEPLookup />
                </LazyPanel>
                <LazyPanel>
                  <CarrierRef />
                </LazyPanel>
              </div>
            </ScriptProvider>
          )}

          {mode === "medsup" && (
            <MedSupProvider>
              <div style={getTabDisplayStyle(activeTab === "script")}>
                <LazyPanel>
                  <MedSupScriptWorkspace />
                </LazyPanel>
              </div>
              <div style={getTabDisplayStyle(activeTab === "complianceHub")}>
                <LazyPanel>
                  <CallHistory />
                </LazyPanel>
                <LazyPanel>
                  <TranscriptUpload />
                </LazyPanel>
              </div>
            </MedSupProvider>
          )}

          {mode === "aca" && (
            <>
              <div style={getTabDisplayStyle(activeTab === "script")}>
                <LazyPanel>
                  <ACAScript />
                </LazyPanel>
              </div>
              <div style={getTabDisplayStyle(activeTab === "tools")}>
                <LazyPanel>
                  <AgentTools />
                </LazyPanel>
              </div>
              <div style={getTabDisplayStyle(activeTab === "acaIntel")}>
                <LazyPanel>
                  <ACAIntelligence />
                </LazyPanel>
              </div>
              <div style={getTabDisplayStyle(activeTab === "complianceHub")}>
                <LazyPanel>
                  <CallHistory />
                </LazyPanel>
              </div>
            </>
          )}

          {mode === "u65" && (
            <>
              <div style={getTabDisplayStyle(activeTab === "script")}>
                <LazyPanel>
                  <U65Script />
                </LazyPanel>
              </div>
              <div style={getTabDisplayStyle(activeTab === "complianceHub")}>
                <LazyPanel>
                  <CallHistory />
                </LazyPanel>
              </div>
            </>
          )}

          {mode !== "ma" && (
            <div style={getTabDisplayStyle(activeTab === "carrierRef")}>
              <LazyPanel>
                <CarrierRef />
              </LazyPanel>
            </div>
          )}

          <div style={getTabDisplayStyle(activeTab === "leaderboard")}>
            <LazyPanel>
              <Leaderboard />
            </LazyPanel>
          </div>

          <div style={getTabDisplayStyle(activeTab === "verse")}>
            <LazyPanel>
              <DailyVerse />
            </LazyPanel>
          </div>
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
