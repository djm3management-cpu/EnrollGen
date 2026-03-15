import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { scoreCompliance } from "../context/ComplianceScorer";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCopilotEngine } from "../hooks/useCopilotEngine";
import { LEVEL_STYLE } from "../data/complianceKnowledge";

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function summarizeRetrievalTrace(trace) {
  if (!trace) return null;
  const topics = Array.isArray(trace.topics) ? trace.topics : [];
  const scenarios = Array.isArray(trace.scenarios) ? trace.scenarios : [];
  const sources = Array.isArray(trace.sources) ? trace.sources : [];
  if (!topics.length && !scenarios.length && !sources.length) return null;
  return { topTopics: topics.slice(0, 2), topScenarios: scenarios.slice(0, 1), sourceCount: sources.length };
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

const ScriptPrompter = memo(function ScriptPrompter({ onTranscriptChange }) {
  const {
    state,
    activeSection,
    unlocked,
    preEnrollAllDone,
    sobAllDone,
    enrollAllDone,
    enrollmentCodeOk,
  } = useScript();

  // Shared transcriptRef — created here, passed to both hooks
  const transcriptRef = useRef("");

  /* ─── Copilot engine (coaching, ask, feed) ─── */
  const copilot = useCopilotEngine({
    transcriptRef,
    activeSection,
    state,
    unlocked,
    preEnrollAllDone,
    sobAllDone,
    enrollAllDone,
    enrollmentCodeOk,
  });

  /* ─── Speech recognition ─── */
  const speech = useSpeechRecognition({
    onNewFinal: copilot.scheduleCoaching,
    onSpokenQuestion: copilot.askCopilot,
    externalTranscriptRef: transcriptRef,
  });

  // Forward transcript changes to parent
  useEffect(() => {
    if (onTranscriptChange) onTranscriptChange(speech.transcript);
  }, [speech.transcript, onTranscriptChange]);

  /* ─── UI state ─── */
  const [expanded, setExpanded] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const compliance = useMemo(() => scoreCompliance(state, copilot.entries), [state, copilot.entries]);

  // Section elapsed timer
  useEffect(() => {
    const ts = state.sectionTimestamps?.[activeSection];
    if (!ts?.start || ts?.end) { setElapsedSec(0); return; }
    const tick = () => setElapsedSec(Math.floor((Date.now() - ts.start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.sectionTimestamps, activeSection]);

  const elapsedDisplay = useMemo(() => {
    const m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const s = String(elapsedSec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [elapsedSec]);

  /* ─── Clear all ─── */
  const clearAll = useCallback(() => {
    speech.clearTranscript();
    copilot.clearFeed();
  }, [speech, copilot]);

  /* ─── Exports ─── */
  const exportReplayScenario = useCallback(() => {
    const copilotEntries = copilot.messages.map((msg) => ({
      id: msg.id, level: msg.level, section: msg.section || copilot.currentStep,
      issueTag: msg.issueTag || "", text: msg.text, ts: msg.ts,
      retrievalSummary: summarizeRetrievalTrace(msg.retrievalTrace),
    }));
    const retrievalOverview = {
      topics: Array.from(new Set(copilot.messages.flatMap((m) => m.retrievalTrace?.topics?.slice(0, 2) || []))).slice(0, 8),
      scenarios: Array.from(new Set(copilot.messages.flatMap((m) => m.retrievalTrace?.scenarios?.slice(0, 1) || []))).slice(0, 6),
      totalSourcesReferenced: copilot.messages.reduce((sum, m) => sum + (m.retrievalTrace?.sources?.length || 0), 0),
    };
    downloadJson(`copilot-replay-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      currentSection: { number: activeSection, label: copilot.currentStep },
      transcript: speech.transcript, appState: state, unlocked, retrievalOverview,
      messages: copilotEntries, feedbackDataset: copilot.exportFeedbackDataset(),
    });
  }, [activeSection, copilot, speech.transcript, state, unlocked]);

  const exportFeedbackBundle = useCallback(() => {
    downloadJson(`copilot-feedback-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      currentSection: copilot.currentStep,
      transcriptTail: speech.transcript.slice(-2500),
      feedback: copilot.exportFeedbackDataset(),
    });
  }, [copilot, speech.transcript]);

  /* ─── Destructure for render ─── */
  const { currentStep, messages, coachingLoading, askLoading, floatingAlert, askQuestion } = copilot;
  const { listening, transcript, transcriptRows, interimText, supportsRecognition } = speech;

  /* ═══════ RENDER ═══════ */
  return (
    <>
      {/* ── Floating Alert ── */}
      {floatingAlert && (() => {
        const s = LEVEL_STYLE[floatingAlert.level] || LEVEL_STYLE.info;
        const isPulse = !!floatingAlert.pulse;
        return (
          <div
            onClick={() => copilot.setFloatingAlert(null)}
            style={{
              position: "fixed", top: 80, right: 20, zIndex: 9999, maxWidth: 420, width: "auto",
              background: isPulse
                ? "linear-gradient(145deg, rgba(157,0,255,0.12) 0%, rgba(10,10,12,0.99) 100%)"
                : "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
              border: `1px solid ${s.border || "rgba(255,255,255,0.07)"}`,
              borderLeftWidth: 4, borderLeftColor: s.color,
              borderRadius: 14, padding: "14px 18px",
              display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
              boxShadow: isPulse
                ? `14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 30px ${s.color}33`
                : "14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 20px rgba(0,0,0,0.5)",
              animation: isPulse ? "slideDown 0.25s ease, alertPulse 1.5s ease-in-out 3" : "slideDown 0.25s ease",
              backdropFilter: "blur(12px)",
            }}
          >
            <span style={{
              fontSize: isPulse ? "1.1rem" : "0.85rem", color: s.color,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, lineHeight: 1,
              paddingTop: 2, flexShrink: 0,
              animation: isPulse ? "iconFlash 0.8s ease-in-out 4" : "none",
            }}>
              {s.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: isPulse ? "0.7rem" : "0.62rem", fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: s.color, marginBottom: 5 }}>
                {floatingAlert.level === "critical" ? "CRITICAL ALERT" : "WARNING"} — tap to dismiss
              </div>
              <div style={{ fontSize: "0.82rem", color: "#d0d0d0", lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif", fontWeight: isPulse ? 600 : 400 }}>
                {floatingAlert.text}
              </div>
            </div>
          </div>
        );
      })()}

      <section className="card prompter-card">
        {/* ── Header ── */}
        <div className="prompter-header" onClick={() => setExpanded((p) => !p)}>
          <div className="prompter-header-left">
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: listening ? "#7fde9e" : "#2e2e38",
              boxShadow: listening ? "0 0 6px rgba(127,222,158,0.7)" : "none",
              flexShrink: 0, display: "inline-block", transition: "all 0.3s",
            }} />
            <div>
              <h2 style={{ margin: 0 }}>CO-PILOT</h2>
              <span className="muted" style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{currentStep}</span>
            </div>
          </div>
          <span className="prompter-toggle">{expanded ? "▲" : "▼"}</span>
        </div>

        {expanded && (
          <div className="prompter-body">

            {/* ── STATUS BAR ── */}
            <div style={{
              display: "flex", alignItems: "stretch", gap: 0,
              background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden",
              boxShadow: "inset 4px 4px 9px rgba(0,0,0,0.42), inset -3px -3px 8px rgba(255,255,255,0.025)",
            }}>
              {[
                { label: "STATUS", value: listening ? "● LIVE" : "○ STANDBY", color: listening ? "#39FF88" : "#C7CEDA" },
                { label: "SECTION", value: `${activeSection === 2.5 ? "SNP" : activeSection} · ${currentStep.toUpperCase()}`, color: "#ffffff" },
                { label: "ELAPSED", value: elapsedDisplay, color: elapsedSec > 300 ? "#FFE45C" : "#ffffff" },
                { label: "COMPLIANCE", value: `${compliance.score}/100`, color: compliance.score >= 90 ? "#9D00FF" : compliance.score >= 80 ? "#00ff41" : compliance.score >= 60 ? "#FFE45C" : "#FF2040" },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{ flex: 1, padding: "8px 12px", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ fontSize: "0.66rem", color: "#7a7f8e", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: "0.84rem", color, fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.01em", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ── CONTROL STRIP ── */}
            <div style={{
              display: "flex", gap: 8, alignItems: "center",
              background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "8px 10px", flexWrap: "wrap",
              boxShadow: "inset 4px 4px 9px rgba(0,0,0,0.42), inset -3px -3px 8px rgba(255,255,255,0.025)",
            }}>
              <button
                onClick={listening ? speech.stopListening : speech.startListening}
                disabled={!supportsRecognition}
                style={{
                  background: listening
                    ? "linear-gradient(145deg, rgba(232,0,45,0.2) 0%, rgba(180,0,35,0.14) 100%)"
                    : "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
                  border: listening ? "1px solid rgba(232,0,45,0.28)" : "1px solid rgba(255,255,255,0.07)",
                  color: listening ? "#FF8FA3" : "#00ff41", borderRadius: 50, padding: "5px 14px",
                  fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: "0.03em",
                  cursor: supportsRecognition ? "pointer" : "not-allowed", whiteSpace: "nowrap", transition: "all 0.15s",
                  boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                {!supportsRecognition ? "NO MIC" : listening ? "■ STOP" : "● START"}
              </button>

              <button onClick={clearAll} style={{
                background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
                border: "1px solid rgba(255,255,255,0.07)", color: "#666", borderRadius: 50,
                padding: "5px 14px", fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
              }}>
                CLEAR
              </button>

              <button
                disabled={!transcript.trim() || coachingLoading}
                onClick={() => copilot.requestCoaching({ manual: true })}
                style={{
                  background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
                  border: "1px solid rgba(157,0,255,0.45)", color: "#B84DFF", borderRadius: 50,
                  padding: "5px 14px", fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  cursor: transcript.trim() && !coachingLoading ? "pointer" : "not-allowed",
                  opacity: !transcript.trim() || coachingLoading ? 0.45 : 1, whiteSpace: "nowrap", transition: "all 0.15s",
                  boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                {coachingLoading ? "ANALYZING…" : "◈ ANALYZE"}
              </button>

              <div style={{ flex: 1, display: "flex", gap: 4, minWidth: 180 }}>
                <input
                  value={askQuestion}
                  onChange={(e) => copilot.setAskQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); copilot.askCopilot(); } }}
                  placeholder="Ask Co Pilot"
                  disabled={askLoading}
                  style={{
                    flex: 1, background: "linear-gradient(145deg, rgba(18,18,22,0.98) 0%, rgba(10,10,12,0.99) 100%)",
                    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "5px 10px",
                    fontSize: "0.78rem", color: "#c8cdd8", outline: "none", fontFamily: "'DM Sans', sans-serif",
                    boxShadow: "inset 3px 3px 6px rgba(0,0,0,0.4), inset -2px -2px 5px rgba(255,255,255,0.018)",
                  }}
                />
                <button
                  onClick={() => copilot.askCopilot()}
                  disabled={!askQuestion.trim() || askLoading}
                  style={{
                    background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
                    border: "1px solid rgba(255,255,255,0.07)", color: "#c8cdd8", borderRadius: 50,
                    padding: "5px 14px", fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                    cursor: askQuestion.trim() && !askLoading ? "pointer" : "not-allowed",
                    opacity: !askQuestion.trim() || askLoading ? 0.45 : 1, whiteSpace: "nowrap", transition: "all 0.15s",
                    boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
                  }}
                >
                  {askLoading ? "…" : <ArrowUpRight size={14} strokeWidth={2.2} />}
                </button>
              </div>
            </div>

            {/* ── TWO-COLUMN BODY ── */}
            <div style={{ display: "grid", gridTemplateColumns: "40% 1fr", gap: 10, alignItems: "stretch", height: 220 }}>

              {/* ── LEFT: LIVE TELEMETRY ── */}
              <div style={{
                background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
                border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden",
                display: "flex", flexDirection: "column", boxSizing: "border-box",
                boxShadow: "inset 6px 6px 14px rgba(0,0,0,0.45), inset -4px -4px 10px rgba(255,255,255,0.02)",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.02)",
                }}>
                  <span style={{ fontSize: "0.68rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: "0.04em", color: "#7a7f8e" }}>Live Telemetry</span>
                  <span style={{ fontSize: "0.65rem", color: "#444", fontFamily: "'DM Sans', sans-serif" }}>{transcriptRows.length} lines</span>
                </div>

                <div className="panel-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                  {transcriptRows.length === 0 && !interimText && (
                    <div className={`panel-empty ${listening ? "panel-empty--listening" : "panel-empty--input"}`}>
                      <div className="panel-empty-dots">
                        <span className="panel-empty-dot" /><span className="panel-empty-dot" /><span className="panel-empty-dot" />
                      </div>
                      <span className="panel-empty-label">{listening ? "Listening" : "Awaiting input"}</span>
                    </div>
                  )}
                  {transcriptRows.map((row, idx) => (
                    <div key={row.id} style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 6, padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "start" }}>
                      <span style={{ fontSize: "0.58rem", color: "#444", fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.45, paddingTop: 2 }}>{row.ts}</span>
                      <span style={{ fontSize: "0.8rem", color: idx === transcriptRows.length - 1 ? "#d8dce6" : "#6a6e7a", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45, overflowWrap: "break-word", minWidth: 0 }}>{row.text}</span>
                    </div>
                  ))}
                  {interimText && (
                    <div style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 6, padding: "5px 10px", alignItems: "start" }}>
                      <span style={{ fontSize: "0.58rem", color: "#333", fontFamily: "'DM Sans', sans-serif", paddingTop: 2 }}>…</span>
                      <span className="prompter-interim" style={{ fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45, overflowWrap: "break-word", minWidth: 0 }}>{interimText}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT: CO-PILOT FEED ── */}
              <div style={{
                background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
                border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden",
                display: "flex", flexDirection: "column", boxSizing: "border-box",
                boxShadow: "inset 6px 6px 14px rgba(0,0,0,0.45), inset -4px -4px 10px rgba(255,255,255,0.02)",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: "rgba(255,255,255,0.02)", flexWrap: "wrap", gap: 6,
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#9D00FF", boxShadow: "0 0 7px rgba(157,0,255,0.9)", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.68rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: "0.04em", color: "#7a7f8e" }}>
                      Co-Pilot Feed
                      {coachingLoading && (<span className="ai-dots"><span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" /></span>)}
                    </span>
                  </span>
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    {[["REPLAY", exportReplayScenario], ["FEEDBACK", exportFeedbackBundle]].map(([label, fn]) => (
                      <button key={label} type="button" onClick={fn} style={{
                        background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
                        border: "1px solid rgba(255,255,255,0.07)", color: "#666", borderRadius: 50,
                        padding: "3px 10px", fontSize: "0.62rem", fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 600, cursor: "pointer", letterSpacing: "0.03em",
                        boxShadow: "2px 2px 5px rgba(0,0,0,0.35), -1px -1px 3px rgba(255,255,255,0.02)",
                      }}>{label}</button>
                    ))}
                  </span>
                </div>

                <div ref={copilot.feedRef} className="panel-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
                  {messages.length === 0 && (
                    <div className="panel-empty panel-empty--ai">
                      <div className="panel-empty-dots"><span className="panel-empty-dot" /><span className="panel-empty-dot" /><span className="panel-empty-dot" /></div>
                      <span className="panel-empty-label">Awaiting analysis</span>
                    </div>
                  )}
                  {messages.map((msg) => {
                    const s = LEVEL_STYLE[msg.level] || LEVEL_STYLE.info;
                    return (
                      <div key={msg.id} style={{ margin: "5px 8px", borderRadius: 10, padding: "8px 10px", animation: "fadeIn 0.2s ease", background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                          <span style={{ fontSize: "0.58rem", color: s.color, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>{s.icon} {msg.level || "info"}</span>
                          <span style={{ fontSize: "0.55rem", color: "#444", fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap", flexShrink: 0 }}>{msg.ts}</span>
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "#c2c7d4", lineHeight: 1.55, fontFamily: "'DM Sans', sans-serif", fontWeight: 400, overflowWrap: "break-word" }}>{msg.text}</div>
                        {msg.issueTag && (
                          <span style={{ display: "inline-block", marginTop: 5, fontSize: "0.58rem", color: "#E8002D", border: "1px solid rgba(232,0,45,0.2)", borderRadius: 2, padding: "1px 5px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(232,0,45,0.04)" }}>{msg.issueTag}</span>
                        )}
                        {msg.retrievalTrace && (msg.retrievalTrace.topics?.length || msg.retrievalTrace.scenarios?.length || msg.retrievalTrace.sources?.length) && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                            {msg.retrievalTrace.topics?.slice(0, 3).map((id) => (
                              <span key={id} style={{ fontSize: "0.57rem", color: "#666", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 2, padding: "1px 5px", background: "rgba(255,255,255,0.02)", fontFamily: "'IBM Plex Mono', monospace" }}>topic:{id}</span>
                            ))}
                            {msg.retrievalTrace.scenarios?.slice(0, 2).map((id) => (
                              <span key={id} style={{ fontSize: "0.57rem", color: "#E8002D", border: "1px solid rgba(232,0,45,0.15)", borderRadius: 2, padding: "1px 5px", background: "rgba(232,0,45,0.04)", fontFamily: "'IBM Plex Mono', monospace" }}>sep:{id}</span>
                            ))}
                            {msg.retrievalTrace.sources?.length > 0 && (
                              <span style={{ fontSize: "0.57rem", color: "#555", fontFamily: "'IBM Plex Mono', monospace" }}>{msg.retrievalTrace.sources.length}src</span>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                          {[["correct", "✓"], ["too_aggressive", "AGGR"], ["missed_issue", "MISS"], ["duplicate", "DUP"], ["wrong_section", "SEC?"]].map(([verdict, label]) => (
                            <button key={verdict} type="button" onClick={() => copilot.setEntryFeedback(msg.id, verdict)} title={verdict.replace(/_/g, " ")} style={{
                              fontSize: "0.62rem", borderRadius: 50,
                              border: msg.feedback?.verdict === verdict ? "1px solid rgba(157,0,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
                              background: msg.feedback?.verdict === verdict ? "linear-gradient(145deg, rgba(157,0,255,0.18) 0%, rgba(100,0,180,0.12) 100%)" : "linear-gradient(145deg, rgba(42,42,50,0.9) 0%, rgba(26,26,32,0.95) 100%)",
                              color: msg.feedback?.verdict === verdict ? "#B84DFF" : "#555",
                              padding: "2px 8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                              boxShadow: "2px 2px 4px rgba(0,0,0,0.35), -1px -1px 3px rgba(255,255,255,0.018)", transition: "all 0.12s",
                            }}>{label}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(coachingLoading || askLoading) && (
                    <div className="copilot-spinner-wrap">
                      <div className="copilot-spinner" />
                      <span className="copilot-spinner-label">{coachingLoading ? "Analyzing…" : "Processing…"}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </section>
    </>
  );
});

export default ScriptPrompter;
