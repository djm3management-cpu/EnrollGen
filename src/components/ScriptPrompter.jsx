import { useRef, useEffect, useCallback, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { useCustomerAudio } from "../hooks/useCustomerAudio";
import { useMergedTranscript } from "../hooks/useMergedTranscript";
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

  // Shared transcriptRef — created here, passed to both hooks
  const transcriptRef = useRef("");

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
    if (onTranscriptChange) onTranscriptChange(speech.transcript);
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
    import.meta.env.VITE_ENABLE_CUSTOMER_AUDIO !== "false" &&
    !!import.meta.env.VITE_DEEPGRAM_API_KEY;

  const handleStart = useCallback(async () => {
    speech.startListening();
    if (!customerAudioEnabled) return;
    await new Promise((r) => setTimeout(r, 200));
    try {
      await customerAudio.startCapture();
    } catch (e) {
      console.log("Customer audio skipped:", e?.message || e);
    }
  }, [speech, customerAudio, customerAudioEnabled]);

  const handleStop = useCallback(() => {
    speech.stopListening();
    if (customerAudio.isCapturing) customerAudio.stopCapture();
  }, [speech, customerAudio]);

  /* ─── Clear all ─── */
  const clearAll = useCallback(() => {
    speech.clearTranscript();
    customerAudio.clearTranscript();
    copilot.clearFeed();
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
        const floatLabel = { critical: "CRITICAL ALERT", warn: "WARNING", tip: "TIP", remind: "REMINDER", info: "CO-PILOT" }[floatingAlert.level] || "CO-PILOT";
        return (
          <div
            onClick={() => copilot.setFloatingAlert(null)}
            style={{
              position: "fixed", top: 80, right: 20, zIndex: 9999, maxWidth: isAlert ? 420 : 340, width: "auto",
              background: isPulse
                ? "linear-gradient(145deg, rgba(157,0,255,0.12) 0%, rgba(10,10,12,0.99) 100%)"
                : isAlert
                  ? "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)"
                  : "linear-gradient(145deg, rgba(21,21,26,0.92) 0%, rgba(10,10,12,0.94) 100%)",
              border: `1px solid ${s.border || "rgba(255,255,255,0.07)"}`,
              borderLeftWidth: isAlert ? 4 : 3, borderLeftColor: s.color,
              borderRadius: isAlert ? 14 : 10, padding: isAlert ? "14px 18px" : "10px 14px",
              display: "flex", alignItems: "flex-start", gap: isAlert ? 12 : 8, cursor: "pointer",
              boxShadow: isPulse
                ? `14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 30px ${s.color}33`
                : "14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 20px rgba(0,0,0,0.5)",
              animation: isFading
                ? "floatFadeOut 5s ease forwards"
                : isPulse ? "slideDown 0.25s ease, alertPulse 1.5s ease-in-out 3" : "slideDown 0.25s ease",
              backdropFilter: "blur(12px)",
            }}
          >
            <span style={{
              fontSize: isPulse ? "1.1rem" : isAlert ? "0.85rem" : "0.75rem", color: s.color,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, lineHeight: 1,
              paddingTop: 2, flexShrink: 0,
              animation: isPulse ? "iconFlash 0.8s ease-in-out 4" : "none",
            }}>
              {s.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: isPulse ? "0.7rem" : isAlert ? "0.62rem" : "0.58rem", fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: s.color, marginBottom: isAlert ? 5 : 3 }}>
                {floatLabel} — tap to dismiss
              </div>
              <div style={{ fontSize: isAlert ? "0.82rem" : "0.76rem", color: "#d0d0d0", lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif", fontWeight: isPulse ? 600 : 400 }}>
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
