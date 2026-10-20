import React from "react";
import { ScriptBox } from "./SharedUI";
import { MA_CLOSING } from "../data/maScript2027.js";

// Enrollment notes/details are optional edits on the Calls record. This script
// section never gates disposition, closes a session, or starts post-call work.
export default React.memo(function SectionWrapUp({scriptBody}) {
  return <section className="section card active-card" data-section="8">
    <h2>Closing</h2>
    <ScriptBox>{scriptBody || MA_CLOSING}</ScriptBox>
    <p className="sf-status-text">After the call, save its disposition in the dialer. Notes, contact details and opportunities are optional and can be edited later in Calls.</p>
  </section>;
});
