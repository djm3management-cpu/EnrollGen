import { useScript } from "../context/ScriptContext";
import { MainTimer } from "./SharedUI";
import SectionRecording from "./SectionRecording";
import SectionTPMO from "./SectionTPMO";
import SectionSNP from "./SectionSNP";
import SectionSOA from "./SectionSOA";
import SectionQualifications from "./SectionQualifications";
import SectionNEADS from "./SectionNEADS";
import SectionSOB from "./SectionSOB";
import SectionEnrollment from "./SectionEnrollment";
import SectionWrapUp from "./SectionWrapUp";

export default function ScriptFlow() {
  const { state, dispatch } = useScript();

  return (
    <div className="flow">
      {/* Main TPMO Timer */}
      <MainTimer
        running={state.tpmoRunning}
        startTime={state.tpmoStart}
        onStart={() => dispatch({ type: "START_TIMER" })}
        onReset={() => dispatch({ type: "RESET_TIMER" })}
      />

      {/* Sequential enrollment flow sections */}
      <SectionRecording />
      <SectionTPMO />
      <SectionSNP />
      <SectionSOA />
      <SectionQualifications />
      <SectionNEADS />
      <SectionSOB />
      <SectionEnrollment />
      <SectionWrapUp />
    </div>
  );
}
