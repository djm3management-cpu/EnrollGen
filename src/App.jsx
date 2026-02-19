import { useState } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import ScriptFlow from "./components/ScriptFlow";
import AgentTools from "./components/AgentTools";
import SessionSummary from "./components/SessionSummary";
import { ScriptProvider } from "./context/ScriptContext";
import "./styles.css";

const LOGIN_DISABLED = import.meta.env.DEV;

export default function App() {
  const [tab, setTab] = useState("script");

  return (
    <>
      <div className="viewport-bg" />
      <div className="app-shell">
        <div className="app">
          <EnrollGenLogo width={400} className="app-logo" />

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
