import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import LandingPage from "./components/LandingPage";
import { ScriptProvider, useScript } from "./context/ScriptContext";
import { MedSupProvider } from "./context/MedSupContext";
import { useLiveCall } from "./context/LiveCallContext";
import TrainingModeToggle from "./components/training/TrainingModeToggle";
import { SignedIn, SignedOut, SignIn, useClerk, useOrganization, useUser } from "@clerk/clerk-react";
import { ChevronDown, Settings, Shuffle, X } from "lucide-react";
import { wallpapers } from "./config/wallpapers";
import { useSubscription } from "./hooks/useSubscription";
import { useTenantConfig } from "./hooks/useTenantConfig";
import { useAppAuth } from "./context/AuthContext";
import { fetchWithClerk } from "./lib/clerkFetch";
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
const loadAncillaryFlow = () => import("./flows/ancillary/AncillaryFlow");
const loadAgentTools = () => import("./components/AgentTools");
const loadSEPLookup = () => import("./components/SEPLookup");
const loadSessionSummary = () => import("./components/SessionSummary");
const loadTranscriptUpload = () => import("./components/TranscriptUpload");
const loadCarrierRef = () => import("./components/CarrierRef");
const loadCallHistory = () => import("./components/CallHistory");
const loadDailyVerse = () => import("./components/DailyVerse");
const loadACAIntelligence = () => import("./components/ACAIntelligence");
const loadComplianceDashboard = () => import("./components/ComplianceDashboard");
const loadOperationsTab = () => import("./components/OperationsTab");
const loadBillingSettings = () => import("./components/BillingSettings");
const loadTenantSettings = () => import("./components/TenantSettings");
const loadOnboarding = () => import("./components/Onboarding");

const ScriptFlow = lazy(loadScriptFlow);
const MedSupFlow = lazy(loadMedSupFlow);
const MedSupAiCopilot = lazy(loadMedSupAiCopilot);
const ACAScript = lazy(loadACAScript);
const U65Script = lazy(loadU65Script);
const AncillaryFlow = lazy(loadAncillaryFlow);
const AgentTools = lazy(loadAgentTools);
const SEPLookup = lazy(loadSEPLookup);
const SessionSummary = lazy(loadSessionSummary);
const TranscriptUpload = lazy(loadTranscriptUpload);
const CarrierRef = lazy(loadCarrierRef);
const CallHistory = lazy(loadCallHistory);
const DailyVerse = lazy(loadDailyVerse);
const ACAIntelligence = lazy(loadACAIntelligence);
const ComplianceDashboard = lazy(loadComplianceDashboard);
const OperationsTab = lazy(loadOperationsTab);
const BillingSettings = lazy(loadBillingSettings);
const TenantSettings = lazy(loadTenantSettings);
const Onboarding = lazy(loadOnboarding);
const BACKGROUND_SELECTION_STORAGE_KEY = "enrollgen_background_selection_v4";
const LOGIN_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const tenantBootstrapAttempts = new Set();

function modeSupportsAgentTools(mode) {
  return mode === "ma" || mode === "aca";
}

const FLOWS = [
  { id: "ma", label: "MA", title: "Medicare Advantage", color: "#E8002D", rgb: "232,0,45" },
  { id: "aca", label: "ACA", title: "ACA On-Exchange", color: "#EAB308", rgb: "234,179,8" },
  { id: "medsup", label: "SUP", title: "Medicare Supplement", color: "#00D166", rgb: "0,209,102" },
  { id: "u65", label: "U65", title: "U65 Off-Exchange", color: "#a855f7", rgb: "168,85,247" },
  { id: "ancillary", label: "ANC", title: "Ancillary", color: "#3B82F6", rgb: "59,130,246" },
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
              title={flow.title}
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

function getModeFromLocation() {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/script/ancillary")) {
    return "ancillary";
  }

  return "ma";
}

