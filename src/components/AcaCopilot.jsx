import { memo, useCallback, useEffect, useRef } from "react";
import { useACA } from "../flows/aca/ACAContext";
import { useAcaCopilotEngine } from "../hooks/useAcaCopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useMergedTranscript } from "../hooks/useMergedTranscript";
import { useSessionTracker } from "../hooks/useSessionTracker";
import CompactCopilotRail from "./CompactCopilotRail";

const AcaCopilot = memo(function AcaCopilot({ onTranscriptChange }) {
  const { state, activeGate } = useACA();
  const transcriptRef = useRef("");
  const { startSession, endSession, logComplianceFlag } = useSessionTracker();
  const sessionStartedRef = useRef(false);
  const finalGateRef = useRef(activeGate);
  const completedRef = useRef(false);

  const copilot = useAcaCopilotEngine({ transcriptRef, activeGate, state, logComplianceFlag });
  const speech = useSpeechRecognition({
    onNewFinal: copilot.scheduleCoaching,
    onSpokenQuestion: copilot.askCopilot,
    externalTranscriptRef: transcriptRef,
  });

  useEffect(() => {
    onTranscriptChange?.(speech.transcript);
  }, [onTranscriptChange, speech.transcript]);

  useEffect(() => {
    finalGateRef.current = activeGate;
    completedRef.current = Boolean(state.gate6Ok);
  }, [activeGate, state.gate6Ok]);

  useEffect(() => {
    if (state.callStarted && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      startSession("aca");
    }
    if (!state.callStarted && sessionStartedRef.current) {
      endSession(finalGateRef.current, completedRef.current);
      sessionStartedRef.current = false;
    }
  }, [state.callStarted, startSession, endSession]);

  useEffect(() => () => {
    if (sessionStartedRef.current) {
      endSession(finalGateRef.current, completedRef.current);
      sessionStartedRef.current = false;
    }
  }, [endSession]);

  const clearAll = useCallback(() => {
    speech.clearTranscript();
    copilot.clearFeed();
  }, [speech, copilot]);

  const { currentStep, coachingLoading } = copilot;
  const { listening, transcript, transcriptRows, supportsRecognition } = speech;
  const { liveTranscript: mergedEntries } = useMergedTranscript({
    agentTranscriptRows: transcriptRows,
    agentInterim: speech.interimText?.trim()
      ? { speaker: "agent", text: speech.interimText, timestamp: Date.now(), isFinal: false }
      : null,
  });

  return (
    <CompactCopilotRail
      transcript={transcript}
      mergedEntries={mergedEntries}
      listening={listening}
      supportsRecognition={supportsRecognition}
      analyzing={coachingLoading}
      toggleLabel={`Gate ${activeGate}. ${currentStep}`}
      startTime={state.callStart}
      sessionActive={state.callStarted}
      onToggleListening={listening ? speech.stop : speech.start}
      onClear={clearAll}
      onAnalyze={() => copilot.requestCoaching({ manual: true })}
    />
  );
});

export default AcaCopilot;
