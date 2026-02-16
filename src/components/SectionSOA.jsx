import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText } from "./SharedUI";

export default React.memo(function SectionSOA() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { tpmoOk, soaOk } = state;
  const isActive = activeSection === 3;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s3 ? "" : "disabled"
      }`}
    >
      <h2>3) Power of Attorney & Scope of Appointment</h2>

      {unlocked.s3 && isActive && (
        <>
          <ScriptBox verbatim>
            {` POA: "Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for?"  (IF YES): "Are they available now or should we discuss at a later time when they are available?"`}
          </ScriptBox>

          <ScriptBox verbatim>
            {` SCOPE OF APPOINTMENT:
"I work for New Gen Health Solutions, and in your area, we have a wide variety of plans such as" (Agent to list product types seen in Sunfire).
"Would you like to discuss all of these options or are you only interested in certain ones?"
"I can give you a brief overview of each of these plans, then you can decide which plan might be best for you based on your needs. Would that be ok?"
"This conversation has no effect on your current or future health coverage unless you enroll in a plan today. Talking to me does not obligate you to enroll or automatically enroll you in a plan."`}
          </ScriptBox>
        </>
      )}

      <label className="check">
        <input
          type="checkbox"
          disabled={!unlocked.s3}
          checked={soaOk}
          onChange={(e) =>
            dispatch({ type: "SET_GATE", field: "soaOk", value: e.target.checked })
          }
        />
        POA & SOA completed / permission confirmed
      </label>

      {!tpmoOk && <LockText>Locked until TPMO is complete.</LockText>}
      {unlocked.s3 && !soaOk && (
        <LockText>SOA required before Needs Assessment.</LockText>
      )}
    </section>
  );
});
