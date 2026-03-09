import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionTimer, SectionToast } from "./SharedUI";
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
        <SectionTimer sectionNum={1} timestamps={state.sectionTimestamps} />
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
        }. I am a licensed sales agent on a recorded line. Who do I have the pleasure of speaking with?" "Please know our call will be recorded for quality and training purposes; is it ok if I continue?" "So (Client's Name), we are reaching out because it is Open Enrollment and unfortunately a lot of people made changes to their Medicare Advantage plans during the Annual Enrollment Period and were misinformed about their doctors being covered, prescription cost, and the benefits of the plan. I want to make sure you are receiving all of the benefits you are ENTITLED to like the grocery benefit & part B giveback as well as making sure you can see ALL of your doctors.`}
      </ScriptBox>

      <div className="section-next-action">
        <button
          className="primary"
          disabled={recordingOk}
          onClick={() =>
            dispatch({
              type: "SET_GATE",
              field: "recordingOk",
              value: true,
            })
          }
        >
          {recordingOk
            ? "✅ Recording Disclosure Complete"
            : "Recording Disclosure Complete"}
        </button>
      </div>

      <SectionCoach stepName="Recording Disclosure" sectionNum={1} />

      {!recordingOk && (
        <LockText>Complete Recording Disclosure to continue.</LockText>
      )}
    </section>
  );
});
