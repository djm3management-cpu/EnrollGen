/**
 * U65Copilot.jsx — U65 Off-Exchange AI Co-Pilot UI
 * Real-time speech compliance monitor for private health products enrollment.
 * Layout matches MA Co-Pilot (ScriptPrompter).
 */

import { memo, useState, useRef, useCallback, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import { useU65 } from "../flows/u65/U65Context";
import { useU65CopilotEngine } from "../hooks/useU65CopilotEngine";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { U65_LEVEL_STYLE } from "../data/u65ComplianceKnowledge";
import PanelIdleSpinner from "./PanelIdleSpinner";

const U65Copilot = memo(function U65Copilot({
  onTranscriptChange,
}) {
  const { state, activeGate } = useU65();
  const transcriptRef = useRef("");

  const copilot = useU65CopilotEngine({ transcriptRef, activeGate, state });
  const speech = useSpeechRecognition({
    onNewFinal: copilot.scheduleCoaching,
    onSpokenQuestion: copilot.askCopilot,
    externalTranscriptRef: transcriptRef,
  });

  const [expanded, setExpanded] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const telemetryRef = useRef(null);

  useEffect(() => {
    if (!state.callStart) return;
    const id = setInterval(() => setElapsedSec(Math.round((Date.now() - state.callStart) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state.callStart]);

  useEffect(() => {
    onTranscriptChange?.(speech.transcript);
  }, [onTranscriptChange, speech.transcript]);

  const clearAll = useCallback(() => {
    speech.clearTranscript();
    copilot.clearFeed();
  }, [speech, copilot]);

  const { currentStep, messages, coachingLoading, askLoading, floatingAlert, askQuestion, complianceScore } = copilot;
  const { listening, transcript, transcriptRows, interimText, supportsRecognition } = speech;

  const elapsedStr = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;
  const scoreColor = complianceScore.score >= 90 ? "#9D00FF" : complianceScore.score >= 80 ? "#00ff41" : complianceScore.score >= 60 ? "#FFE45C" : "#FF2040";

  return (
    <>
      {/* ── Floating Alert ── */}
      {floatingAlert && (() => {
        const s = U65_LEVEL_STYLE[floatingAlert.level] || U65_LEVEL_STYLE.info;
        const isPulse = !!floatingAlert.pulse;
        const isFading = !!floatingAlert.fading;
        const isAlert = floatingAlert.level === "warn" || floatingAlert.level === "critical";
        const floatLabel = { critical: "CRITICAL ALERT", warn: "WARNING", tip: "TIP", remind: "REMINDER", info: "U65 CO-PILOT" }[floatingAlert.level] || "U65 CO-PILOT";
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
              <h2 style={{ margin: 0 }}>U65 CO-PILOT</h2>
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
                { label: "GATE", value: `G${activeGate} · ${currentStep.toUpperCase()}`, color: "#ffffff" },
                { label: "ELAPSED", value: elapsedStr, color: elapsedSec > 300 ? "#FFE45C" : "#ffffff" },
                { label: "COMPLIANCE", value: `${complianceScore.score}/100`, color: scoreColor },
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
                onClick={listening ? speech.stop : speech.start}
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
                  placeholder="Ask U65 Co-Pilot"
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
            <div className="prompter-two-column">

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

                <div ref={telemetryRef} className="panel-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                  {transcriptRows.length === 0 && !interimText && (
                    <PanelIdleSpinner variant="telemetry" active={listening} />
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
                  background: "rgba(255,255,255,0.02)",
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#9D00FF", boxShadow: "0 0 7px rgba(157,0,255,0.9)", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.68rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: "0.04em", color: "#7a7f8e" }}>
                      U65 Co-Pilot Feed
                      {coachingLoading && (<span className="ai-dots"><span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" /></span>)}
                    </span>
                  </span>
                </div>

                <div ref={copilot.feedRef} className="panel-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
                  {messages.length === 0 && (
                    <PanelIdleSpinner variant="copilot" />
                  )}
                  {messages.map((msg) => {
                    const s = U65_LEVEL_STYLE[msg.level] || U65_LEVEL_STYLE.info;
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

            {/* ── SCORE SUMMARY (shown when call complete) ── */}
            {state.gate7Ok && (
              <div style={{
                background: `linear-gradient(145deg, ${scoreColor}08, ${scoreColor}03)`,
                border: `1px solid ${scoreColor}22`,
                borderRadius: 14, padding: "16px 20px",
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <div style={{ textAlign: "center", minWidth: 70 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {complianceScore.score}%
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: scoreColor, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}>
                    {complianceScore.grade}
                  </div>
                </div>
                <div style={{ flex: 1, fontSize: 12, color: "#8fa4bc", lineHeight: 1.6 }}>
                  <div><strong style={{ color: "#dfe6f0" }}>Gates completed:</strong> {complianceScore.completed}/{complianceScore.totalGates}</div>
                  {complianceScore.warns > 0 && <div style={{ color: "#fbbf24" }}>Warnings: {complianceScore.warns} (-{complianceScore.warns * 3}pts)</div>}
                  {complianceScore.criticals > 0 && <div style={{ color: "#ef4444" }}>Critical alerts: {complianceScore.criticals} (-{complianceScore.criticals * 8}pts)</div>}
                  {complianceScore.penalty === 0 && <div style={{ color: "#4ade80" }}>No compliance penalties</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
});

export default U65Copilot;