function syncModePath(mode) {
  if (typeof window === "undefined") {
    return;
  }

  if (mode === "ancillary") {
    if (!window.location.pathname.startsWith("/script/ancillary")) {
      window.history.pushState(null, "", "/script/ancillary");
    }
    return;
  }

  if (window.location.pathname.startsWith("/script/ancillary")) {
    window.history.pushState(null, "", "/");
  }
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

function isAdminUser(user) {
  const role =
    user?.publicMetadata?.role ||
    user?.privateMetadata?.role ||
    user?.organizationMemberships?.[0]?.role ||
    "";
  return role === "admin" || role === "org:admin" || user?.publicMetadata?.isAdmin === true;
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
  tabs.push({ id: "operations", label: "CALLS" });
  tabs.push({ id: "billing", label: "Billing" });
  tabs.push({ id: "verse", label: "Daily Verse" });

  return tabs;
}

function AppShell({ currentUser = null }) {
  const [mode, setMode] = useState(getModeFromLocation);
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
  const canAdmin = LOGIN_DISABLED || isAdminUser(currentUser);
  const navTabs = useMemo(() => getTabsForMode(mode), [mode]);

  useEffect(() => {
    const handlePopState = () => {
      const nextMode = getModeFromLocation();
      startTransition(() => {
        setMode(nextMode);
        setOpenPanel(null);
        setWallpaperPickerOpen(false);
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

  useLayoutEffect(() => {
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
      return;
    }
    if (targetMode === "ancillary") {
      loadAncillaryFlow();
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
    if (panelId === "operations") {
      loadOperationsTab();
      return;
    }
    if (panelId === "billing") {
      loadBillingSettings();
      return;
    }
    if (panelId === "settings") {
      loadTenantSettings();
      return;
    }
    if (panelId === "verse") {
      loadDailyVerse();
    }
  };

  const handleModeChange = (newMode) => {
    if (newMode === mode) {
      setOpenPanel(null);
      setWallpaperPickerOpen(false);
      return;
    }

    preloadScriptForMode(newMode);
    syncModePath(newMode);
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
      case "operations":
        return (
          <LazyPanel>
            <OperationsTab />
          </LazyPanel>
        );
      case "billing":
        return (
          <LazyPanel>
            <BillingSettings />
          </LazyPanel>
        );
      case "settings":
        return (
          <LazyPanel>
            <TenantSettings currentUser={currentUser} />
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
            <TrainingModeToggle />
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
            {canAdmin ? (
              <button
                type="button"
                className={`top-bar-settings-button${openPanel === "settings" ? " is-active" : ""}`}
                onClick={() => {
                  preloadPanel("settings");
                  setOpenPanel((current) => (current === "settings" ? null : "settings"));
                }}
                title="Agency settings"
              >
                <Settings size={14} />
              </button>
            ) : null}
          </div>
        </header>

        {mode === "ma" ? (
          <ScriptProvider>
            <LeftRail launcher={sepLauncher} />

            {openPanel ? (
              <div
                ref={overlayRef}
                className={`top-panel-overlay${openPanel === "tools" ? " top-panel-overlay--tools" : ""}`}
              >
                <div className="top-panel-header">
                  <div className="top-panel-title">
                    {openPanel === "settings"
                      ? "Agency Settings"
                      : navTabs.find((tab) => tab.id === openPanel)?.label || "Panel"}
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
                <div className="main-script-layout">
                  <div className="main-script-primary">
                    <LazyPanel>
                      <ScriptFlow />
                    </LazyPanel>
                    <SessionSummarySlot />
                  </div>
                </div>
              </main>
            </div>
          </ScriptProvider>
        ) : (
          <>
            {openPanel ? (
              <div
                ref={overlayRef}
                className={`top-panel-overlay${openPanel === "tools" ? " top-panel-overlay--tools" : ""}`}
              >
                <div className="top-panel-header">
                  <div className="top-panel-title">
                    {openPanel === "settings"
                      ? "Agency Settings"
                      : navTabs.find((tab) => tab.id === openPanel)?.label || "Panel"}
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

                {mode === "ancillary" ? (
                  <LazyPanel>
                    <AncillaryFlow />
                  </LazyPanel>
                ) : null}
              </main>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function trialDaysRemaining(subscription) {
  const end = subscription?.trial_ends_at;
  if (!end) return null;
  const diff = new Date(end).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function SubscriptionBanner() {
  const { subscription, isStarter, isTrial } = useSubscription();
  const days = trialDaysRemaining(subscription);

  if (isTrial) {
    return (
      <div className="subscription-banner">
        Trial ends in {days ?? "--"} days. Upgrade from Billing to continue uninterrupted.
      </div>
    );
  }

  if (isStarter) {
    return (
      <div className="subscription-banner is-starter">
        Starter plan active. Co-Pilot, transcription, CRM sync, and advanced analytics require Pro.
      </div>
    );
  }

  return null;
}

function SubscriptionGate({ children }) {
  useSubscription();

  return (
    <>
      <SubscriptionBanner />
      {children}
    </>
  );
}

function AppContent({ currentUser = null }) {
  return (
    <SubscriptionGate>
      <LeftRailProvider>
        <AppShell currentUser={currentUser} />
      </LeftRailProvider>
    </SubscriptionGate>
  );
}

function TenantAutoBootstrap({ currentUser = null, organization, onComplete, onTenantSeeded }) {
  const { getToken } = useAppAuth();
  const [error, setError] = useState("");
  const userId = currentUser?.id || "";
  const userFullName = currentUser?.fullName || "";
  const userFirstName = currentUser?.firstName || "";
  const userLastName = currentUser?.lastName || "";
  const bootstrapAgent = useMemo(
    () => ({
      name: userFullName || [userFirstName, userLastName].filter(Boolean).join(" ") || "Agent",
      npn: "",
      clerk_user_id: userId,
      ghl_user_id: "",
    }),
    [userFirstName, userFullName, userId, userLastName]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrapTenant() {
      if (!organization?.id) return;
      if (tenantBootstrapAttempts.has(organization.id)) return;

      tenantBootstrapAttempts.add(organization.id);
      setError("");
      try {
        const agencyName = organization.name || "New Agency";
        const response = await fetchWithClerk(getToken, "/api/seed-new-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bootstrap_only: true,
            org_id: organization.id,
            tenant: {
              name: agencyName,
              agency_display_name: agencyName,
            },
            agents: [bootstrapAgent],
          }),
        });

        const raw = await response.text().catch(() => "");
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        if (!response.ok) {
          const detail = data.detail || data.error || raw?.slice(0, 240);
          throw new Error(
            detail
              ? `Unable to create agency workspace (${response.status}): ${detail}`
              : `Unable to create agency workspace (HTTP ${response.status}).`
          );
        }

        if (!cancelled) {
          if (data.tenant?.id) onTenantSeeded?.(data.tenant);
          await onComplete?.({ background: true });
        }
      } catch (error) {
        if (!cancelled) {
          setError(error?.message || "Unable to create agency workspace.");
        }
      }
    }

    bootstrapTenant();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapAgent,
    getToken,
    onComplete,
    onTenantSeeded,
    organization?.id,
    organization?.name,
  ]);

  return (
    <div className="subscription-paywall">
      <div className="subscription-paywall-card">
        <span className="billing-eyebrow">TENANT</span>
        <h1>Setting up {organization?.name || "agency"}</h1>
        <p>Linking your Clerk organization to an EnrollGen workspace.</p>
        {error ? <div className="billing-alert is-error">{error}</div> : null}
      </div>
    </div>
  );
}

function AuthenticatedAppContent() {
  const { user } = useUser();
  const { tenant, loading, error, refetch, hydrateTenant } = useTenantConfig();
  const { organization, isLoaded: organizationLoaded } = useOrganization();

  if (loading || !organizationLoaded) {
    return (
      <div className="subscription-paywall">
        <div className="subscription-paywall-card">
          <span className="billing-eyebrow">TENANT</span>
          <h1>Loading agency</h1>
          <p>Checking your organization workspace.</p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    if (organization?.id) {
      return (
        <TenantAutoBootstrap
          currentUser={user}
          organization={organization}
          onComplete={refetch}
          onTenantSeeded={hydrateTenant}
        />
      );
    }

    return (
      <LazyPanel>
        <Onboarding currentUser={user} onComplete={refetch} error={error} />
      </LazyPanel>
    );
  }

  return <AppContent currentUser={user} />;
}

export default function App() {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname
  );

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", updatePathname);
    return () => window.removeEventListener("popstate", updatePathname);
  }, []);

  if (LOGIN_DISABLED) {
    return <AppContent />;
  }

  return (
    <>
      <SignedOut>
        {pathname === "/login" ? (
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
        ) : (
          <LandingPage />
        )}
      </SignedOut>
      <SignedIn>
        <AuthenticatedAppContent />
      </SignedIn>
    </>
  );
}
