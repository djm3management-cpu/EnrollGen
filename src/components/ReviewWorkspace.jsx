import React, { useMemo, useState } from "react";
import { useScript } from "../context/ScriptContext";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { generateSessionSummary } from "../context/scriptReducer";
import { scoreCompliance } from "../context/ComplianceScorer";
import {
  getDeterministicBlockers,
  summarizeBlockers,
} from "../lib/deterministicBlockers";

const LEVEL_STYLES = {
  info: {
    text: "#E8002D",
    bg: "rgba(232, 0, 45, 0.07)",
    border: "rgba(232, 0, 45, 0.25)",
    glow: "rgba(232, 0, 45, 0.12)",
  },
  tip: {
    text: "#00D166",
    bg: "rgba(0, 209, 102, 0.07)",
    border: "rgba(0, 209, 102, 0.22)",
    glow: "rgba(0, 209, 102, 0.12)",
  },
  remind: {
    text: "#ADADAD",
    bg: "rgba(173, 173, 173, 0.07)",
    border: "rgba(173, 173, 173, 0.2)",
    glow: "rgba(173, 173, 173, 0.1)",
  },
  warn: {
    text: "#FFD700",
    bg: "rgba(255, 215, 0, 0.08)",
    border: "rgba(255, 215, 0, 0.28)",
    glow: "rgba(255, 215, 0, 0.14)",
  },
  critical: {
    text: "#FF4455",
    bg: "rgba(255, 68, 85, 0.1)",
    border: "rgba(255, 68, 85, 0.3)",
    glow: "rgba(255, 68, 85, 0.16)",
  },
};

