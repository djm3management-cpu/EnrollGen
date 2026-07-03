import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/design-tokens.css";
import "./styles/public-shell.css";
import { CopilotLogProvider } from "./context/CopilotTranscriptLog";
import { LiveCallProvider } from "./context/LiveCallContext";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const CLERK_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const LEGACY_TRAINING_MODE_STORAGE_KEY = "enrollgen_training_mode_v1";
const PRELOAD_RELOAD_STORAGE_KEY = "enrollgen_preload_reload_v1";

if (import.meta.env.DEV) {
  void import("./lib/sessionTrackingDiagnostic").then(
    ({ runSessionTrackingDiagnostic }) => runSessionTrackingDiagnostic()
  );
}

function installPreloadErrorHandler() {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();

    try {
      if (window.sessionStorage.getItem(PRELOAD_RELOAD_STORAGE_KEY) === "pending") {
        return;
      }
      window.sessionStorage.setItem(PRELOAD_RELOAD_STORAGE_KEY, "pending");
    } catch {
      // Reload anyway if storage is blocked.
    }

    window.location.reload();
  });

  window.addEventListener("load", () => {
    window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(PRELOAD_RELOAD_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }, 10000);
  });
}

installPreloadErrorHandler();

function getClientPlatform() {
  if (typeof navigator === "undefined") return "unknown";

  const platformHints = [
    navigator.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(" ");

  if (/win/i.test(platformHints)) return "windows";
  if (/mac|iphone|ipad|ipod/i.test(platformHints)) return "apple";
  if (/android/i.test(platformHints)) return "android";
  if (/linux/i.test(platformHints)) return "linux";
  return "unknown";
}

function applyRenderEnvironmentFlags() {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.platform = getClientPlatform();

  if (typeof window === "undefined" || !window.matchMedia) {
    document.documentElement.dataset.motion = "full";
    return;
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const syncMotionPreference = () => {
    document.documentElement.dataset.motion = motionQuery.matches ? "reduce" : "full";
  };

  syncMotionPreference();

  if (motionQuery.addEventListener) {
    motionQuery.addEventListener("change", syncMotionPreference);
  } else {
    motionQuery.addListener(syncMotionPreference);
  }
}

applyRenderEnvironmentFlags();

function clearLegacyTrainingModeFlag() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_TRAINING_MODE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

clearLegacyTrainingModeFlag();

function RootProviders() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <CopilotLogProvider>
          <LiveCallProvider>
            <App />
          </LiveCallProvider>
        </CopilotLogProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

function MissingClerkKey() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        padding: 24,
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{ maxWidth: 560, lineHeight: 1.5 }}>
        <h1
          style={{
            marginTop: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Clerk is not configured
        </h1>
        <p style={{ marginBottom: 0, color: "var(--text-secondary)" }}>
          Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in your Vite environment,
          or set <code>VITE_DISABLE_CLERK_AUTH=true</code> if you intentionally
          want to bypass auth.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {CLERK_DISABLED ? (
      <RootProviders />
    ) : PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <RootProviders />
      </ClerkProvider>
    ) : (
      <MissingClerkKey />
    )}
  </React.StrictMode>
);

// Keep service workers out of Vite dev so localhost doesn't serve a stale shell.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.DEV) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .catch(() => {});

      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("enrollgen-"))
                .map((key) => caches.delete(key))
            )
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
