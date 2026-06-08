import { useRef, useEffect, useCallback, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { useCustomerAudio } from "../hooks/useCustomerAudio";
import { useMergedTranscript } from "../hooks/useMergedTranscript";

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
  onControlsReadyChange,
  onCoachingLoadingChange,
  onAgentAudioLevelChange,
  onCustomerAudioLevelChange,
}) {
  const {
    state,
    activeSection,
    unlocked,
  } = useScript();

  // Shared transcriptRef, created here, passed to both hooks
  const transcriptRef = useRef("");
  const customerCapturePromiseRef = useRef(null);

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
    onTranscriptChange(speech.transcript);
  }, [speech.transcript, onTranscriptChange]);

  // Forward merged transcript entries for MiniLiveTranscript in the right rail
  useEffect(() => {
    if (onMergedTranscriptChange) onMergedTranscriptChange(mergedTranscript);
  }, [mergedTranscript, onMergedTranscriptChange]);

  // Forward listening state
  useEffect(() => {
    if (onListeningChange) onListeningChange(speech.listening);
  }, [speech.listening, onListeningChange]);

  // Forward live audio levels for the two-channel waveform in the center bar.
  useEffect(() => {
    if (onAgentAudioLevelChange) onAgentAudioLevelChange(speech.audioLevel || 0);
  }, [speech.audioLevel, onAgentAudioLevelChange]);

  useEffect(() => {
    if (onCustomerAudioLevelChange) {
      onCustomerAudioLevelChange(customerAudio.audioLevel || 0);
    }
  }, [customerAudio.audioLevel, onCustomerAudioLevelChange]);

  // Forward coaching loading state
  useEffect(() => {
    if (onCoachingLoadingChange) onCoachingLoadingChange(copilot.coachingLoading);
  }, [copilot.coachingLoading, onCoachingLoadingChange]);

  /* ─── Unified START / STOP handler ─── */
  const customerAudioEnabled =
    import.meta.env.VITE_ENABLE_CUSTOMER_AUDIO !== "false";

  const startCustomerAudio = useCallback(async () => {
    if (!customerAudioEnabled || customerAudio.isCapturing) {
      return;
    }
    if (customerCapturePromiseRef.current) {
      return customerCapturePromiseRef.current;
    }

    customerCapturePromiseRef.current = customerAudio
      .startCapture()
      .catch((err) => {
        const message =
          err?.message ||
          "Customer audio was not shared. Share the CRM tab with audio to enable the customer waveform.";
        copilot.pushFeedEntry("info", message, { section: copilot.currentStep });
      })
      .finally(() => {
        customerCapturePromiseRef.current = null;
      });

    return customerCapturePromiseRef.current;
  }, [customerAudio, customerAudioEnabled, copilot]);

  const handleStart = useCallback(async (options = {}) => {
    if (!options?.skipCustomerAudio) {
      await startCustomerAudio();
    }
    speech.startListening();
  }, [speech, startCustomerAudio]);

  const handleStop = useCallback(() => {
    speech.stopListening();
    if (customerAudio.isCapturing) customerAudio.stopCapture();
  }, [speech, customerAudio]);

  /* ─── Clear all ─── */
  const clearAll = useCallback(() => {
    speech.clearTranscript();
    customerAudio.clearTranscript();
    copilot.clearFeed();
    transcriptRef.current = "";
  }, [speech, customerAudio, copilot]);

  /* ─── Expose controls to right rail via ref ─── */
  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = {
        handleStart,
        handleStop,
        clearAll,
        requestCoaching: () => copilot.requestCoaching({ manual: true }),
        supportsRecognition: speech.supportsRecognition,
      };
      onControlsReadyChange?.(true);
    }
  });

  useEffect(() => {
    return () => onControlsReadyChange?.(false);
  }, [onControlsReadyChange]);

  return null;
});

export default ScriptPrompter;
