import logo from "./assets/EnrollGenHeader.png";

import { useState } from "react";
import Timer from "./Timer";
import ScriptFlow from "./ScriptFlow";
import AgentTools from "./AgentTools";
import ScriptUpload from "./ScriptUpload";
import "./styles.css";

export default function App() {
  const [tab, setTab] = useState("script");

  return (
    <div className="app">
      <h1>EnrollGenAI Agent Script Assist</h1>
      <img src={logo} alt="EnrollGenAI" className="app-logo" />

      <div className="tabs">
        <button onClick={() => setTab("script")}>Script</button>
        <button onClick={() => setTab("tools")}>Agent Tools</button>
      </div>

      {tab === "script" && (
        <>
          <ScriptUpload />
          <Timer />
          <ScriptFlow />
          <footer className="legal-footer">
            <p>
              <strong>Compliance Notice:</strong> EnrollGen is a compliance
              assistance tool. Agents are responsible for ensuring that all
              required disclosures are delivered accurately, completely, and in
              accordance with CMS regulations and applicable carrier guidelines.
            </p>

            <p>
              <strong>Privacy Notice:</strong> No private or personal
              information is stored or transmitted by EnrollGen. All information
              entered into this tool is used locally for real-time guidance only
              and is not saved, logged, or retained in any database.
            </p>
          </footer>
        </>
      )}

      {tab === "tools" && <AgentTools />}
    </div>
  );
}
