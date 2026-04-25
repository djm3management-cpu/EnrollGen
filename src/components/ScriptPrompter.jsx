import { useRef, useEffect, useCallback, useState, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { useCustomerAudio } from "../hooks/useCustomerAudio";
import { useMergedTranscript } from "../hooks/useMergedTranscript";
import { useTrainingMode } from "../context/TrainingModeContext";
import { LEVEL_STYLE } from "../data/complianceKnowledge";

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
    speech.startListening();
    if (!customerAudioEnabled) return;
    await new Promise((r) => setTimeout(r, 200));
    try {
      await customerAudio.startCapture();
    } catch {
      return;
    }
  }, [speech, customerAudio, customerAudioEnabled, trainingModeEnabled]);

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
        const urgencyColor = isCritical ? "#ff1744" : isWarn ? "#ffab00" : s.color;
        const urgencyBorder = isCritical
          ? "rgba(255,23,68,0.72)"
          : isWarn
            ? "rgba(255,171,0,0.64)"
            : s.border || "rgba(255,255,255,0.07)";
        const urgencyBackground = isCritical
          ? "linear-gradient(145deg, rgba(255,23,68,0.22) 0%, rgba(10,10,12,0.99) 100%)"
          : isWarn
            ? "linear-gradient(145deg, rgba(255,171,0,0.16) 0%, rgba(10,10,12,0.99) 100%)"
            : isPulse
              ? "linear-gradient(145deg, rgba(157,0,255,0.12) 0%, rgba(10,10,12,0.99) 100%)"
              : isAlert
                ? "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)"
                : "linear-gradient(145deg, rgba(21,21,26,0.92) 0%, rgba(10,10,12,0.94) 100%)";
        const urgencyShadow = isCritical
          ? "14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 34px rgba(255,23,68,0.42)"
          : isWarn
            ? "14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 28px rgba(255,171,0,0.34)"
            : isPulse
              ? `14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 30px ${s.color}33`
              : "14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 20px rgba(0,0,0,0.5)";
        const urgencyAnimation = isFading
          ? "floatFadeOut 5s ease forwards"
          : isCritical
            ? "slideDown 0.25s ease, alertPulseCritical 1s ease-in-out infinite"
            : isWarn
              ? "slideDown 0.25s ease, alertPulseWarn 1.5s ease-in-out 3"
              : isPulse
                ? "slideDown 0.25s ease, alertPulse 1.5s ease-in-out 3"
                : "slideDown 0.25s ease";
        const floatLabel = { critical: "CRITICAL ALERT", warn: "WARNING", tip: "TIP", remind: "REMINDER", info: "CO-PILOT" }[floatingAlert.level] || "CO-PILOT";
        return (
          <div
            onClick={() => copilot.setFloatingAlert(null)}
            style={{
              position: "fixed", top: 80, right: 20, zIndex: 9999, maxWidth: isAlert ? 420 : 340, width: "auto",
              background: urgencyBackground,
              border: `1px solid ${urgencyBorder}`,
              borderLeftWidth: isAlert ? 4 : 3, borderLeftColor: urgencyColor,
              borderRadius: isAlert ? 14 : 10, padding: isAlert ? "14px 18px" : "10px 14px",
              display: "flex", alignItems: "flex-start", gap: isAlert ? 12 : 8, cursor: "pointer",
              boxShadow: urgencyShadow,
              animation: urgencyAnimation,
              backdropFilter: "blur(12px)",
            }}
          >
            <span style={{
              fontSize: isCritical ? "1.15rem" : isPulse ? "1.1rem" : isAlert ? "0.85rem" : "0.75rem", color: urgencyColor,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, lineHeight: 1,
              paddingTop: 2, flexShrink: 0,
              animation: isPulse || isCritical ? "iconFlash 0.8s ease-in-out 4" : "none",
            }}>
              {s.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: isPulse || isCritical ? "0.7rem" : isAlert ? "0.62rem" : "0.58rem", fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: urgencyColor, marginBottom: isAlert ? 5 : 3 }}>
                {floatLabel} — tap to dismiss
              </div>
              <div style={{ fontSize: isCritical ? "0.9rem" : isAlert ? "0.84rem" : "0.76rem", color: "#f4f4f5", lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif", fontWeight: isCritical ? 700 : isWarn || isPulse ? 600 : 400 }}>
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
