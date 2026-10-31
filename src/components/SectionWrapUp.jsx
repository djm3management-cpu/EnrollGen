import React from "react";
import { ScriptBox } from "./SharedUI";
import { MA_CLOSING } from "../data/maScript2027.js";

// Enrollment notes/details are optional edits on the Calls record. This script
// section never gates disposition, closes a session, or starts post-call work.
export default React.memo(function SectionWrapUp({scriptBody}) {
  return <section className="section card active-card" data-section="8">
    <h2>Closing</h2>
    <ScriptBox>{scriptBody || MA_CLOSING}</ScriptBox>
    
  </section>;
});
