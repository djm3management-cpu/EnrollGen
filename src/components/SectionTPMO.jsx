import React from "react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";

export default React.memo(function SectionTPMO() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { recordingOk, tpmoOk } = state;
  const isActive = activeSection === 2;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s2 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={2} timestamps={state.sectionTimestamps} />
      <h2>
        2) TPMO Disclaimer & Federal Contracting Statement
      </h2>

      {unlocked.s2 && (
        <ScriptBox verbatim>
          {`"Can I please have your Zipcode?" "May I have your First and Last Name" "May I have a phone number to call you back?"

"We do not offer every plan available in your area. Currently we represent [number of organizations] organizations which offer [number of plans] products in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options. Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract and/or a Medicare-approved Part D sponsor. Enrollment in the plan depends on the plan's contract renewal with Medicare."`}
        </ScriptBox>
      )}

      <div className="section-next-action">
        <SectionAdvanceButton
          disabled={!recordingOk || tpmoOk}
          ariaLabel="Mark TPMO complete"
          title="Mark TPMO complete"
          onClick={() =>
            dispatch({
              type: "SET_GATE",
              field: "tpmoOk",
              value: true,
            })
          }
        />
      </div>

      {!recordingOk && (
        <LockText>Locked until Recording Disclosure is complete.</LockText>
      )}
      {recordingOk && !tpmoOk && (
        <LockText>Complete TPMO to continue.</LockText>
      )}
    </section>
  );
});
