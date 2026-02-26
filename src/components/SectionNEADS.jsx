import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionTimer } from "./SharedUI";
import SectionCoach from "./SectionCoach";

export default React.memo(function SectionNEADS() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { qualOk, neadsOk } = state;
  const isActive = activeSection === 5;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s5 ? "" : "disabled"
      }`}
    >
      <h2>
        5) NEADS Assessment
        <SectionTimer sectionNum={5} timestamps={state.sectionTimestamps} />
      </h2>

      {unlocked.s5 && (
        <ScriptBox verbatim>
          {`"I am going to ask you a few quick questions to make sure I find the best plan for your needs."
(Review current coverage and carrier. Open each plans Summary of Benefits for comparison.)      
"Who is your current primary care physician?" (Confirm location)
"Do you see any specialists? If so, who?" (Confirm location)
"Is there a particular hospital or facility you want to make sure is covered?"
"What medications do you take regularly?" (Confirm medications if already populated in Sunfire. Confirm full name & doseage)
"Which pharmacy do you use?"
"Is there anything specific about your current plan that you want to make sure your new plan has?"
*Review Provider network status for PCP and specialists
*Review Prescription drug coverage and costs
*Review Plan premiums and Part B premium
"Let me summarize what we've covered. Does that sound right? Anything else I should know before we look at plans?"
"Some people also ask about dental, vision, or final expense coverage. We can touch on that after we finish your Medicare if you're interested."
(CHECK DENTAL AND FINAL EXPENSE BUTTONS AFTER ENROLLMENT)`}
        </ScriptBox>
      )}

      <button
        className="primary"
        disabled={!qualOk || neadsOk}
        onClick={() =>
          dispatch({ type: "SET_GATE", field: "neadsOk", value: true })
        }
      >
        {neadsOk ? "✅ NEADS Reviewed" : "NEADS Reviewed"}
      </button>

      <SectionCoach stepName="NEADS Assessment" />

      {!qualOk && (
        <LockText>Locked until Qualifications are complete.</LockText>
      )}
    </section>
  );
});
