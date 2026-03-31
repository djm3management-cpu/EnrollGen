/**
 * ACAScript.jsx — ACA On-Exchange entry point
 * Wraps ACAFlow with ACAProvider
 */

import { useRef, useState } from "react";
import { ACAProvider } from "./ACAContext";
import { useACA } from "./ACAContext";
import ACAFlow from "./ACAFlow";
import ACAChecklist from "./ACAChecklist";
import AcaCopilot from "../../components/AcaCopilot";
import DevotedPopupManager from "../../components/ancillary/DevotedPopupManager";

function ACAScriptBody() {
  const { state } = useACA();
  const [transcript, setTranscript] = useState("");
  const flowShellRef = useRef(null);
  const flowMainRef = useRef(null);

  return (
    <>
      <AcaCopilot onTranscriptChange={setTranscript} />
      <div className="flow-shell" ref={flowShellRef}>
        <DevotedPopupManager
          callStarted={state.callStarted}
          transcript={transcript}
          anchorRef={flowMainRef}
        />
        <div className="flow-main" ref={flowMainRef}>
          <ACAFlow />
        </div>
      </div>
      <ACAChecklist />
    </>
  );
}

export default function ACAScript() {
  return (
    <ACAProvider>
      <ACAScriptBody />
    </ACAProvider>
  );
}
