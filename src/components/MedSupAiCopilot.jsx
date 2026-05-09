import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useMedSup } from "../context/MedSupContext";
import { useMedSupCopilotEngine } from "../hooks/useMedSupCopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useSessionTracker } from "../hooks/useSessionTracker";
import CompactCopilotRail from "./CompactCopilotRail";

const MedSupAiCopilot = memo(function MedSupAiCopilot({
  onTranscriptChange,
}) {
  const { state, activeSection } = useMedSup();
  const transcriptRef = useRef("");
  const { startSession, endSession, logComplianceFlag } = useSessionTracker();
  const sessionStartedRef = useRef(false);
  const finalSectionRef = useRef(activeSection);
  const completedRef = useRef(false);

  const copilot = useMedSupCopilotEngine({
    transcriptRef,
    activeSection,
    state,
    logComplianceFlag,
  });
  const speech = useSpeechRecognition({
    onNewFinal: copilot.scheduleCoaching,
    onSpokenQuestion: copilot.askCopilot,
    externalTranscriptRef: transcriptRef,
  });

  useEffect(() => {
    onTranscriptChange?.(speech.transcript);
  }, [onTranscriptChange, speech.transcript]);

  useEffect(() => {
    finalSectionRef.current = activeSection;
    completedRef.current = Boolean(state.wrapOk);
  }, [activeSection, state.wrapOk]);

  useEffect(() => {
    if (state.callStarted && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      startSession("medsup");
    }
    if (!state.callStarted && sessionStartedRef.current) {
      endSession(finalSectionRef.current, completedRef.current);
      sessionStartedRef.current = false;
    }
  }, [state.callStarted, startSession, endSession]);

  useEffect(() => () => {
    if (sessionStartedRef.current) {
      endSession(finalSectionRef.current, completedRef.current);
      sessionStartedRef.current = false;
    }
  }, [endSession]);

  const clearAll = useCallback(() => {
    speech.clearTranscript();
    copilot.clearFeed();
  }, [speech, copilot]);

  const { currentStep, coachingLoading, complianceScore } = copilot;
  const { listening, transcript, transcriptRows, supportsRecognition } = speech;
  const mergedEntries = useMemo(
    () =>
      transcriptRows.map((row) => ({
        speaker: "agent",
        isFinal: true,
        text: row.text,
        timestamp: row.timestamp || new Date().toISOString(),
      })),
    [transcriptRows]
  );

  return (
    <CompactCopilotRail
      transcript={transcript}
      mergedEntries={mergedEntries}
      listening={listening}
      supportsRecognition={supportsRecognition}
      analyzing={coachingLoading}
      score={complianceScore.score}
      toggleLabel={`Section ${activeSection}. ${currentStep}`}
      startTime={state.callStart}
      sessionActive={state.callStarted}
      onToggleListening={listening ? speech.stop : speech.start}
      onClear={clearAll}
      onAnalyze={() => copilot.requestCoaching({ manual: true })}
    />
  );
});

export default MedSupAiCopilot;
