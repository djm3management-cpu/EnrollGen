import {
  Component,
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ShellTextures from "./components/ShellTextures";
import BottomStatusBar from "./components/BottomStatusBar";
import { ScriptProvider, useScript } from "./context/ScriptContext";
import { MedSupProvider } from "./context/MedSupContext";
import { useLiveCall } from "./context/LiveCallContext";
import { SignedIn, SignedOut, SignIn, useClerk, useOrganization, useUser } from "@clerk/clerk-react";
import { Settings, X } from "lucide-react";
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

const loadLandingPage = () => import("./components/LandingPage");
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
const loadDemoTab = () => import("./components/DemoTab");
const loadTenantSettings = () => import("./components/TenantSettings");
const loadOnboarding = () => import("./components/Onboarding");
const loadScriptEditor = () => import("./components/ScriptEditor");

const LandingPage = lazy(loadLandingPage);
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
const DemoTab = lazy(loadDemoTab);
const TenantSettings = lazy(loadTenantSettings);
const Onboarding = lazy(loadOnboarding);
const ScriptEditor = lazy(loadScriptEditor);
const headerLogoUrl = "/enrollgen-logo-v3.png?v=2";
const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SYSTEM_MONO_STACK = "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace";
const LOGIN_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const tenantBootstrapAttempts = new Set();
const clerkTerminalAppearance = {
  variables: {
    colorPrimary: "#c08b55",
    colorBackground: "#171411",
    colorInputBackground: "#262119",
    colorInputText: "#e4dace",
    colorText: "#e4dace",
    colorTextSecondary: "#b5a898",
    borderRadius: "5px",
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: "14px",
  },
  elements: {
    rootBox: {
      width: "min(430px, calc(100vw - 32px))",
    },
    cardBox: {
      width: "100%",
      border: "1px solid #3d352b",
      borderRadius: "7px",
      boxShadow: "none",
      background: "#1e1a16",
    },
    card: {
      gap: "14px",
      padding: "22px",
      backgroundColor: "transparent",
    },
    headerTitle: {
      color: "#e4dace",
      fontFamily: SYSTEM_FONT_STACK,
      fontSize: "28px",
      fontWeight: 600,
      letterSpacing: "-0.02em",
      lineHeight: "1.1",
      textTransform: "none",
    },
    headerSubtitle: {
      color: "#b5a898",
      fontFamily: SYSTEM_FONT_STACK,
      fontSize: "14px",
      lineHeight: "1.5",
    },
    socialButtonsBlockButton: {
      minHeight: "36px",
      border: "1px solid #3d352b",
      borderRadius: "5px",
      backgroundColor: "#262119",
      color: "#e4dace",
      fontFamily: SYSTEM_FONT_STACK,
      fontSize: "14px",
      fontWeight: 500,
    },
    dividerLine: {
      backgroundColor: "#3d352b",
    },
    dividerText: {
      color: "#7d7060",
      fontFamily: SYSTEM_MONO_STACK,
      fontSize: "10px",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    },
    formFieldLabel: {
      color: "#7d7060",
      fontFamily: SYSTEM_MONO_STACK,
      fontSize: "9px",
      fontWeight: 500,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    },
    formFieldInput: {
      minHeight: "36px",
      border: "1px solid #3d352b",
      borderRadius: "5px",
      backgroundColor: "#262119",
      color: "#e4dace",
      fontFamily: SYSTEM_FONT_STACK,
      fontSize: "14px",
    },
    formButtonPrimary: {
      minHeight: "36px",
      border: "none",
      borderRadius: "5px",
      background: "#c08b55",
      color: "#ffffff",
      fontFamily: SYSTEM_MONO_STACK,
      fontSize: "11px",
      fontWeight: 500,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
    footerActionText: {
      color: "#7d7060",
      fontSize: "12px",
    },
    footerActionLink: {
      color: "#c08b55",
      fontWeight: 500,
    },
  },
};

function modeSupportsAgentTools(mode) {
  return mode === "ma" || mode === "aca";
}

const FLOWS = [
  { id: "ma", label: "MA", title: "Medicare Advantage", color: "var(--eg-red)", border: "rgba(184, 92, 92, 0.42)", bg: "rgba(184, 92, 92, 0.08)" },
  { id: "aca", label: "ACA", title: "ACA On-Exchange", color: "var(--eg-blue)", border: "rgba(92, 136, 184, 0.42)", bg: "rgba(92, 136, 184, 0.08)" },
  { id: "medsup", label: "MS", title: "Medicare Supplement", color: "var(--eg-green)", border: "rgba(106, 171, 125, 0.42)", bg: "rgba(106, 171, 125, 0.08)" },
  { id: "u65", label: "U65", title: "U65 Off-Exchange", color: "var(--eg-purple)", border: "rgba(139, 110, 184, 0.42)", bg: "rgba(139, 110, 184, 0.08)" },
  { id: "ancillary", label: "ANC", title: "Ancillary", color: "var(--eg-amber)", border: "rgba(196, 153, 64, 0.42)", bg: "rgba(196, 153, 64, 0.08)" },
];

function FlowSelector({ mode, onChange }) {
  return (
    <div className="flow-selector-strip" role="tablist" aria-label="Workflow">
      {FLOWS.map((flow) => {
        const active = mode === flow.id;
        return (
          <button
            key={flow.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(flow.id)}
            title={flow.title}
            className={`flow-pill${active ? " is-active" : ""}`}
            style={{
              "--flow-color": flow.color,
              "--flow-border": flow.border,
              "--flow-bg": flow.bg,
              ...(active ? { background: flow.bg, borderColor: flow.border } : null),
            }}
          >
            <span className="flow-beacon" />
            <span className="flow-label">{flow.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LazyPanel({ children }) {
  return (
    <PanelErrorBoundary>
      <Suspense
        fallback={
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ color: "#8fa4bc", fontSize: "0.9rem" }}>Loading...</div>
          </div>
        }
      >
        {children}
      </Suspense>
    </PanelErrorBoundary>
  );
}

class PanelErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[EnrollGen] Panel render failed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ color: "#e09898", fontSize: "0.9rem", marginBottom: 10 }}>
            Panel failed to load.
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
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
      <div className="compliance-hub-shell">
        <ComplianceDashboard
          transcript={liveCall.transcript}
          customerTranscript={liveCall.customerTranscript}
          mergedTranscript={liveCall.mergedTranscript}
          result={liveCall.complianceResult}
          forceExpanded
          forceShowDetail
          forceExpandAllCategories
        />
      </div>
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

const MODE_ROUTES = {
  ma: "/",
  aca: "/script/aca",
  medsup: "/script/medsup",
  u65: "/script/u65",
  ancillary: "/script/ancillary",
};
const LEFT_RAIL_IDS = {
  sepQualifier: "sep-qualifier",
  u65PrivatePlans: "u65-private-plans",
  ancillaryDentalReference: "ancillary-dental-reference",
};
const EMPTY_LEFT_RAIL_IDS = [];
const LEFT_RAIL_IDS_BY_MODE = {
  ma: [LEFT_RAIL_IDS.sepQualifier],
  u65: [LEFT_RAIL_IDS.u65PrivatePlans],
  ancillary: [LEFT_RAIL_IDS.ancillaryDentalReference],
};

function getModeFromLocation() {
  if (typeof window === "undefined") return "ma";

  const { pathname } = window.location;
  if (pathname.startsWith(MODE_ROUTES.ancillary)) return "ancillary";
  if (pathname.startsWith(MODE_ROUTES.u65)) return "u65";
  if (pathname.startsWith(MODE_ROUTES.medsup)) return "medsup";
  if (pathname.startsWith(MODE_ROUTES.aca)) return "aca";
  return "ma";
}

function syncModePath(mode) {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = MODE_ROUTES[mode] || MODE_ROUTES.ma;
  const currentPath = window.location.pathname;

  if (mode === "ancillary" && currentPath.startsWith(MODE_ROUTES.ancillary)) {
    return;
  }

  if (currentPath !== nextPath) {
    window.history.pushState(null, "", nextPath);
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

function getTabsForMode(mode, canAdmin = false) {
  const tabs = [{ id: "script", label: "Script" }];

  tabs.push({ id: "demo", label: "Demo" });

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
  if (canAdmin) {
    tabs.push({ id: "scriptEditor", label: "SCRIPT EDITOR" });
  }
  tabs.push({ id: "verse", label: "Daily Verse" });

  return tabs;
}

function AppShell({ currentUser = null }) {
  const [mode, setMode] = useState(getModeFromLocation);
  const [openPanel, setOpenPanel] = useState(null);
  const topBarRef = useRef(null);
  const overlayRef = useRef(null);

  const {
    railWidth,
    expandedItem,
    hasLeftRailItem,
    showLeftRail,
    expandLeftRail,
    openLeftRail,
    minimizeLeftRail,
    dismissLeftRail,
  } = useLeftRailManager();

  const canAdmin = LOGIN_DISABLED || isAdminUser(currentUser);
  const navTabs = useMemo(() => getTabsForMode(mode, canAdmin), [canAdmin, mode]);
  const visibleLeftRailIds = LEFT_RAIL_IDS_BY_MODE[mode] || EMPTY_LEFT_RAIL_IDS;
  const visibleRailWidth = visibleLeftRailIds.includes(expandedItem?.id)
    ? railWidth
    : 0;

  useEffect(() => {
    const handlePopState = () => {
      const nextMode = getModeFromLocation();
      startTransition(() => {
        setMode(nextMode);
        setOpenPanel(null);
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.body.dataset.bgMode = "wallpaper";

    return () => {
      delete document.body.dataset.bgMode;
    };
  }, []);

  useEffect(() => {
    if (mode !== "ma" && hasLeftRailItem(LEFT_RAIL_IDS.sepQualifier)) {
      dismissLeftRail(LEFT_RAIL_IDS.sepQualifier);
    }
  }, [dismissLeftRail, hasLeftRailItem, mode]);

  useLayoutEffect(() => {
    if (mode !== "ma") {
      return;
    }

    showLeftRail({
      id: LEFT_RAIL_IDS.sepQualifier,
      priority: 3,
      title: "SEP QUALIFIER",
      shortLabel: "SEP QUALIFIER",
      color: "#e53e3e",
      forceOpen: true,
      component: (
        <SEPQualifier onMinimize={() => minimizeLeftRail(LEFT_RAIL_IDS.sepQualifier)} />
      ),
    });
    openLeftRail(LEFT_RAIL_IDS.sepQualifier);
  }, [minimizeLeftRail, mode, openLeftRail, showLeftRail]);

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    const handleMouseDown = (event) => {
      const target = event.target;
      if (overlayRef.current?.contains(target) || topBarRef.current?.contains(target)) {
        return;
      }

      setOpenPanel(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

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
    if (panelId === "demo") {
      loadDemoTab();
      return;
    }
    if (panelId === "settings") {
      loadTenantSettings();
      return;
    }
    if (panelId === "scriptEditor") {
      loadScriptEditor();
      return;
    }
    if (panelId === "verse") {
      loadDailyVerse();
    }
  };

  const handleModeChange = (newMode) => {
    if (newMode === mode) {
      setOpenPanel(null);
      return;
    }

    preloadScriptForMode(newMode);
    syncModePath(newMode);
    startTransition(() => {
      setMode(newMode);
      setOpenPanel(null);
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

  const openSepQualifier = () => {
    if (hasLeftRailItem(LEFT_RAIL_IDS.sepQualifier)) {
      expandLeftRail(LEFT_RAIL_IDS.sepQualifier);
      return;
    }

    showLeftRail({
      id: LEFT_RAIL_IDS.sepQualifier,
      priority: 3,
      title: "SEP QUALIFIER",
      shortLabel: "SEP QUALIFIER",
      color: "#e53e3e",
      component: (
        <SEPQualifier onMinimize={() => minimizeLeftRail(LEFT_RAIL_IDS.sepQualifier)} />
      ),
    });
    openLeftRail(LEFT_RAIL_IDS.sepQualifier);
  };

  const sepLauncher =
    mode === "ma" && !hasLeftRailItem(LEFT_RAIL_IDS.sepQualifier) ? (
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
      case "demo":
        return (
          <LazyPanel>
            <DemoTab />
          </LazyPanel>
        );
      case "settings":
        return (
          <LazyPanel>
            <TenantSettings currentUser={currentUser} />
          </LazyPanel>
        );
      case "scriptEditor":
        return (
          <LazyPanel>
            <ScriptEditor />
          </LazyPanel>
        );
      case "verse":
        return (
          <LazyPanel>
            <div className="daily-verse-shell">
              <DailyVerse />
            </div>
          </LazyPanel>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <ShellTextures />

      <div
        className={`app-shell app-shell-modern${
          mode === "ma" ? " app-shell--right-rail-space" : ""
        }`}
        style={{ "--left-rail-width": `${visibleRailWidth}px` }}
      >
        <header ref={topBarRef} className="top-bar-shell">
          <div className="top-bar-brand">
            <button
              type="button"
              className="top-bar-logo top-bar-logo-image-button"
              onClick={handleLogoClick}
              title="Refresh and return to the main page"
              aria-label="Refresh and return to the main page"
            >
              <img className="top-bar-logo-image" src={headerLogoUrl} alt="" />
            </button>
            <FlowSelector mode={mode} onChange={handleModeChange} />
          </div>

          <nav className="top-bar-tabs" aria-label="Workspace tabs">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`top-bar-tab${activeTabId === tab.id ? " is-active" : ""}`}
                data-tab-id={tab.id}
                onClick={() => handleTabToggle(tab.id)}
                onMouseEnter={() => preloadPanel(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="top-bar-utilities">
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
            <LeftRail launcher={sepLauncher} visibleItemIds={visibleLeftRailIds} />

            {openPanel ? (
              <div
                ref={overlayRef}
                className={`top-panel-overlay${
                  openPanel === "tools" ? " top-panel-overlay--tools" : ""
                }${
                  openPanel === "operations" ? " top-panel-overlay--operations" : ""
                }${
                  openPanel === "complianceHub" ? " top-panel-overlay--compliance" : ""
                }${
                  openPanel === "verse" ? " top-panel-overlay--verse" : ""
                }`}
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
            {mode === "u65" || mode === "ancillary" ? (
              <LeftRail visibleItemIds={visibleLeftRailIds} />
            ) : null}

            {openPanel ? (
              <div
                ref={overlayRef}
                className={`top-panel-overlay${
                  openPanel === "tools" ? " top-panel-overlay--tools" : ""
                }${
                  openPanel === "operations" ? " top-panel-overlay--operations" : ""
                }${
                  openPanel === "complianceHub" ? " top-panel-overlay--compliance" : ""
                }${
                  openPanel === "verse" ? " top-panel-overlay--verse" : ""
                }`}
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

        <BottomStatusBar />
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
        Trial ends in {days ?? "--"} days. Upgrade to continue uninterrupted.
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
          <div className="auth-shell">
            <SignIn appearance={clerkTerminalAppearance} />
          </div>
        ) : (
          <Suspense fallback={<div className="auth-shell" />}>
            <LandingPage />
          </Suspense>
        )}
      </SignedOut>
      <SignedIn>
        <AuthenticatedAppContent />
      </SignedIn>
    </>
  );
}
