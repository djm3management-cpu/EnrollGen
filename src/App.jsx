import { useState } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import ScriptFlow from "./components/ScriptFlow";
import AgentTools from "./components/AgentTools";
import ScriptUpload from "./components/ScriptUpload";
import SessionSummary from "./components/SessionSummary";
import { ScriptProvider } from "./context/ScriptContext";
import "./styles.css";

export default function App() {
  const [tab, setTab] = useState("script");

  return (
    <>
      <div className="viewport-bg" />
      <div className="app-shell">
        <div className="app">
          <EnrollGenLogo width={400} className="app-logo" />

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
              <ScriptUpload />
              <ScriptFlow />
              <SessionSummary />

              <footer className="legal-footer">
                <p>
                  <strong>Compliance Notice:</strong> EnrollGen is a compliance
                  assistance tool. Agents are responsible for ensuring that all
                  required disclosures are delivered accurately, completely, and
                  in accordance with CMS regulations and applicable carrier
                  guidelines.
                </p>
                <p>
                  <strong>Privacy Notice:</strong> No private or personal
                  information is stored or transmitted by EnrollGen. All
                  information entered into this tool is used locally for
                  real-time guidance only and is not saved, logged, or retained
                  in any database.
                </p>
                <p className="copyright-text">
                  © 2025 EnrollGen. All rights reserved.
                  <br />
                  EnrollGen and its associated scripts, workflows, and interface
                  are protected under U.S. copyright law.
                </p>
              </footer>
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
