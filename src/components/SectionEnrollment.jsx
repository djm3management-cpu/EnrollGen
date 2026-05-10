import React from "react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";

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
    <div
      style={{
        background: "var(--eg-amber-dim)",
        border: "1px solid var(--eg-border)",
        borderRadius: "var(--eg-radius-md)",
        padding: "10px 14px",
        marginBottom: 12,
        fontFamily: "var(--eg-font-body)",
        fontSize: 11.5,
        color: "var(--eg-amber-text)",
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          fontFamily: "var(--eg-font-mono)",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--eg-amber)",
          marginBottom: 6,
        }}
      >
        Pre-enrollment checklist, {gaps.length} item
        {gaps.length !== 1 ? "s" : ""} open
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 16,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {gaps.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </div>
  );
}

export default React.memo(function SectionEnrollment() {
  const { state, dispatch, activeSection, unlocked, enrollmentCodeOk } =
    useScript();
  const { sobOk, enrollOk, notes } = state;
  const isActive = activeSection === 7;
  const handleNoEnrollmentWrapUp = () => {
    dispatch({
      type: "SET_NOTE",
      field: "callOutcome",
      value: "not_enrolled",
    });
    dispatch({ type: "SET_GATE", field: "enrollOk", value: true });
  };

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s7 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={7} timestamps={state.sectionTimestamps} />
      <h2>7) Enrollment</h2>

      {unlocked.s7 && (
        <>
          <ScriptBox verbatim>
            {`"I can enroll you today over the telephone in this [plan name with plan code]. Enrolling in this plan will replace your current [coverage type]. Once approved by Medicare, your new coverage begins on [effective date]. Would you like to proceed?"
(Complete enrollment on Sunfire and read all disclosures) `}
          </ScriptBox>

          <ScriptBox verbatim>
            {`"Your enrollment application has been successfully submitted. Your application number is [application ID#]."
"[Carrier]'s Customer Service number is [phone and TTY]."
"Your proposed effective date is [effective date], subject to approval by Medicare."
"You will receive a notice in the mail acknowledging your enrollment. Plan materials and your member ID card should arrive within 7 to 10 business days, but no later than 10 days before your effective date. You can also access materials online at [carrier URL]."
"If you have any questions or your needs change, you can reach us at [EnrollHere number] or our office at [office number]."`}
          </ScriptBox>
        </>
      )}

      <div className="grid">
        <label>
          Carrier (local note)
          <input
            disabled={!sobOk}
            value={notes.carrierName}
            onChange={(e) =>
              dispatch({
                type: "SET_NOTE",
                field: "carrierName",
                value: e.target.value,
              })
            }
            placeholder="Carrier"
          />
        </label>

        <label>
          Plan Name (local note)
          <input
            disabled={!sobOk}
            value={notes.planName}
            onChange={(e) =>
              dispatch({
                type: "SET_NOTE",
                field: "planName",
                value: e.target.value,
              })
            }
            placeholder="Plan name"
          />
        </label>

        <label>
          Plan ID (local note)
          <input
            disabled={!sobOk}
            value={notes.planId}
            onChange={(e) =>
              dispatch({
                type: "SET_NOTE",
                field: "planId",
                value: e.target.value,
              })
            }
            placeholder="Contract / PBP / plan ID"
          />
        </label>

        <label>
          Effective Date (local note)
          <input
            disabled={!sobOk}
            value={notes.effectiveDate}
            onChange={(e) =>
              dispatch({
                type: "SET_NOTE",
                field: "effectiveDate",
                value: e.target.value,
              })
            }
            placeholder="MM/DD/YYYY"
          />
        </label>
      </div>

      {isActive && !enrollOk && <PreEnrollCheck state={state} />}

      <div className="section-next-action section-next-action-wrap">
        <SectionAdvanceButton
          disabled={!sobOk || enrollOk}
          ariaLabel="Mark enrollment complete"
          title="Mark enrollment complete"
          onClick={() =>
            dispatch({ type: "SET_GATE", field: "enrollOk", value: true })
          }
        />
        <button
          type="button"
          className="secondary no-enrollment-wrapup-btn"
          disabled={!sobOk || enrollOk}
          onClick={handleNoEnrollmentWrapUp}
        >
          No Enrollment - Wrap Up
        </button>
      </div>

      {/* Enrollment Code + Green Check */}
      <div className="enrollment-code">
        <label>
          Enrollment / Application ID (enter after submission)
          <div className="enrollment-code-row">
            <input
              disabled={!enrollOk}
              value={notes.enrollmentCode}
              onChange={(e) =>
                dispatch({
                  type: "SET_NOTE",
                  field: "enrollmentCode",
                  value: e.target.value,
                })
              }
              placeholder="Enrollment / Application #"
              className="input-flex"
            />
            <span
              className={`enrollment-check ${
                enrollOk && enrollmentCodeOk ? "visible" : ""
              }`}
              title="Entered"
              aria-hidden="true"
            />
          </div>
        </label>
        {!enrollOk && (
          <LockText>
            Enter Enrollment/Application ID after Enrollment is submitted.
          </LockText>
        )}
      </div>

      {!sobOk && <LockText>Locked until SOB Review is complete.</LockText>}
    </section>
  );
});
