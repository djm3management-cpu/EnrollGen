import React, {useState} from "react";
import EnrollmentIntake from "./enrollment/EnrollmentIntake";
import {scriptIntakePrefill} from "../lib/enrollmentIntake.js";
import {getActiveSessionMetadata,waitForActiveSessionMetadata} from "../hooks/useSessionTracker";
import MAScriptBranches from "./MAScriptBranches";
import { getMAScriptView } from "../lib/maScriptFlow.js";
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

function EnrollmentExtras({ state, dispatch, disabled, intakeDisabled=disabled }) {
  const [callId,setCallId]=useState(null),[error,setError]=useState('');
  const open=async()=>{
    setError('');
    const metadata=getActiveSessionMetadata().callRecordId?getActiveSessionMetadata():await waitForActiveSessionMetadata();
    if(!metadata.callRecordId){setError('Call record is still syncing. Try again in a moment.');return;}
    setCallId(metadata.callRecordId);
  };
  return <>
    {!state.enrollOk ? <PreEnrollCheck state={state} /> : null}
    <button type="button" className="secondary" disabled={intakeDisabled} onClick={open}>Complete Enrollment Intake</button>
    {error&&<p className="ops-error" role="alert">{error}</p>}
    {callId&&<EnrollmentIntake callId={callId} initialPrefill={scriptIntakePrefill(state)} onClose={()=>setCallId(null)} onSaved={()=>dispatch({type:'SET_GATE',field:'enrollOk',value:true})}/>}
    <button data-key-role="secondary" type="button" className="secondary no-enrollment-wrapup-btn" disabled={disabled || state.enrollOk} onClick={()=>dispatch({type:'CLOSE_MA_SCRIPT',outcome:'not_interested'})}>No Enrollment - Wrap Up</button>
  </>;
}

export default React.memo(function ScriptSection({ section }) {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const sectionNumber = Number(section.section_number);
  const gateField = section.gate_field;
  const isActive = activeSection === sectionNumber;
  const isUnlocked = sectionNumber === 1 || Boolean(unlocked[unlockKey(sectionNumber)]);
  const gateDone = gateField ? Boolean(state[gateField]) : false;
  const isEnrollment = section.key === "enrollment";
  const view = section.nodes ? getMAScriptView(section, state) : null;

  return (
    <section className={`card ${isActive ? "active-card" : ""} ${isUnlocked ? "" : "disabled"}`}>
      <SectionToast sectionNum={sectionNumber} timestamps={state.sectionTimestamps} />
      <h2 className="script-section-title">
        <span>{sectionNumber}) {section.title}</span>
        {section.compliance_locked ? (
          <ShieldCheck size={16} aria-hidden="true" className="script-section-lock" />
        ) : null}
      </h2>

      {isUnlocked && view ? <MAScriptBranches view={view} sectionKey={section.key} dispatch={dispatch} /> : isUnlocked ? (
        <ScriptBox verbatim={section.verbatim !== false} editable={!section.compliance_locked}>
          {section.body || ""}
        </ScriptBox>
      ) : null}

      {isEnrollment ? (
        <EnrollmentExtras state={state} dispatch={dispatch} disabled={!state.sobOk} intakeDisabled={!isUnlocked || !view?.complete} />
      ) : null}

      {gateField && !isEnrollment ? (
        <div className={`section-next-action${isEnrollment ? " section-next-action-wrap" : ""}`}>
          <SectionAdvanceButton
            disabled={!isUnlocked || gateDone || (view && !view.complete)}
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
