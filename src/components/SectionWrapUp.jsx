import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionToast } from "./SharedUI";

export default React.memo(function SectionWrapUp() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const {
    enrollOk,
    notes,
  } = state;
  const isActive = activeSection === 8;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s8 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={8} timestamps={state.sectionTimestamps} />
      <h2>
        8) Wrap-Up
      </h2>

      {unlocked.s8 && (
        <>
          <ScriptBox verbatim>
            {`"Great news, your Medicare enrollment is all set."

Call closing: "It's been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too."
End the call: "Thank you for [calling/choosing] [Carrier name] and have a great day!"`}
          </ScriptBox>
        </>
      )}

      <label>
        Confirmation Number (local note)
        <input
          disabled={!enrollOk}
          value={notes.confirmation}
          onChange={(e) =>
            dispatch({
              type: "SET_NOTE",
              field: "confirmation",
              value: e.target.value,
            })
          }
          placeholder="Confirmation / reference #"
        />
      </label>

      {!enrollOk && (
        <LockText>Locked until Enrollment is marked submitted.</LockText>
      )}
      {enrollOk && (
        <p className="ok">
          ✅ Flow complete. (No data saved — local session only.)
        </p>
      )}
    </section>
  );
});
