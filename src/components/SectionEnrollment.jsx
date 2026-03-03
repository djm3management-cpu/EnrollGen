import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionTimer } from "./SharedUI";
import SectionCoach from "./SectionCoach";
import { getDeterministicBlockers } from "../lib/deterministicBlockers";

export default React.memo(function SectionEnrollment() {
  const { state, dispatch, activeSection, unlocked, enrollmentCodeOk } =
    useScript();
  const { sobOk, enrollOk, notes } = state;
  const isActive = activeSection === 7;
  const blockers = getDeterministicBlockers(state);
  const activeBlockers = blockers.filter(
    (blocker) =>
      blocker.id !== "recording_missing" &&
      blocker.id !== "tpmo_missing" &&
      blocker.id !== "tpmo_zip_missing" &&
      blocker.id !== "tpmo_counts_missing" &&
      blocker.id !== "soa_missing" &&
      blocker.id !== "sob_missing"
  );

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s7 ? "" : "disabled"
      }`}
    >
      <h2>
        7) Enrollment
        <SectionTimer sectionNum={7} timestamps={state.sectionTimestamps} />
      </h2>

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

      <button
        className="primary"
        disabled={!sobOk || enrollOk || activeBlockers.length > 0}
        onClick={() =>
          dispatch({ type: "SET_GATE", field: "enrollOk", value: true })
        }
      >
        {enrollOk ? "✅ Enrollment Complete" : "Enrollment Complete"}
      </button>

      {activeBlockers.length > 0 && (
        <div
          style={{
            marginTop: 12,
            border: "1px solid rgba(248,113,113,0.28)",
            background: "rgba(127,29,29,0.16)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#fca5a5",
              marginBottom: 8,
            }}
          >
            Submission Blockers
          </div>
          {activeBlockers.slice(0, 4).map((blocker) => (
            <div
              key={blocker.id}
              style={{
                fontSize: "0.82rem",
                color: "#e8edf5",
                lineHeight: 1.45,
                marginTop: 6,
              }}
            >
              <strong>{blocker.label}:</strong> {blocker.detail}
            </div>
          ))}
        </div>
      )}

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
            >
              ✅
            </span>
          </div>
        </label>
        {!enrollOk && (
          <LockText>
            Enter Enrollment/Application ID after Enrollment is submitted.
          </LockText>
        )}
      </div>

      <SectionCoach stepName="Enrollment" />

      {!sobOk && <LockText>Locked until SOB Review is complete.</LockText>}
    </section>
  );
});
