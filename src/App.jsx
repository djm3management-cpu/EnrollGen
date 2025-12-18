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
        </>
      )}

      {tab === "tools" && <AgentTools />}
    </div>
  );
}
