import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionTimer, SectionToast } from "./SharedUI";
import SectionCoach from "./SectionCoach";

export default React.memo(function SectionQualifications() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { soaOk, qualOk } = state;
  const isActive = activeSection === 4;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s4 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={4} timestamps={state.sectionTimestamps} />
      <h2>
        4) Qualifications
        <SectionTimer sectionNum={4} timestamps={state.sectionTimestamps} />
      </h2>

      {unlocked.s4 && (
        <>
          <ScriptBox verbatim>
            {`"Do you have or will soon have Medicare Parts A and B?"
If yes: "Can you please grab your Red, White and Blue Medicare card"
If not available: Verify full legal name, date of birth, and Social Security Number. (Agent note: Send to MARx check.)
"Can you tell me what it says on your card for the Part A and Part B effective dates?" (Read back effective dates)
"Are you currently receiving any assistance with your Part B premium through Medicaid, or help for prescription coverage?"
"Do you mind confirming your permanent home address?"
"Are you a veteran?" (If yes: Thank them for their service!)
"Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA?"
(Agent note: If present, politely end the call. Basic VA coverage alone may proceed.)
"In the last twelve months, have you gone to an emergency room or an urgent care center for medical care?" (IF YES): "Was that one or two times, or more than that?"`}
          </ScriptBox>

          <ScriptBox verbatim>
            {`(AEP) "The Annual Election Period runs from October 15 through December 7. We are currently within this period, so you may make a Medicare plan change."             
(OE / MA-OEP) "Medicare Open Enrollment runs from January 1 through March 31. Since we are within this period, you may make a one-time plan change."             
(SEP) "You qualify for a Special Election Period, which allows you to make a Medicare plan change outside of the standard enrollment periods."`}
          </ScriptBox>
        </>
      )}

      <div className="section-next-action">
        <button
          className="primary"
          disabled={!soaOk || qualOk}
          onClick={() =>
            dispatch({
              type: "SET_GATE",
              field: "qualOk",
              value: true,
            })
          }
        >
          {qualOk ? "✅ Qualifications Complete" : "Qualifications Complete"}
        </button>
      </div>

      <SectionCoach stepName="Qualifications" sectionNum={4} />

      {!soaOk && (
        <LockText>
          Locked until Power of Attorney & Scope of Appointment are completed.
        </LockText>
      )}
      {soaOk && !qualOk && (
        <LockText>
          Qualifications must be completed before proceeding to Needs
          Assessment.
        </LockText>
      )}
    </section>
  );
});