export default React.memo(function ReviewWorkspace() {
  const { state, activeSection } = useScript();
  const { entries, getWarnings } = useCopilotLog();
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  const summary = useMemo(() => generateSessionSummary(state), [state]);
  const compliance = useMemo(() => scoreCompliance(state, entries), [state, entries]);
  const blockers = useMemo(() => getDeterministicBlockers(state), [state]);
  const blockerSummary = useMemo(() => summarizeBlockers(blockers), [blockers]);
  const warnings = getWarnings();
  const recentCopilot = entries
    .filter((entry) => entry.logType === "copilot_message")
    .slice(-8)
    .reverse();
  const selectedEntry =
    recentCopilot.find((entry) => entry.id === selectedEntryId) || null;

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div className="sep-sidebar-eyebrow">Review Workspace</div>
          <h2 style={{ margin: 0 }}>Post-Call Review</h2>
          <div style={{ fontSize: "0.84rem", color: "#8fa4bc", marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
            SEC {activeSection} · COMPLIANCE {compliance.score}/100
          </div>
        </div>
        <div
          className="review-workspace-stats"
          style={{
            display: "grid",
            gap: 8,
            width: "min(100%, 420px)",
          }}
        >
          {[
            ["Blockers", blockerSummary.total],
            ["Critical", blockerSummary.critical],
            ["Warnings", warnings.length],
            ["Co-Pilot", recentCopilot.length],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.08)",
                borderLeft: label === "Critical"
                  ? "2px solid #FF4455"
                  : label === "Warnings"
                  ? "2px solid #FFD700"
                  : "2px solid #E8002D",
                background: "#121212",
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: "0.62rem", color: "#666", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", fontFamily: "'IBM Plex Mono', monospace" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="review-workspace-grid"
        style={{
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.06)",
            borderLeft: "2px solid #E8002D",
            background: "#111111",
            padding: 14,
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 800, marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "#E8002D" }}>
            Deterministic Blockers
          </div>
          {blockers.length === 0 ? (
            <div style={{ fontSize: "0.86rem", color: "#86efac" }}>
              No deterministic blockers currently active.
            </div>
          ) : (
            blockers.slice(0, 8).map((blocker) => (
              <div key={blocker.id} style={{ marginTop: 8, lineHeight: 1.45 }}>
                <div
                  style={{
                    fontSize: "0.84rem",
                    color: "#eef5ff",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "2px 7px",
                      borderRadius: 999,
                      color:
                        blocker.severity === "critical"
                          ? "#fecaca"
                          : blocker.severity === "high"
                          ? "#fde68a"
                          : "#bfdbfe",
                      background:
                        blocker.severity === "critical"
                          ? "rgba(239,68,68,0.14)"
                          : blocker.severity === "high"
                          ? "rgba(245,158,11,0.14)"
                          : "rgba(59,130,246,0.14)",
                      border:
                        blocker.severity === "critical"
                          ? "1px solid rgba(239,68,68,0.22)"
                          : blocker.severity === "high"
                          ? "1px solid rgba(245,158,11,0.22)"
                          : "1px solid rgba(59,130,246,0.22)",
                    }}
                  >
                    {blocker.severity}
                  </span>
                  <strong>{blocker.label}</strong>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#8fa4bc" }}>
                  {blocker.detail}
                </div>
              </div>
            ))
          )}

          <div style={{ fontSize: "0.72rem", fontWeight: 800, margin: "16px 0 10px", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "#ADADAD" }}>
            Session Snapshot
          </div>
          <div style={{ display: "grid", gap: 6, fontSize: "0.8rem", color: "#d7e2ef" }}>
            <div>Agent: {summary.agentName || "—"}</div>
            <div>Plan: {summary.planName || "—"}</div>
            <div>Effective Date: {summary.effectiveDate || "—"}</div>
            <div>Enrollment Code: {summary.enrollmentCode || "—"}</div>
            <div>Confirmation #: {summary.confirmationNumber || "—"}</div>
            <div>SNP: {summary.snpType || "NONE"}</div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.06)",
            borderLeft: "2px solid #E8002D",
            background: "#111111",
            padding: 14,
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 800, marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "#E8002D" }}>
            AI Co-Pilot Log
          </div>
          {recentCopilot.length === 0 ? (
            <div style={{ fontSize: "0.82rem", color: "#8fa4bc" }}>
              No Co-Pilot messages recorded yet.
            </div>
          ) : (
            recentCopilot.map((entry) => (
              <div
                key={entry.id}
                onClick={() => setSelectedEntryId(entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedEntryId(entry.id);
                  }
                }}
                style={{
                  marginTop: 6,
                  padding: "8px 10px",
                  borderRadius: 3,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                  borderRight: "1px solid rgba(255,255,255,0.05)",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  borderLeft: `2px solid ${(LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).border}`,
                  background:
                    selectedEntryId === entry.id
                      ? (LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).bg
                      : "#1a1a1a",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.6rem",
                      color: (LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).text,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}
                  >
                    ◈ {entry.level}
                  </span>
                  <span style={{ fontSize: "0.6rem", color: "#555", fontFamily: "'IBM Plex Mono', monospace" }}>{entry.timeDisplay || entry.ts || ""}</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#d0d0d0", lineHeight: 1.4, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {entry.message}
                </div>
                {entry.meta?.retrievalTrace && (
                  <div style={{ fontSize: "0.7rem", color: "#8fa4bc", marginTop: 4 }}>
                    topics: {(entry.meta.retrievalTrace.topics || []).slice(0, 2).join(", ") || "—"}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedEntry && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.06)",
            borderLeft: `2px solid ${(LEVEL_STYLES[selectedEntry.level] || LEVEL_STYLES.info).text}`,
            background: "#111111",
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: "0.72rem", fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: (LEVEL_STYLES[selectedEntry.level] || LEVEL_STYLES.info).text }}>
              ◈ Replay Detail — {selectedEntry.level}
            </div>
            <button
              type="button"
              onClick={() => setSelectedEntryId(null)}
              style={{
                border: "1px solid rgba(232,0,45,0.3)",
                background: "transparent",
                color: "#E8002D",
                borderRadius: 3,
                padding: "4px 10px",
                fontSize: "0.65rem",
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Close
            </button>
          </div>

          <div style={{ fontSize: "0.82rem", color: "#d0d0d0", lineHeight: 1.5, fontFamily: "'IBM Plex Mono', monospace", borderLeft: "2px solid #333", paddingLeft: 10, marginBottom: 12 }}>
            {selectedEntry.message}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 1,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 8,
              paddingBottom: 8,
              marginBottom: 8,
            }}
          >
            {[
              ["LEVEL", selectedEntry.level],
              ["SECTION", selectedEntry.meta?.section || "—"],
              ["FEEDBACK", selectedEntry.feedback?.verdict || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: "4px 8px" }}>
                <div style={{ fontSize: "0.58rem", color: "#555", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase" }}>{k}</div>
                <div style={{ fontSize: "0.78rem", color: "#ffffff", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: "0.7rem", color: "#555", fontFamily: "'IBM Plex Mono', monospace" }}>
            RETRIEVAL: {(selectedEntry.meta?.retrievalTrace?.topics || []).slice(0, 3).join(", ") || "—"}
          </div>
          <div style={{ marginTop: 3, fontSize: "0.7rem", color: "#555", fontFamily: "'IBM Plex Mono', monospace" }}>
            SOURCES: {(selectedEntry.meta?.retrievalTrace?.sources || []).slice(0, 4).join(", ") || "—"}
          </div>
        </div>
      )}
    </section>
  );
});
