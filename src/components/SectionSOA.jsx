import React from "react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";
import SectionCoach from "./SectionCoach";

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
      <SectionToast sectionNum={3} timestamps={state.sectionTimestamps} />
      <h2>
        3) Power of Attorney & Scope of Appointment
      </h2>

      {unlocked.s3 && isActive && (
        <>
          <ScriptBox verbatim>
            {`"Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for?"  (IF YES): "Are they available now or should we discuss at a later time when they are available?"`}
          </ScriptBox>

          <ScriptBox verbatim>
            {` "You are not obligated to enroll in a plan and agreeing to answer these questions does not affect your current enrollment nor will it enroll you in any Medicare Advantage Prescription Drug Plan, or other Medicare Plan. Do I have your permission to discuss the plans in your area which may include Medicare Advantage plans, Prescription drug plans, and other types of plans like Stand-alone Dental plan, Stand-alone Vision plans, and Hospital Indemnity Plans today?"  `}
          </ScriptBox>
        </>
      )}

      <div className="section-next-action">
        <SectionAdvanceButton
          disabled={!unlocked.s3 || soaOk}
          ariaLabel="Mark POA and SOA complete"
          title="Mark POA and SOA complete"
          onClick={() =>
            dispatch({
              type: "SET_GATE",
              field: "soaOk",
              value: true,
            })
          }
        />
      </div>

      <SectionCoach stepName="POA & Scope of Appointment" sectionNum={3} />

      {!tpmoOk && <LockText>Locked until TPMO is complete.</LockText>}
      {unlocked.s3 && !soaOk && (
        <LockText>SOA required before Needs Assessment.</LockText>
      )}
    </section>
  );
});
