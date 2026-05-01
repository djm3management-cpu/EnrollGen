import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useU65 } from "../flows/u65/U65Context";
import { useU65CopilotEngine } from "../hooks/useU65CopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import CompactCopilotRail from "./CompactCopilotRail";

const U65Copilot = memo(function U65Copilot({ onTranscriptChange }) {
  const { state, activeGate } = useU65();
  const transcriptRef = useRef("");

  const copilot = useU65CopilotEngine({ transcriptRef, activeGate, state });
  const speech = useSpeechRecognition({
    onNewFinal: copilot.scheduleCoaching,
    onSpokenQuestion: copilot.askCopilot,
    externalTranscriptRef: transcriptRef,
  });

  useEffect(() => {
    onTranscriptChange?.(speech.transcript);
  }, [onTranscriptChange, speech.transcript]);

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
      toggleLabel={`Gate ${activeGate}. ${currentStep}`}
      startTime={state.callStart}
      sessionActive={state.callStarted}
      onToggleListening={listening ? speech.stop : speech.start}
      onClear={clearAll}
      onAnalyze={() => copilot.requestCoaching({ manual: true })}
    />
  );
});

export default U65Copilot;
