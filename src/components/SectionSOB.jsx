import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionTimer } from "./SharedUI";
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
      <h2>
        6) Plan Selection & Summary of Benefits
        <SectionTimer sectionNum={6} timestamps={state.sectionTimestamps} />
      </h2>

      {unlocked.s6 && (
        <ScriptBox verbatim>
          {`"Based on everything we discussed during your NEADS assessment, including your doctors, prescriptions, coverage preferences, and costs, [plan name] appears to be a good option for you. I'm recommending this plan is because it aligns with what you told me was most important, such as your coverage needs, provider access, prescription costs, or overall out-of-pocket expenses."

"Before I go into the full benefit details, does this plan sound like something that could work for you?"
AGENT NOTE: State the dollar amounts for the current plan and the new plan when comparing benefits (Sunfire: Current Plan Summary of Benefits)

"This plan will have a monthly premium of [AMOUNT]."
"If applicable, this plan will have a medical deductible of [AMOUNT], and the Medicare Part B deductible is [AMOUNT]."

"For prescription drugs, this plan will have a Part D deductible of [AMOUNT], which applies to [TIERS]. Your prescription drugs will have copays or coinsurance of [AMOUNTS] based on their tier. Some medications may have requirements such as prior authorization, quantity limits, or step therapy, and those requirements have been reviewed. Any medications not covered on the formulary have been disclosed."

"Medicare prescription drug plans have different coverage stages throughout the year. The catastrophic coverage limit for this plan is [DOLLAR AMOUNT]. Once that amount is reached, your prescription drug costs will be significantly reduced for the remainder of the year."

"In-network inpatient hospital care will have a cost of [AMOUNT]."
"In-network outpatient hospital services will have a cost of [AMOUNT]."

"Even with Medicare Advantage, hospital stays are usually where most out-of-pocket costs happen. We'll finish your Medicare enrollment first, and I can mention an optional way some people prepare for that later if you want." (CHECK HOSPITAL INDEMNITY BOX IN WRAP UP AFTER ENROLLMENT)

"Primary care provider visits will have a cost of [AMOUNT]."
"Specialist visits will have a cost of [AMOUNT]."

"Inpatient and outpatient mental health services will have a cost of [AMOUNT]."
"Preventive services will have a cost of [AMOUNT]."

"Emergency room services will have a cost of [AMOUNT]."
"Urgently needed services will have a cost of [AMOUNT] when you are temporarily away from home."

"If this plan allows out-of-network coverage, out-of-network services will have a cost of [AMOUNT], which may be higher than in-network costs."

"This plan may include additional benefits such as dental, vision, hearing, or other benefits. Dental services will have a cost of [AMOUNT], vision services will have a cost of [AMOUNT], and hearing services will have a cost of [AMOUNT]. Access to these services must be through the plan's required network, vendor, or provider."

"Medicare generally does not cover care outside the United States. If this plan offers coverage outside the country, that coverage will have a cost of [AMOUNT]."`}
        </ScriptBox>
      )}

      {unlocked.s6 && (
        <ScriptBox verbatim>
          {`"Before making an enrollment decision, it is important that you fully understand the plan's benefits and rules. I will cover the plan requirements (disclosures), review the Pre-enrollment checklist and the Summary of Benefits and answer any questions you have. The pre-enrollment checklist, can also be reviewed on [carrier's name] website."

"Do you understand the benefits we discussed earlier or have any other questions before we get started?"
"You will be receiving your Summary of Benefits and your Evidence of Coverage in the mail or by email if chosen during enrollment.
"The Evidence of Coverage is a detailed explanation of the services provided by the carrier."
"You also have the right to cancel your plan at any time before the plan's effective date by calling the carrier directly. I will provide the carrier's member service number at the end of this call."
"Mr./Ms., if you are ready to enroll today, we will now move to the enrollment process."`}
        </ScriptBox>
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
              {`"This plan includes a Part B premium reduction. There may be a delay in the application of the Part B premium reduction."

"The reduction is not immediate and may take one or more payment cycles to take effect."

"If your Part B premium is deducted from your Social Security check, the reduction will appear as an increase in your Social Security payment."

"If your Part B premium is paid directly, you will receive a credit on your premium statement."

"For this plan, your Part B premium reduction is [amount], however this amount may change based on the amount you pay for Part B."`}
            </ScriptBox>
          )}
        </div>
      )}

      <button
        className="primary"
        disabled={!neadsOk || sobOk}
        onClick={() =>
          dispatch({ type: "SET_GATE", field: "sobOk", value: true })
        }
      >
        {sobOk ? "✅ Plan Reviewed" : "Plan Reviewed"}
      </button>

      <SectionCoach stepName="Plan Selection & SOB" />

      {!neadsOk && <LockText>Locked until NEADS is complete.</LockText>}
    </section>
  );
});
