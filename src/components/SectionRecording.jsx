import React from "react";
import { useScript } from "../context/ScriptContext";
import {
  ScriptBox,
  LockText,
  SectionAdvanceButton,
  SectionToast,
} from "./SharedUI";
import SectionCoach from "./SectionCoach";

export default React.memo(function SectionRecording() {
  const { state, dispatch, activeSection } = useScript();
  const { agentName, recordingOk } = state;
  const isActive = activeSection === 1;

  return (
    <section className={`card ${isActive ? "active-card" : ""}`}>
      <SectionToast sectionNum={1} timestamps={state.sectionTimestamps} />
      <h2>
        1) Recording Disclosure
      </h2>

      <div className="field-group">
        <label className="field-label">
          Agent Name (auto-fills disclosure)
        </label>
        <input
          value={agentName}
          onChange={(e) =>
            dispatch({
              type: "SET_FIELD",
              field: "agentName",
              value: e.target.value,
            })
          }
          placeholder="First and Last Name"
          className="input-dark"
        />
      </div>

      <ScriptBox verbatim>
        {`"Thank you for calling New Gen Health Solutions. My name is ${
          agentName || "[First & Last Name]"
        }. I am a licensed sales agent on a recorded line. Who do I have the pleasure of speaking with?" "Please know our call will be recorded for quality and training purposes; is it ok if I continue?" "So (Client's Name), we are reaching out to review your current Medicare coverage and see if you may qualify for a Special Enrollment Period, because provider networks, prescription costs, and plan benefits can change during the year. I want to make sure your plan is still meeting your needs and review any benefits that may be available to you based on your eligibility and location.`}
      </ScriptBox>

      <div className="section-next-action">
        <SectionAdvanceButton
          disabled={recordingOk}
          ariaLabel="Mark Recording Disclosure complete"
          title="Mark Recording Disclosure complete"
          onClick={() =>
            dispatch({
              type: "SET_GATE",
              field: "recordingOk",
              value: true,
            })
          }
        />
      </div>

      <SectionCoach stepName="Recording Disclosure" sectionNum={1} />

      {!recordingOk && (
        <LockText>Complete Recording Disclosure to continue.</LockText>
      )}
    </section>
  );
});
