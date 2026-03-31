/**
 * U65Script.jsx — U65 Off-Exchange entry point
 * Wraps U65Flow with U65Provider
 */

import { useRef, useState } from "react";
import { U65Provider } from "./U65Context";
import { useU65 } from "./U65Context";
import U65Flow from "./U65Flow";
import U65Checklist from "./U65Checklist";
import U65Copilot from "../../components/U65Copilot";
import DevotedPopupManager from "../../components/ancillary/DevotedPopupManager";

function U65ScriptBody() {
  const { state } = useU65();
  const [transcript, setTranscript] = useState("");
  const flowShellRef = useRef(null);
  const flowMainRef = useRef(null);

  return (
    <>
      <U65Copilot onTranscriptChange={setTranscript} />
      <div className="flow-shell" ref={flowShellRef}>
        <DevotedPopupManager
          callStarted={state.callStarted}
          transcript={transcript}
          anchorRef={flowMainRef}
        />
        <div className="flow-main" ref={flowMainRef}>
          <U65Flow />
        </div>
      </div>
      <U65Checklist />
    </>
  );
}

export default function U65Script() {
  return (
    <U65Provider>
      <U65ScriptBody />
    </U65Provider>
  );
}
