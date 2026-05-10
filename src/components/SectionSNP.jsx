import React from "react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";

export default React.memo(function SectionSNP() {
  const { state, dispatch, activeSection } = useScript();
  const { tpmoOk, snpType, snpOk } = state;
  const isActive = activeSection === 2.5;

  if (!tpmoOk || !isActive || !snpType) return null;

  return (
    <section className={`card ${isActive ? "active-card" : ""}`}>
      <SectionToast sectionNum={2.5} timestamps={state.sectionTimestamps} />
      <h2>
        Special Needs Plan Disclosure
      </h2>

      {snpType === "DSNP" && (
        <ScriptBox verbatim>
          {`"In your area we do offer Dual Eligible Special Needs Plans. These are plans specifically designed for individuals who have both Medicare and Medicaid. Would you like to hear more about this plan?"

(If yes)

"Your ability to enroll in this special needs plan is based on verification that you are entitled to both Medicare and the qualifying level of Medicaid."`}
        </ScriptBox>
      )}

      {snpType === "CSNP" && (
        <ScriptBox verbatim>
          {`"In your area we do offer Chronic Care Special Needs Plans. These are plans specifically designed for individuals who have been diagnosed with certain chronic conditions such as diabetes or cardiovascular disease. Would you like to hear more about this plan?"

(If yes)

"There is a physician verification process required to confirm your chronic condition by the end of the first month of enrollment in the new plan. You are responsible for ensuring that the form is completed and returned. If not completed, your enrollment in the C-SNP will be voided. The process may vary by carrier. Please see your new member materials."`}
        </ScriptBox>
      )}

      {snpType && (
        <div className="section-next-action">
          <SectionAdvanceButton
            disabled={snpOk}
            ariaLabel="Mark SNP disclosure complete"
            title="Mark SNP disclosure complete"
            onClick={() =>
              dispatch({
                type: "SET_GATE",
                field: "snpOk",
                value: true,
              })
            }
          />
        </div>
      )}

      {snpType && !snpOk && (
        <LockText>Complete SNP disclosure to continue.</LockText>
      )}
    </section>
  );
});
