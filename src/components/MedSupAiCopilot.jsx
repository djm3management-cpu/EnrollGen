import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useMedSup } from "../context/MedSupContext";
import { useMedSupCopilotEngine } from "../hooks/useMedSupCopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { MEDSUP_LEVEL_STYLE } from "../data/medSupComplianceKnowledge";
import CompactCopilotRail from "./CompactCopilotRail";

const MEDSUP_ALERT_LABELS = {
  critical: "CRITICAL ALERT",
  warn: "WARNING",
  tip: "TIP",
  remind: "REMINDER",
  info: "MED SUP CO-PILOT",
};

const MedSupAiCopilot = memo(function MedSupAiCopilot({
  onTranscriptChange,
}) {
  const { state, activeSection } = useMedSup();
  const transcriptRef = useRef("");

  const copilot = useMedSupCopilotEngine({
    transcriptRef,
    activeSection,
    state,
  });
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

  const { currentStep, coachingLoading, floatingAlert, complianceScore } = copilot;
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
      floatingAlert={floatingAlert}
      onDismissAlert={() => copilot.setFloatingAlert(null)}
      levelStyles={MEDSUP_LEVEL_STYLE}
      alertLabels={MEDSUP_ALERT_LABELS}
      defaultAlertLabel="MED SUP CO-PILOT"
    />
  );
});

export default MedSupAiCopilot;
