import { useRef, useEffect, useCallback, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { useCustomerAudio } from "../hooks/useCustomerAudio";
import { useMergedTranscript } from "../hooks/useMergedTranscript";
import { useInboundCall } from "../context/InboundCallContext";

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

  /* ─── Inbound Twilio call: the caller's voice arrives as the call's
     remote MediaStream and is routed straight into the customer audio
     pipeline (Deepgram, waveform, Co-Pilot) the moment the call is
     accepted. Tab sharing remains the path for non-Twilio calls. ─── */
  const inbound = useInboundCall();
  const inboundActive = Boolean(inbound?.activeCall);

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

  // Inbound call accepted: the agent mic pipeline starts immediately so
  // the cockpit is live (STOP state, transcript, coaching) the moment
  // the agent accepts, independent of the remote stream's arrival.
  const inboundSpeechRef = useRef(false);
  useEffect(() => {
    if (!inboundActive || inboundSpeechRef.current) return;
    inboundSpeechRef.current = true;
    if (!speech.listening) speech.startListening();
  }, [inboundActive, speech]);

  // Customer pipeline starts as soon as the call's remote stream is
  // available (context publishes it only once it has an audio track).
  const inboundCaptureRef = useRef(false);
  useEffect(() => {
    if (!inboundActive || !inbound?.remoteStream) return;
    if (inboundCaptureRef.current || customerAudio.isCapturing) return;
    inboundCaptureRef.current = true;
    void customerAudio
      .startCapture({ mediaStream: inbound.remoteStream })
      .catch((err) => {
        inboundCaptureRef.current = false;
        copilot.pushFeedEntry("info", err?.message || "Call audio transcription could not start.", {
          section: copilot.currentStep,
        });
      });
  }, [inboundActive, inbound?.remoteStream, customerAudio, copilot]);

  // Inbound call ended: tear the pipelines down.
  useEffect(() => {
    if (inboundActive) return;
    if (!inboundSpeechRef.current && !inboundCaptureRef.current) return;
    if (inboundCaptureRef.current && customerAudio.isCapturing) customerAudio.stopCapture();
    if (inboundSpeechRef.current) speech.stopListening();
    inboundSpeechRef.current = false;
    inboundCaptureRef.current = false;
  }, [inboundActive, customerAudio, speech]);

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
    // Inbound Twilio calls wire their own audio (remote stream + mic)
    // in the accept effect above; never open the tab picker for them.
    if (inboundActive) return;
    if (!options?.skipCustomerAudio) {
      await startCustomerAudio();
    }
    speech.startListening();
  }, [speech, startCustomerAudio, inboundActive]);

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
