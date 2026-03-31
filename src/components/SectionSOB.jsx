import React from "react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";
import SectionCoach from "./SectionCoach";

export default React.memo(function SectionSOB() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { neadsOk, sobOk, partBReduction } = state;
  const isActive = activeSection === 6;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s6 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={6} timestamps={state.sectionTimestamps} />
      <h2>
        6) Plan Selection & Summary of Benefits
      </h2>

      {unlocked.s6 && (
        <>
          <ScriptBox verbatim>
            {`"Based on your doctors, prescriptions, and what you told me matters most, [Plan Name] looks like a good option for you."
"Here are the benefits of the plan." (List benefits in SOB)`}
          </ScriptBox>

          <ScriptBox verbatim>
            {`"Do you have any questions about the benefits we just reviewed?"
"You will receive your Summary of Benefits and Evidence of Coverage in the mail or by email if chosen during enrollment. The Evidence of Coverage is a detailed explanation of all services covered by the carrier."
"You have the right to cancel your plan at any time before the effective date by calling the carrier directly. I will give you that number at the end of this call." If you are ready to enroll, we will move to the enrollment process now."`}
          </ScriptBox>
        </>
      )}

      {unlocked.s6 && (
        <div className="part-b-toggle">
          <button
            className="secondary"
            onClick={() =>
              dispatch({ type: "TOGGLE_PRODUCT", field: "partBReduction" })
            }
          >
            Part B Premium Reduction Applies
          </button>

          {partBReduction && (
            <ScriptBox verbatim>
              {`"This plan includes a Part B premium reduction. There may be a delay â€” it can take one or more payment cycles to take effect."

"If your Part B premium comes out of Social Security, the reduction will show as an increase in your Social Security payment. If you pay Part B directly, you will receive a credit on your statement."

"Your Part B premium reduction for this plan is [amount], however that may change based on the amount you pay for Part B."`}
            </ScriptBox>
          )}
        </div>
      )}

      <div className="section-next-action">
        <SectionAdvanceButton
          disabled={!neadsOk || sobOk}
          ariaLabel="Mark plan reviewed"
          title="Mark plan reviewed"
          onClick={() =>
            dispatch({ type: "SET_GATE", field: "sobOk", value: true })
          }
        />
      </div>

      <SectionCoach stepName="Plan Selection & SOB" sectionNum={6} />

      {!neadsOk && <LockText>Locked until NEADS is complete.</LockText>}
    </section>
  );
});
