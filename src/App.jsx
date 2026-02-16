import { useState } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import ScriptFlow from "./components/ScriptFlow";
import AgentTools from "./components/AgentTools";
import ScriptUpload from "./components/ScriptUpload";
import { ScriptProvider } from "./context/ScriptContext";
import "./styles.css";
import { SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";

export default function App() {
  const [tab, setTab] = useState("script");

  return (
    <>
      <SignedOut>
        <div className="signin-wrapper">
          <SignIn />
        </div>
      </SignedOut>

      <SignedIn>
        {/* FIXED FULL-VIEWPORT BACKGROUND */}
        <div className="viewport-bg" />

        {/* APP CONTENT */}
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

            {/*
              Both tabs stay mounted — toggled via CSS display.
              Prevents ScriptFlow state from being destroyed
              when the agent switches to Agent Tools mid-call.
            */}
            <ScriptProvider>
              <div style={{ display: tab === "script" ? "block" : "none" }}>
                <ScriptUpload />
                <ScriptFlow />

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
      </SignedIn>
    </>
  );
}
