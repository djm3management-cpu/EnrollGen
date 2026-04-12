import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import { ScriptProvider, useScript } from "./context/ScriptContext";
import { MedSupProvider } from "./context/MedSupContext";
import { useLiveCall } from "./context/LiveCallContext";
import { SignedIn, SignedOut, SignIn, useClerk, useUser } from "@clerk/clerk-react";
import { ChevronDown, Shuffle, X } from "lucide-react";
import { wallpapers } from "./config/wallpapers";
import {
  LeftRail,
  LeftRailProvider,
  useLeftRailManager,
} from "./components/leftRail/LeftRailManager";
import SEPQualifier from "./components/leftRail/SEPQualifier";

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
const BACKGROUND_SELECTION_STORAGE_KEY = "enrollgen_background_selection_v4";
const LOGIN_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";

function modeSupportsAgentTools(mode) {
  return mode === "ma" || mode === "aca";
}

const FLOWS = [
  { id: "ma", label: "MA", color: "#E8002D", rgb: "232,0,45" },
  { id: "aca", label: "ACA", color: "#EAB308", rgb: "234,179,8" },
  { id: "medsup", label: "SUP", color: "#00D166", rgb: "0,209,102" },
  { id: "u65", label: "U65", color: "#a855f7", rgb: "168,85,247" },
];

