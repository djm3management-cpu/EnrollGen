import { useRef, useEffect, useCallback, useState, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { useCustomerAudio } from "../hooks/useCustomerAudio";
import { useMergedTranscript } from "../hooks/useMergedTranscript";
import { useTrainingMode } from "../context/TrainingModeContext";

/* ═══════════════════════════════════════════════════════════════════
   ScriptPrompter, Headless copilot engine host.
   All visual controls now live in the right-rail CopilotControlStrip.
   This component owns hooks and transcript forwarding.
   ═══════════════════════════════════════════════════════════════════ */

const ScriptPrompter = memo(function ScriptPrompter({
  onTranscriptChange,
  onMergedTranscriptChange,
  onListeningChange,
  logComplianceFlag,
  controlsRef,
  onCoachingLoadingChange,
}) {
  const {
    state,
    activeSection,
    unlocked,
  } = useScript();

  const { enabled: trainingModeEnabled } = useTrainingMode();

  // Shared transcriptRef, created here, passed to both hooks
  const transcriptRef = useRef("");

  // Simulated transcript state (training mode only)
  const [simulatedTranscript, setSimulatedTranscript] = useState("");

  /* ─── Customer audio capture (opt-in via getDisplayMedia + Deepgram) ─── */
  const customerAudio = useCustomerAudio();

  /* ─── Speech recognition (agent mic) ─── */
  const speechRef = useRef(null);
  const speech = useSpeechRecognition({
    onNewFinal: (text) => speechRef.current?.scheduleCoaching?.(text),
    onSpokenQuestion: (q) => speechRef.current?.askCopilot?.(q),
    externalTranscriptRef: transcriptRef,
  });

  /* ─── Merged transcript (agent + customer) ─── */
  const {
    mergedTranscript,
    formattedTranscript,
    recentCustomerSpeech,
    hasCustomerAudio,
  } = useMergedTranscript({
    agentTranscriptRows: speech.transcriptRows,
    customerTranscript: customerAudio.customerTranscript,
    isCustomerCapturing: customerAudio.isCapturing,
  });

  /* ─── Copilot engine (coaching, ask, feed) ─── */
  const copilot = useCopilotEngine({
    transcriptRef,
    activeSection,
    state,
    unlocked,
    logComplianceFlag,
    hasCustomerAudio,
    formattedTranscript,
    recentCustomerSpeech,
  });

  // Wire speech callbacks to copilot (deferred to avoid circular init)
  useEffect(() => {
    speechRef.current = copilot;
  }, [copilot]);

  // Forward transcript changes to parent
  useEffect(() => {
    if (!onTranscriptChange) return;
    onTranscriptChange(trainingModeEnabled ? simulatedTranscript : speech.transcript);
  }, [
    speech.transcript,
    simulatedTranscript,
    trainingModeEnabled,
    onTranscriptChange,
  ]);

  // Keep transcriptRef in sync with simulated text in training mode so the
  // Co-Pilot engine reads the typed utterances instead of the empty mic feed.
  useEffect(() => {
    if (!trainingModeEnabled) return;
    transcriptRef.current = simulatedTranscript;
  }, [trainingModeEnabled, simulatedTranscript]);

  // Forward merged transcript entries for MiniLiveTranscript in the right rail
  useEffect(() => {
    if (onMergedTranscriptChange) onMergedTranscriptChange(mergedTranscript);
  }, [mergedTranscript, onMergedTranscriptChange]);

  // Forward listening state
  useEffect(() => {
    if (onListeningChange) onListeningChange(speech.listening);
  }, [speech.listening, onListeningChange]);

  // Forward coaching loading state
  useEffect(() => {
    if (onCoachingLoadingChange) onCoachingLoadingChange(copilot.coachingLoading);
  }, [copilot.coachingLoading, onCoachingLoadingChange]);

  /* ─── Unified START / STOP handler ─── */
  const customerAudioEnabled =
    import.meta.env.VITE_ENABLE_CUSTOMER_AUDIO !== "false";

  const handleStart = useCallback(async () => {
    if (trainingModeEnabled) {
      // Training mode: no live audio capture. The simulated transcript input
      // feeds transcriptRef directly via appendSimulatedUtterance().
      return;
    }
    if (customerAudioEnabled) {
      try {
        await customerAudio.startCapture();
      } catch (err) {
        const message =
          err?.message ||
          "Customer audio was not shared. Click START again and share the GoHighLevel tab with audio.";
        copilot.pushFeedEntry("info", message, { section: copilot.currentStep });
      }
    }
    speech.startListening();
  }, [speech, customerAudio, customerAudioEnabled, trainingModeEnabled, copilot]);

  const handleStop = useCallback(() => {
    if (trainingModeEnabled) return;
    speech.stopListening();
    if (customerAudio.isCapturing) customerAudio.stopCapture();
  }, [speech, customerAudio, trainingModeEnabled]);

  /* ─── Clear all ─── */
  const clearAll = useCallback(() => {
    speech.clearTranscript();
    customerAudio.clearTranscript();
    copilot.clearFeed();
    setSimulatedTranscript("");
    transcriptRef.current = "";
  }, [speech, customerAudio, copilot]);

  /* ─── Simulated transcript helpers (training mode) ─── */
  const appendSimulatedUtterance = useCallback(
    (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      setSimulatedTranscript((current) => {
        const next = current ? `${current} ${trimmed}` : trimmed;
        transcriptRef.current = next;
        return next;
      });
      copilot.scheduleCoaching?.(trimmed);
    },
    [copilot]
  );

  const clearSimulatedTranscript = useCallback(() => {
    setSimulatedTranscript("");
    transcriptRef.current = "";
  }, []);

  /* ─── Expose controls to right rail via ref ─── */
  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = {
        handleStart,
        handleStop,
        clearAll,
        requestCoaching: () => copilot.requestCoaching({ manual: true }),
        supportsRecognition: speech.supportsRecognition,
        appendSimulatedUtterance,
        clearSimulatedTranscript,
        simulatedTranscript,
        trainingModeEnabled,
      };
    }
  });

  return null;
});

export default ScriptPrompter;
