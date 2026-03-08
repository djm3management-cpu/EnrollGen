import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionTimer } from "./SharedUI";
import SectionCoach from "./SectionCoach";

export default React.memo(function SectionTPMO() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { recordingOk, tpmoOk, tpmoZip, tpmoOrgs, tpmoPlans } = state;
  const isActive = activeSection === 2;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s2 ? "" : "disabled"
      }`}
    >
      <h2>
        2) TPMO Disclaimer & Federal Contracting Statement
        <SectionTimer sectionNum={2} timestamps={state.sectionTimestamps} />
      </h2>

      <div className="field-group">
        <label className="field-label">
          TPMO Counts (auto-fills disclosure)
        </label>

        <div className="tpmo-inputs">
          <input
            value={tpmoZip}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              dispatch({ type: "SET_FIELD", field: "tpmoZip", value: val });
            }}
            placeholder="ZIP"
            maxLength={5}
            className="input-dark input-zip"
            inputMode="numeric"
          />

          <input
            value={tpmoOrgs}
            onChange={(e) =>
              dispatch({
                type: "SET_FIELD",
                field: "tpmoOrgs",
                value: e.target.value,
              })
            }
            placeholder="# of Organizations"
            className="input-dark input-flex"
          />

          <input
            value={tpmoPlans}
            onChange={(e) =>
              dispatch({
                type: "SET_FIELD",
                field: "tpmoPlans",
                value: e.target.value,
              })
            }
            placeholder="# of Plans"
            className="input-dark input-flex"
          />
        </div>
      </div>

      {unlocked.s2 && (
        <ScriptBox verbatim>
          {`"Can I please have your Zipcode?" "May I have your First and Last Name" "May I have a phone number to call you back?"

"We do not offer every plan available in your area. Currently we represent ${
            tpmoOrgs || "[number of organizations]"
          } organizations which offer ${
            tpmoPlans || "[number of plans]"
          } products in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options. Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract and/or a Medicare-approved Part D sponsor. Enrollment in the plan depends on the plan's contract renewal with Medicare."`}
        </ScriptBox>
      )}

      <div className="section-next-action">
        <button
          className="primary"
          disabled={!recordingOk || tpmoOk}
          onClick={() =>
            dispatch({
              type: "SET_GATE",
              field: "tpmoOk",
              value: true,
            })
          }
        >
          {tpmoOk ? "✅ TPMO Complete" : "TPMO Complete"}
        </button>
      </div>

      <SectionCoach stepName="TPMO Disclaimer" sectionNum={2} />

      {!recordingOk && (
        <LockText>Locked until Recording Disclosure is complete.</LockText>
      )}
      {recordingOk && !tpmoOk && (
        <LockText>Complete TPMO to continue.</LockText>
      )}
    </section>
  );
});
