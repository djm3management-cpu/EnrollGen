import React from "react";
import { ScriptBox } from "./SharedUI";
import { MA_CLOSING } from "../data/maScript2027.js";

// The spoken closing is independent of saving the after-call intake.
// Disposition requirements remain enforced by the existing intake gate.
export default React.memo(function SectionWrapUp({scriptBody,children}) {
  return <section className="section card active-card" data-section="8">
    <h2>Closing</h2>
    <ScriptBox>{scriptBody || MA_CLOSING}</ScriptBox>
    {children}

  </section>;
});
