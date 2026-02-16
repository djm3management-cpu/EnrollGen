import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText } from "./SharedUI";

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
      <h2>4) Qualifications</h2>

      {unlocked.s4 && (
        <>
          <ScriptBox verbatim>
            {`"Do you have or will soon have Medicare Parts A and B?"
If yes: "Can you please grab your Red, White and Blue Medicare card so I can confirm your MBI?"
If not available: Verify full legal name, date of birth, and Social Security Number.
(Agent note: Send to MARx check.)

"Can you tell me what it says on your card for the Part A and Part B effective dates?" (Read back effective dates)

Medicaid / Extra Help: "Are you currently receiving any assistance with your Part B premium through Medicaid, or Extra Help that helps pay for prescription coverage?"

Permanent Residence: "Do you mind confirming your permanent home address?"
(Agent note: If the caller does not want to provide it, proceed without it. If unsure, confirm the address on file with Social Security, tax records, or voter registration.)

Permission to Contact (TCPA):
"Would you like to provide your phone number so we can contact you in the future? This is optional."
"Does New Gen Health Solutions have permission to have a licensed sales agent contact you in the future about plan information and your Medicare enrollment options? Your consent is voluntary and allows us to contact you via text messaging or automatic dialing. You may change your preferences at any time. This will not affect your eligibility for enrollment or benefits. Message and data rates may apply."
"Would you like to provide an email address that we can use to contact you? This is optional and can be used to send plan information or updates."

"Are you a veteran?"
(If yes: Thank them for their service!)

"Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA?"
(Agent note: If present, politely end the call. Basic VA coverage alone may proceed.)

"In the last twelve months, have you gone to an emergency room or an urgent care center for medical care?" (IF YES): "Was that one or two times, or more than that?"`}
          </ScriptBox>

          <ScriptBox verbatim>
            {`(If):Annual Election Period (AEP)
"The Annual Election Period runs from October 15 through December 7. We are currently within this period, so you may make a Medicare plan change."             
(If):Open Enrollment (OE / MA-OEP)
"Medicare Open Enrollment runs from January 1 through March 31. Since we are within this period, you may make a one-time plan change."             
(If):Special Election Period (SEP)
"You qualify for a Special Election Period, which allows you to make a Medicare plan change outside of the standard enrollment periods."`}
          </ScriptBox>

          <ScriptBox verbatim>
            {` Required Privacy Statement:
"Please be aware that you are not required to give any health-related information unless it will be used to determine your enrollment eligibility. If you choose not to provide required health information, you may not be able to enroll."`}
          </ScriptBox>
        </>
      )}

      <label className="check">
        <input
          type="checkbox"
          disabled={!soaOk}
          checked={qualOk}
          onChange={(e) =>
            dispatch({ type: "SET_GATE", field: "qualOk", value: e.target.checked })
          }
        />
        Qualifications completed
      </label>

      {!soaOk && (
        <LockText>
          Locked until Power of Attorney & Scope of Appointment are completed.
        </LockText>
      )}
      {soaOk && !qualOk && (
        <LockText>
          Qualifications must be completed before proceeding to Needs Assessment.
        </LockText>
      )}
    </section>
  );
});
