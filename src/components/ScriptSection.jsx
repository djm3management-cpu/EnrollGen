import React from "react";
import { ShieldCheck } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";

function unlockKey(sectionNumber) {
  return `s${String(sectionNumber).replace(".", "_")}`;
}

function PreEnrollCheck({ state }) {
  const gaps = [];
  if (!state.recordingOk) gaps.push("Recording Disclosure not marked complete");
  if (!state.tpmoOk) gaps.push("TPMO Disclaimer not marked complete");
  if (!state.soaOk) gaps.push("Scope of Appointment not marked complete");
  if (!state.qualOk) gaps.push("Qualifications not marked complete");
  if (!state.neadsOk) gaps.push("NEADS Assessment not marked complete");
  if (!state.sobOk) gaps.push("Plan Selection & SOB not marked complete");
  if (!state.notes?.planName?.trim()) gaps.push("Plan name not entered");

  if (gaps.length === 0) return null;

  return (
    <div className="pre-enrollment-checklist">
      <div className="pre-enrollment-checklist-title">
        PRE-ENROLLMENT CHECKLIST - {gaps.length} ITEM{gaps.length !== 1 ? "S" : ""} OPEN
      </div>
      <ul>
        {gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
    </div>
  );
}

function EnrollmentExtras({ state, dispatch, disabled }) {
  const { notes, enrollOk } = state;
  const handleNoEnrollmentWrapUp = () => {
    dispatch({ type: "SET_NOTE", field: "callOutcome", value: "not_enrolled" });
    dispatch({ type: "SET_GATE", field: "enrollOk", value: true });
  };

  return (
    <>
      <div className="grid">
        {[
          ["Carrier (local note)", "carrierName", "Carrier"],
          ["Plan Name (local note)", "planName", "Plan name"],
          ["Plan ID (local note)", "planId", "Contract / PBP / plan ID"],
          ["Effective Date (local note)", "effectiveDate", "MM/DD/YYYY"],
        ].map(([label, field, placeholder]) => (
          <label key={field}>
            {label}
            <input
              disabled={disabled}
              value={notes[field]}
              onChange={(event) =>
                dispatch({ type: "SET_NOTE", field, value: event.target.value })
              }
              placeholder={placeholder}
            />
          </label>
        ))}
      </div>

      {!enrollOk ? <PreEnrollCheck state={state} /> : null}

      <button
        type="button"
        className="secondary no-enrollment-wrapup-btn"
        disabled={disabled || enrollOk}
        onClick={handleNoEnrollmentWrapUp}
      >
        No Enrollment - Wrap Up
      </button>

      <div className="enrollment-code">
        <label>
          Enrollment / Application ID (enter after submission)
          <div className="enrollment-code-row">
            <input
              disabled={!enrollOk}
              value={notes.enrollmentCode}
              onChange={(event) =>
                dispatch({
                  type: "SET_NOTE",
                  field: "enrollmentCode",
                  value: event.target.value,
                })
              }
              placeholder="Enrollment / Application #"
              className="input-flex"
            />
            <span
              className={`enrollment-check ${
                enrollOk && (notes.enrollmentCode || "").trim().length >= 4 ? "visible" : ""
              }`}
              title="Entered"
              aria-hidden="true"
            />
          </div>
        </label>
      </div>
    </>
  );
}

function SobExtras({ state, dispatch, unlocked }) {
  if (!unlocked) return null;

  return (
    <div className="part-b-toggle">
      <button
        type="button"
        className={`secondary part-b-premium-trigger${state.partBReduction ? " is-active" : ""}`}
        aria-pressed={state.partBReduction}
        onClick={() => dispatch({ type: "TOGGLE_PRODUCT", field: "partBReduction" })}
      >
        Part B Premium Reduction Applies
      </button>

      {state.partBReduction ? (
        <ScriptBox verbatim editable={false}>
          {`"This plan includes a Part B premium reduction. There may be a delay - it can take one or more payment cycles to take effect."

"If your Part B premium comes out of Social Security, the reduction will show as an increase in your Social Security payment. If you pay Part B directly, you will receive a credit on your statement."

"Your Part B premium reduction for this plan is [amount], however that may change based on the amount you pay for Part B."`}
        </ScriptBox>
      ) : null}
    </div>
  );
}

export default React.memo(function ScriptSection({ section }) {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const sectionNumber = Number(section.section_number);
  const gateField = section.gate_field;
  const isActive = activeSection === sectionNumber;
  const isUnlocked = sectionNumber === 1 || Boolean(unlocked[unlockKey(sectionNumber)]);
  const gateDone = gateField ? Boolean(state[gateField]) : false;
  const isEnrollment = section.key === "enrollment";
  const isSob = section.key === "sob";

  return (
    <section className={`card ${isActive ? "active-card" : ""} ${isUnlocked ? "" : "disabled"}`}>
      <SectionToast sectionNum={sectionNumber} timestamps={state.sectionTimestamps} />
      <h2 className="script-section-title">
        <span>{sectionNumber}) {section.title}</span>
        {section.compliance_locked ? (
          <ShieldCheck size={16} aria-hidden="true" className="script-section-lock" />
        ) : null}
      </h2>

      {isUnlocked ? (
        <ScriptBox verbatim={section.verbatim !== false} editable={!section.compliance_locked}>
          {section.body || ""}
        </ScriptBox>
      ) : null}

      {isSob ? <SobExtras state={state} dispatch={dispatch} unlocked={isUnlocked} /> : null}
      {isEnrollment ? (
        <EnrollmentExtras state={state} dispatch={dispatch} disabled={!state.sobOk} />
      ) : null}

      {gateField ? (
        <div className={`section-next-action${isEnrollment ? " section-next-action-wrap" : ""}`}>
          <SectionAdvanceButton
            disabled={!isUnlocked || gateDone}
            ariaLabel={`Mark ${section.title} complete`}
            title={`Mark ${section.title} complete`}
            onClick={() =>
              dispatch({ type: "SET_GATE", field: gateField, value: true })
            }
          />
        </div>
      ) : null}

      {isUnlocked && gateField && !gateDone && section.lock_message ? (
        <LockText>{section.lock_message}</LockText>
      ) : null}
    </section>
  );
});
