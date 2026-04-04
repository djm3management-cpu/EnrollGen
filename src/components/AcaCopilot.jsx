import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useACA } from "../flows/aca/ACAContext";
import { useAcaCopilotEngine } from "../hooks/useAcaCopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { ACA_LEVEL_STYLE } from "../data/acaComplianceKnowledge";
import CompactCopilotRail from "./CompactCopilotRail";

const ACA_ALERT_LABELS = {
  critical: "CRITICAL ALERT",
  warn: "WARNING",
  tip: "TIP",
  remind: "REMINDER",
  info: "ACA CO-PILOT",
};

const AcaCopilot = memo(function AcaCopilot({ onTranscriptChange }) {
  const { state, activeGate } = useACA();
  const transcriptRef = useRef("");

  const copilot = useAcaCopilotEngine({ transcriptRef, activeGate, state });
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
      toggleLabel={`Gate ${activeGate}. ${currentStep}`}
      startTime={state.callStart}
      sessionActive={state.callStarted}
      onToggleListening={listening ? speech.stop : speech.start}
      onClear={clearAll}
      onAnalyze={() => copilot.requestCoaching({ manual: true })}
      floatingAlert={floatingAlert}
      onDismissAlert={() => copilot.setFloatingAlert(null)}
      levelStyles={ACA_LEVEL_STYLE}
      alertLabels={ACA_ALERT_LABELS}
      defaultAlertLabel="ACA CO-PILOT"
    />
  );
});

export default AcaCopilot;
