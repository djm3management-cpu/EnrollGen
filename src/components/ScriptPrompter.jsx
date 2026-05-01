import { useRef, useEffect, useCallback, useState, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { useCustomerAudio } from "../hooks/useCustomerAudio";
import { useMergedTranscript } from "../hooks/useMergedTranscript";
import { useTrainingMode } from "../context/TrainingModeContext";
import { LEVEL_STYLE } from "../data/complianceKnowledge";

const TERMINAL_ALERT_TONES = {
  critical: {
    color: "#ffffff",
    accent: "#ff3838",
    border: "#8a1414",
    background: "#000000",
  },
  warn: {
    color: "#ff3838",
    accent: "#c41e1e",
    border: "#8a1414",
    background: "#000000",
  },
  tip: {
    color: "#33cc66",
    accent: "#33cc66",
    border: "#1a1a1a",
    background: "#000000",
  },
  remind: {
    color: "#f4b24d",
    accent: "#f4b24d",
    border: "#4d2d00",
    background: "#000000",
  },
  info: {
    color: "#d98b45",
    accent: "#69a7c8",
    border: "#1a1a1a",
    background: "#000000",
  },
};

/* ═══════════════════════════════════════════════════════════════════
   ScriptPrompter — Headless copilot engine host.
   All visual controls now live in the right-rail CopilotControlStrip.
   This component owns hooks, transcript forwarding, and the floating alert.
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

  // Shared transcriptRef — created here, passed to both hooks
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

  /* ═══════ RENDER — floating alert only ═══════ */
  const { floatingAlert } = copilot;

  return (
    <>
      {floatingAlert && (() => {
        const s = LEVEL_STYLE[floatingAlert.level] || LEVEL_STYLE.info;
        const isPulse = !!floatingAlert.pulse;
        const isFading = !!floatingAlert.fading;
        const isAlert = floatingAlert.level === "warn" || floatingAlert.level === "critical";
        const isWarn = floatingAlert.level === "warn";
        const isCritical = floatingAlert.level === "critical";
        const terminalTone =
          TERMINAL_ALERT_TONES[floatingAlert.level] || TERMINAL_ALERT_TONES.info;
        const urgencyColor = terminalTone.color;
        const urgencyBorder = terminalTone.border;
        const urgencyBackground = terminalTone.background;
        const urgencyShadow = isCritical
          ? "0 0 0 1px #8a1414, 0 12px 24px rgba(0,0,0,0.5)"
          : isWarn
            ? "0 0 0 1px #4a0508, 0 12px 24px rgba(0,0,0,0.5)"
            : isPulse
              ? "0 0 0 1px #4d2d00, 0 12px 24px rgba(0,0,0,0.5)"
              : "0 0 0 1px #1a1a1a, 0 12px 24px rgba(0,0,0,0.5)";
        const urgencyAnimation = isFading
          ? "floatFadeOut 5s ease forwards"
          : "slideDown 0.25s ease";
        const floatLabel = { critical: "CRITICAL ALERT", warn: "WARNING", tip: "TIP", remind: "REMINDER", info: "CO-PILOT" }[floatingAlert.level] || "CO-PILOT";
        return (
          <div
            onClick={() => copilot.setFloatingAlert(null)}
            style={{
              position: "fixed", top: 80, right: 20, zIndex: 9999, maxWidth: isAlert ? 420 : 340, width: "auto",
              background: urgencyBackground,
              border: `1px solid ${urgencyBorder}`,
              borderRadius: isAlert ? 14 : 10, padding: isAlert ? "10px 12px" : "8px 10px",
              display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
              boxShadow: urgencyShadow,
              animation: urgencyAnimation,
              backdropFilter: "blur(12px)",
            }}
          >
            <span style={{
              fontSize: isCritical ? "12px" : isPulse ? "12px" : "10px", color: terminalTone.accent,
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, lineHeight: 1.25,
              paddingTop: 1, flexShrink: 0,
            }}>
              {s.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1.4px", textTransform: "uppercase", color: terminalTone.accent, lineHeight: 1.25, marginBottom: isAlert ? 4 : 3 }}>
                {floatLabel} — tap to dismiss
              </div>
              <div style={{ fontSize: isCritical ? "11px" : "10px", color: urgencyColor, lineHeight: 1.35, fontFamily: "'IBM Plex Mono', monospace", fontWeight: isCritical || isWarn || isPulse ? 700 : 500, letterSpacing: "0.3px" }}>
                {floatingAlert.text}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
});

export default ScriptPrompter;
