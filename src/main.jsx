import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { CopilotLogProvider } from "./context/CopilotTranscriptLog";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider } from "./context/AuthContext";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const CLERK_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";

function RootProviders() {
  return (
    <AuthProvider>
      <CopilotLogProvider>
        <App />
      </CopilotLogProvider>
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
        background: "#0c1017",
        color: "#f8fafc",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, lineHeight: 1.5 }}>
        <h1 style={{ marginTop: 0 }}>Clerk is not configured</h1>
        <p style={{ marginBottom: 0 }}>
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

// Register service worker for offline capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
