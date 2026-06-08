import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useU65 } from "../flows/u65/U65Context";
import { useU65CopilotEngine } from "../hooks/useU65CopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useSessionTracker } from "../hooks/useSessionTracker";
import CompactCopilotRail from "./CompactCopilotRail";
import CrossSellTrigger from "./copilot/CrossSellTrigger";

const U65Copilot = memo(function U65Copilot({ onTranscriptChange }) {
  const { state, dispatch, activeGate } = useU65();
  const transcriptRef = useRef("");
  const { startSession, endSession, logComplianceFlag } = useSessionTracker();
  const sessionStartedRef = useRef(false);
  const finalGateRef = useRef(activeGate);
  const completedRef = useRef(false);

  const copilot = useU65CopilotEngine({ transcriptRef, activeGate, state, logComplianceFlag });
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
    completedRef.current = Boolean(state.gate7Ok);
  }, [activeGate, state.gate7Ok]);

  useEffect(() => {
    if (state.callStarted && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      startSession("u65");
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
      extraWidgets={
        <CrossSellTrigger
          primaryProduct="U65"
          primaryCarrier=""
          clientAge={state.clientProfile?.age}
          clientState={state.clientProfile?.state}
          enrolled={Boolean(state.gate7Ok)}
          acknowledged={Boolean(state.crossSellAcknowledged)}
          onAcknowledged={(payload) =>
            dispatch({
              type: "SET_CROSS_SELL_ACKNOWLEDGED",
              value: true,
              payload,
            })
          }
        />
      }
    />
  );
});

export default U65Copilot;
