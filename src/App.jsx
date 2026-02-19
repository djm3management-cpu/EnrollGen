import { useState, useEffect } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import ScriptFlow from "./components/ScriptFlow";
import AgentTools from "./components/AgentTools";
import SessionSummary from "./components/SessionSummary";
import { ScriptProvider } from "./context/ScriptContext";
import netlifyIdentity from "netlify-identity-widget";
import "./styles.css";

const LOGIN_DISABLED = import.meta.env.DEV;

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("script");

  useEffect(() => {
    netlifyIdentity.init();

    netlifyIdentity.on("login", (user) => {
      setUser(user);
      netlifyIdentity.close();
    });

    netlifyIdentity.on("logout", () => {
      setUser(null);
    });

    setUser(netlifyIdentity.currentUser());
  }, []);

  // 🔒 LOGIN SCREEN (disabled in dev)
  if (!user && !LOGIN_DISABLED) {
    return (
      <div style={{ textAlign: "center", marginTop: "120px" }}>
        <h2>Agent Login Required</h2>
        <button onClick={() => netlifyIdentity.open()}>Login</button>
      </div>
    );
  }

  // ✅ REAL APP
  return (
    <>
      <div className="viewport-bg" />
      <div className="app-shell">
        <div className="app">
          <EnrollGenLogo width={400} className="app-logo" />

          {!LOGIN_DISABLED && (
            <div style={{ position: "absolute", top: 20, right: 20 }}>
              <button onClick={() => netlifyIdentity.logout()}>Logout</button>
            </div>
          )}

          {LOGIN_DISABLED && (
            <div
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                fontSize: 12,
                opacity: 0.6,
              }}
            >
              DEV MODE
            </div>
          )}

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
          </div>

          <ScriptProvider>
            <div style={{ display: tab === "script" ? "block" : "none" }}>
              <ScriptFlow />
              <SessionSummary />
            </div>

            <div style={{ display: tab === "tools" ? "block" : "none" }}>
              <AgentTools />
            </div>
          </ScriptProvider>
        </div>
      </div>
    </>
  );
}