function FlowSelector({ mode, onChange, compact = false }) {
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
          gap: compact ? 10 : 14,
          background: "linear-gradient(180deg, #141414 0%, #0E0E0E 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: compact ? 999 : 8,
          padding: compact ? "5px 10px" : "8px 16px",
          userSelect: "none",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)",
          flexShrink: 0,
        }}
      >
        {FLOWS.map((flow) => {
          const active = mode === flow.id;
          return (
            <button
              key={flow.id}
              onClick={() => onChange(flow.id)}
              title={
                flow.id === "ma"
                  ? "Medicare Advantage"
                  : flow.id === "medsup"
                    ? "Medicare Supplement"
                    : flow.id === "aca"
                      ? "ACA On-Exchange"
                      : "U65 Off-Exchange"
              }
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: compact ? 3 : 5,
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
                  width: compact ? 10 : 14,
                  height: compact ? 10 : 14,
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
                  fontSize: compact ? 8 : 9,
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
          <div style={{ color: "#8fa4bc", fontSize: "0.9rem" }}>Loading...</div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
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

function MainFlowComplianceHubPanel() {
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
  return (
    <>
      <MedSupAiCopilot onTranscriptChange={() => {}} />
      <div className="flow-shell">
        <div className="flow-main">
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

function ProfileChip() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded || !user) {
    return null;
  }

  const displayName =
    user.publicMetadata?.agentName || user.fullName || user.firstName || "Agent";

  return (
    <div className="top-bar-profile">
      <img src={user.imageUrl} alt="" className="top-bar-profile-avatar" />
      <span className="top-bar-profile-name">{displayName}</span>
      <button type="button" className="top-bar-profile-signout" onClick={() => signOut()}>
        Sign Out
      </button>
    </div>
  );
}

function getTabsForMode(mode) {
  const tabs = [{ id: "script", label: "Script" }];

  if (modeSupportsAgentTools(mode)) {
    tabs.push({ id: "tools", label: "Agent Tools" });
  }

  if (mode === "ma") {
    tabs.push({ id: "sepTool", label: "Intelligence" });
  }

  if (mode === "aca") {
    tabs.push({ id: "acaIntel", label: "ACA Intelligence" });
  }

  tabs.push({ id: "complianceHub", label: "Compliance Hub" });
  tabs.push({ id: "leaderboard", label: "Leaderboard" });
  tabs.push({ id: "verse", label: "Daily Verse" });

  return tabs;
}

function AppShell() {
  const [mode, setMode] = useState("ma");
  const [openPanel, setOpenPanel] = useState(null);
  const [backgroundSelection, setBackgroundSelection] = useState(loadBackgroundSelection);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const topBarRef = useRef(null);
  const overlayRef = useRef(null);
  const hasAutoOpenedSepRef = useRef(false);

  const {
    railWidth,
    hasLeftRailItem,
    showLeftRail,
    expandLeftRail,
    minimizeLeftRail,
    dismissLeftRail,
  } = useLeftRailManager();

  const selectedWallpaper =
    wallpapers.find((wallpaper) => wallpaper.id === backgroundSelection) || wallpapers[0];
  const wallpaperChoices = wallpapers.filter((wallpaper) => wallpaper.url);
  const navTabs = useMemo(() => getTabsForMode(mode), [mode]);

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

  useEffect(() => {
    if (mode !== "ma" && hasLeftRailItem("sep-qualifier")) {
      dismissLeftRail("sep-qualifier");
    }
  }, [dismissLeftRail, hasLeftRailItem, mode]);

  useEffect(() => {
    if (mode !== "ma" || hasAutoOpenedSepRef.current) {
      return;
    }

    hasAutoOpenedSepRef.current = true;
    showLeftRail({
      id: "sep-qualifier",
      priority: 3,
      title: "SEP QUALIFIER",
      shortLabel: "SEP QUALIFIER",
      color: "#e53e3e",
      component: (
        <SEPQualifier onMinimize={() => minimizeLeftRail("sep-qualifier")} />
      ),
    });
  }, [minimizeLeftRail, mode, showLeftRail]);

  useEffect(() => {
    if (!openPanel && !wallpaperPickerOpen) {
      return undefined;
    }

    const handleMouseDown = (event) => {
      const target = event.target;
      if (overlayRef.current?.contains(target) || topBarRef.current?.contains(target)) {
        return;
      }

      setOpenPanel(null);
      setWallpaperPickerOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenPanel(null);
        setWallpaperPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel, wallpaperPickerOpen]);

  const preloadScriptForMode = (targetMode) => {
    if (targetMode === "ma") {
      loadScriptFlow();
      loadSessionSummary();
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

  const preloadPanel = (panelId, targetMode = mode) => {
    if (panelId === "script") {
      preloadScriptForMode(targetMode);
      return;
    }
    if (panelId === "tools" && modeSupportsAgentTools(targetMode)) {
      loadAgentTools();
      return;
    }
    if (panelId === "sepTool" && targetMode === "ma") {
      loadSEPLookup();
      loadCarrierRef();
      return;
    }
    if (panelId === "acaIntel") {
      loadACAIntelligence();
      return;
    }
    if (panelId === "complianceHub") {
      if (targetMode === "ma") {
        loadComplianceDashboard();
      } else {
        loadCallHistory();
        if (targetMode === "medsup") {
          loadTranscriptUpload();
        }
      }
      return;
    }
    if (panelId === "leaderboard") {
      loadLeaderboard();
      return;
    }
    if (panelId === "verse") {
      loadDailyVerse();
    }
  };

  const handleModeChange = (newMode) => {
    preloadScriptForMode(newMode);
    startTransition(() => {
      setMode(newMode);
      setOpenPanel(null);
      setWallpaperPickerOpen(false);
    });
  };

  const handleTabToggle = (tabId) => {
    if (tabId === "script") {
      setOpenPanel(null);
      return;
    }

    preloadPanel(tabId);
    startTransition(() => {
      setOpenPanel((current) => (current === tabId ? null : tabId));
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
    if (!source.length) {
      return;
    }

    const randomWallpaper = source[Math.floor(Math.random() * source.length)];
    setBackgroundSelection(randomWallpaper.id);
  };

  const openSepQualifier = () => {
    if (hasLeftRailItem("sep-qualifier")) {
      expandLeftRail("sep-qualifier");
      return;
    }

    showLeftRail({
      id: "sep-qualifier",
      priority: 3,
      title: "SEP QUALIFIER",
      shortLabel: "SEP QUALIFIER",
      color: "#e53e3e",
      component: (
        <SEPQualifier onMinimize={() => minimizeLeftRail("sep-qualifier")} />
      ),
    });
  };

  const sepLauncher =
    mode === "ma" && !hasLeftRailItem("sep-qualifier") ? (
      <button
        type="button"
        className="left-rail-handle left-rail-handle-launcher"
        onClick={openSepQualifier}
      >
        <span className="left-rail-handle-pip" style={{ background: "#e53e3e" }} />
        <span className="left-rail-handle-text">SEP QUALIFIER</span>
      </button>
    ) : null;

  const activeTabId = openPanel || "script";

  const renderOverlayContent = () => {
    switch (openPanel) {
      case "tools":
        return (
          <LazyPanel>
            <AgentTools />
          </LazyPanel>
        );
      case "sepTool":
        return (
          <div className="top-panel-stack">
            <LazyPanel>
              <SEPLookup />
            </LazyPanel>
            <LazyPanel>
              <CarrierRef />
            </LazyPanel>
          </div>
        );
      case "acaIntel":
        return (
          <LazyPanel>
            <ACAIntelligence />
          </LazyPanel>
        );
      case "complianceHub":
        if (mode === "ma") {
          return <MainFlowComplianceHubPanel />;
        }

        return (
          <div className="top-panel-stack">
            <LazyPanel>
              <CallHistory />
            </LazyPanel>
            {mode === "medsup" ? (
              <LazyPanel>
                <TranscriptUpload />
              </LazyPanel>
            ) : null}
          </div>
        );
      case "leaderboard":
        return (
          <LazyPanel>
            <Leaderboard />
          </LazyPanel>
        );
      case "verse":
        return (
          <LazyPanel>
            <DailyVerse />
          </LazyPanel>
        );
      default:
        return null;
    }
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

      <div
        className="app-shell app-shell-modern"
        style={{ "--left-rail-width": `${railWidth}px` }}
      >
        <header ref={topBarRef} className="top-bar-shell">
          <div className="top-bar-brand">
            <EnrollGenLogo
              width={118}
              className="top-bar-logo"
              style={{ margin: 0 }}
              onClick={handleLogoClick}
              title="Refresh and return to the main page"
            />
            <FlowSelector mode={mode} onChange={handleModeChange} compact />
          </div>

          <nav className="top-bar-tabs" aria-label="Workspace tabs">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`top-bar-tab${activeTabId === tab.id ? " is-active" : ""}`}
                onClick={() => handleTabToggle(tab.id)}
                onMouseEnter={() => preloadPanel(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="top-bar-utilities">
            <div className={`top-bar-wallpaper${wallpaperPickerOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="top-bar-wallpaper-toggle"
                onClick={() => setWallpaperPickerOpen((open) => !open)}
              >
                <span className="top-bar-wallpaper-label">
                  {selectedWallpaper?.label || "Wallpaper"}
                </span>
                <ChevronDown size={13} />
              </button>

              {wallpaperPickerOpen ? (
                <div className="top-bar-wallpaper-panel">
                  <div className="top-bar-wallpaper-head">
                    <span>Background</span>
                    <button
                      type="button"
                      className="top-bar-wallpaper-random"
                      onClick={selectRandomWallpaper}
                      title="Random wallpaper"
                    >
                      <Shuffle size={12} />
                    </button>
                  </div>

                  <div className="top-bar-wallpaper-grid">
                    {wallpapers.map((wallpaper) => (
                      <button
                        key={wallpaper.id}
                        type="button"
                        className={`top-bar-wallpaper-tile${
                          backgroundSelection === wallpaper.id ? " is-active" : ""
                        }`}
                        onClick={() => selectBackground(wallpaper.id)}
                        title={wallpaper.label}
                      >
                        {wallpaper.thumbUrl ? (
                          <img
                            className="top-bar-wallpaper-image"
                            src={wallpaper.thumbUrl}
                            alt=""
                            aria-hidden="true"
                            decoding="async"
                          />
                        ) : (
                          <span className="top-bar-wallpaper-fallback" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {!LOGIN_DISABLED ? <ProfileChip /> : null}
          </div>
        </header>

        <LeftRail launcher={sepLauncher} />

        {openPanel ? (
          <div ref={overlayRef} className="top-panel-overlay">
            <div className="top-panel-header">
              <div className="top-panel-title">
                {navTabs.find((tab) => tab.id === openPanel)?.label || "Panel"}
              </div>
              <button
                type="button"
                className="top-panel-close"
                onClick={() => setOpenPanel(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="top-panel-body">{renderOverlayContent()}</div>
          </div>
        ) : null}

        <div className="app-workspace">
          <main className="app-center">
            {mode === "ma" ? (
              <ScriptProvider>
                <div className="main-script-layout">
                  <div className="main-script-primary">
                    <LazyPanel>
                      <ScriptFlow />
                    </LazyPanel>
                    <SessionSummarySlot />
                  </div>
                </div>
              </ScriptProvider>
            ) : null}

            {mode === "medsup" ? (
              <MedSupProvider>
                <LazyPanel>
                  <MedSupScriptWorkspace />
                </LazyPanel>
              </MedSupProvider>
            ) : null}

            {mode === "aca" ? (
              <LazyPanel>
                <ACAScript />
              </LazyPanel>
            ) : null}

            {mode === "u65" ? (
              <LazyPanel>
                <U65Script />
              </LazyPanel>
            ) : null}
          </main>
        </div>
      </div>
    </>
  );
}

function AppContent() {
  return (
    <LeftRailProvider>
      <AppShell />
    </LeftRailProvider>
  );
}

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
