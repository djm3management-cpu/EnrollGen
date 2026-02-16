import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, CheckItem, LockText, SectionTimer } from "./SharedUI";

export default React.memo(function SectionNEADS() {
  const { state, dispatch, activeSection, unlocked, preEnrollAllDone } =
    useScript();
  const { qualOk, neadsOk, preEnrollChecks } = state;
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
          {`NEADS Analysis Questions.

"I am going to ask you some optional questions to help determine the plans best suited for your needs."

Review current coverage and carrier. Open and review plan benefits for comparison.

"Who is your current primary care physician?" Confirm location.

"Do you see any specialists? If so, who?" Confirm location.

"Is there a particular hospital or any other preferred facilities we should check network status for?" Confirm location.

"What medications do you take regularly?" Confirm medications if already populated in Sunfire. Confirm full name and spelling, dosage, form, and quantity. How many times per day they take it and whether it is refilled monthly or every three months.

Remove any medications listed that the beneficiary is not currently taking and correct any wrong dosages.

"What do you usually pay for each medication?" Quantify per month and per year.

"Which pharmacy do you use to fill your prescriptions? Do you use mail order?"

Recommend a preferred pharmacy with the carrier for lower medication costs.

"What do you enjoy about your current coverage? Any benefits, doctors, hospitals, cost, or other feature preferences?"

"What would you add or alter to have coverage you would like even more?"

"Some people also ask about dental or vision coverage that's separate from Medicare. We'll finish your Medicare first, and I can touch on that at the end if you'd like." (CHECK DENTAL BOX AFTER ENROLLMENT)

"What are you hoping to gain by changing your coverage arrangement?"

"Is anything more important to you, such as health benefits versus prescription drug benefits?"

"Do you have any preference for plan types, such as HMO or PPO?"

"Is travel or living elsewhere at times part of your lifestyle?"

5.2 NEADS Analysis: Pre-Enrollment Checklist.
*Current coverage and doctors.
*Primary care providers and specialists, providers are in the plan's network.
*Prescription drug coverage and costs, beneficiary's current prescriptions are covered.
*Costs of health care services.
*Premiums, plan premium amount monthly, quarterly, annually, Medicare Part B premium.
*Durable medical equipment, physical therapy, extra benefits

Agent recap and summary statement:

"I'll summarize my notes for you. Did we get it all?"

 "Do you have any other health care needs?"
 "Some people also like to make sure their family isn't left with expenses later on. That's not part of Medicare, but I can mention it briefly at the end if it's ever something you want to hear about." (CHECK FINAL EXPENSE BUTTON AFTER ENROLLMENT)`}
        </ScriptBox>
      )}

      <h3>Pre-Enrollment Checklist</h3>

      <div className="checklist">
        <CheckItem
          value={preEnrollChecks.providers}
          label="Provider network reviewed"
          disabled={!qualOk}
          onChange={(v) =>
            dispatch({
              type: "SET_PRE_ENROLL_CHECK",
              field: "providers",
              value: v,
            })
          }
        />
        <CheckItem
          value={preEnrollChecks.rx}
          label="Prescription coverage reviewed"
          disabled={!qualOk}
          onChange={(v) =>
            dispatch({ type: "SET_PRE_ENROLL_CHECK", field: "rx", value: v })
          }
        />
        <CheckItem
          value={preEnrollChecks.costs}
          label="Copays / cost sharing reviewed"
          disabled={!qualOk}
          onChange={(v) =>
            dispatch({ type: "SET_PRE_ENROLL_CHECK", field: "costs", value: v })
          }
        />
        <CheckItem
          value={preEnrollChecks.moop}
          label="MOOP explained"
          disabled={!qualOk}
          onChange={(v) =>
            dispatch({ type: "SET_PRE_ENROLL_CHECK", field: "moop", value: v })
          }
        />
        <CheckItem
          value={preEnrollChecks.rules}
          label="Plan rules (HMO/PPO) explained"
          disabled={!qualOk}
          onChange={(v) =>
            dispatch({ type: "SET_PRE_ENROLL_CHECK", field: "rules", value: v })
          }
        />
        <CheckItem
          value={preEnrollChecks.coverageImpact}
          label="Effect on current coverage explained"
          disabled={!qualOk}
          onChange={(v) =>
            dispatch({
              type: "SET_PRE_ENROLL_CHECK",
              field: "coverageImpact",
              value: v,
            })
          }
        />
      </div>

      <button
        className="primary"
        disabled={!qualOk || !preEnrollAllDone}
        onClick={() =>
          dispatch({ type: "SET_GATE", field: "neadsOk", value: true })
        }
      >
        Mark NEADS Complete
      </button>

      {!qualOk && (
        <LockText>Locked until Qualifications are complete.</LockText>
      )}
      {qualOk && !preEnrollAllDone && (
        <LockText>Complete the Pre-Enrollment Checklist to proceed.</LockText>
      )}
    </section>
  );
});
