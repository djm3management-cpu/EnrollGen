import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, CheckItem, LockText, SectionTimer } from "./SharedUI";

export default React.memo(function SectionEnrollment() {
  const {
    state,
    dispatch,
    activeSection,
    unlocked,
    enrollAllDone,
    enrollmentCodeOk,
  } = useScript();
  const { sobOk, enrollOk, enrollChecks, notes } = state;
  const isActive = activeSection === 7;

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
        <ScriptBox verbatim>
          {`INBOUND: "I can enroll you today over the telephone in this [specific plan name]. Enrolling in this plan today will replace your current coverage. Once approved by Medicare, your new coverage will begin on [effective date]. Would you like to proceed?"

"Based on what we have discussed, it sounds like you are interested in [plan name, type, and contract number with PBP]. Is that correct?"

"If you are currently enrolled in a Medicare Advantage plan, your current coverage will end once your new coverage starts."
"If you have Tricare, your coverage may be affected."
"If you have a Medigap plan, you may want to drop it once MA coverage begins."

"If you are ready to enroll, we will complete the application and process your signature.
Once completed, I will provide your application number and explain when to expect materials."

"[Carrier Name] is a Medicare Advantage organization with a Medicare contract.
Enrollment depends on contract renewal."
"[Plan Name] serves a specific service area. When the plan begins you must obtain benefits from [Carrier Name] as described in the Evidence of Coverage document. No payment will be issued for services that are not covered."

"You must keep Medicare Part A and Part B and continue paying your Part B premium."
"You can only be enrolled in one Medicare Advantage plan at a time."

MAPD Part D Statement:
This plan includes Part D prescription drug coverage. Network pharmacies must be used except in non-routine circumstances.

"If you have not had Medicare prescription drug coverage, or creditable coverage as good as Medicare's, you may have to pay a late enrollment penalty in addition to your premium for Medicare prescription drug coverage."

"Benefits, premiums, and cost-sharing may change on January 1."
"This is not a complete description of benefits. Refer to the Evidence of Coverage."
"Coverage outside the U.S. is limited." 

PRIVACY ACT STATEMENT:
"CMS collects information to track enrollment, improve care, and make payments. Your response is voluntary, but failure to respond may affect enrollment."

"Do you understand how the plan works?"
"If you receive help from a sales agent, broker, or other person employed by or contracted with [Carrier Name], they may be paid based on your enrollment."
"Do you understand and agree with the statements you have heard so far?"
"Do you understand that enrollment in this plan will disenroll you from your current plan?
"Are you ready to enroll in [plan name, type and contract number with PBP]?"

"Your enrollment application has been successfully submitted and the application number is[application ID]. [Plan name]'s Customer service number is [phone and TTY]."`}
        </ScriptBox>
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

      <h3>Enrollment Confirmations</h3>
      <div className="checklist">
        <CheckItem
          value={enrollChecks.epConfirmed}
          label="Election period / eligibility confirmed"
          disabled={!sobOk}
          onChange={(v) =>
            dispatch({
              type: "SET_ENROLL_CHECK",
              field: "epConfirmed",
              value: v,
            })
          }
        />
        <CheckItem
          value={enrollChecks.piiConsent}
          label="Consent to collect necessary information (PII) confirmed"
          disabled={!sobOk}
          onChange={(v) =>
            dispatch({
              type: "SET_ENROLL_CHECK",
              field: "piiConsent",
              value: v,
            })
          }
        />
        <CheckItem
          value={enrollChecks.planConfirm}
          label="Beneficiary confirmed plan selection"
          disabled={!sobOk}
          onChange={(v) =>
            dispatch({
              type: "SET_ENROLL_CHECK",
              field: "planConfirm",
              value: v,
            })
          }
        />
        <CheckItem
          value={enrollChecks.submitConsent}
          label="Beneficiary authorized submission of enrollment"
          disabled={!sobOk}
          onChange={(v) =>
            dispatch({
              type: "SET_ENROLL_CHECK",
              field: "submitConsent",
              value: v,
            })
          }
        />
      </div>

      <button
        className="primary"
        disabled={!sobOk || !enrollAllDone}
        onClick={() =>
          dispatch({ type: "SET_GATE", field: "enrollOk", value: true })
        }
      >
        Mark Enrollment Submitted
      </button>

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

      {!sobOk && <LockText>Locked until SOB Review is complete.</LockText>}
      {sobOk && !enrollAllDone && (
        <LockText>Complete all enrollment confirmations to proceed.</LockText>
      )}
    </section>
  );
});
