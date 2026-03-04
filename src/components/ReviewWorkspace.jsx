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
    text: "#7dd3fc",
    bg: "rgba(14, 165, 233, 0.08)",
    border: "rgba(14, 165, 233, 0.2)",
    glow: "rgba(14, 165, 233, 0.14)",
  },
  tip: {
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.08)",
    border: "rgba(34, 197, 94, 0.2)",
    glow: "rgba(34, 197, 94, 0.14)",
  },
  remind: {
    text: "#c4b5fd",
    bg: "rgba(139, 92, 246, 0.1)",
    border: "rgba(139, 92, 246, 0.22)",
    glow: "rgba(139, 92, 246, 0.16)",
  },
  warn: {
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.24)",
    glow: "rgba(245, 158, 11, 0.16)",
  },
  critical: {
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.11)",
    border: "rgba(239, 68, 68, 0.24)",
    glow: "rgba(239, 68, 68, 0.18)",
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
          <div style={{ fontSize: "0.84rem", color: "#8fa4bc", marginTop: 4 }}>
            Current section: {activeSection} · Compliance {compliance.score}/100
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(90px, 1fr))",
            gap: 8,
            minWidth: "min(100%, 420px)",
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
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  label === "Critical"
                    ? "linear-gradient(180deg, rgba(127,29,29,0.2), rgba(255,255,255,0.03))"
                    : label === "Warnings"
                    ? "linear-gradient(180deg, rgba(120,53,15,0.18), rgba(255,255,255,0.03))"
                    : "linear-gradient(180deg, rgba(125,211,252,0.08), rgba(255,255,255,0.03))",
                padding: "10px 12px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ fontSize: "0.68rem", color: "#8fa4bc" }}>{label}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#eef5ff" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 14,
        }}
      >
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(180deg, rgba(18,27,41,0.92), rgba(10,15,24,0.92))",
            padding: 14,
            boxShadow: "0 18px 34px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 800, marginBottom: 10 }}>
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

          <div style={{ fontSize: "0.78rem", fontWeight: 800, margin: "16px 0 10px" }}>
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
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(180deg, rgba(18,27,41,0.92), rgba(10,15,24,0.92))",
            padding: 14,
            boxShadow: "0 18px 34px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 800, marginBottom: 10 }}>
            Recent Co-Pilot Activity
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
                  marginTop: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border:
                    selectedEntryId === entry.id
                      ? `1px solid ${
                          (LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).border
                        }`
                      : "1px solid rgba(255,255,255,0.06)",
                  background:
                    selectedEntryId === entry.id
                      ? (LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).bg
                      : "rgba(255,255,255,0.025)",
                  boxShadow:
                    selectedEntryId === entry.id
                      ? `0 10px 24px ${
                          (LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).glow
                        }`
                      : "none",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: "0.72rem",
                    color: "#8fa4bc",
                  }}
                >
                  <span
                    style={{
                      color: (LEVEL_STYLES[entry.level] || LEVEL_STYLES.info).text,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {entry.level}
                  </span>
                  <span>{entry.timeDisplay || entry.ts || ""}</span>
                </div>
                <div style={{ fontSize: "0.82rem", color: "#eef5ff", marginTop: 4 }}>
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
            borderRadius: 14,
            border: `1px solid ${
              (LEVEL_STYLES[selectedEntry.level] || LEVEL_STYLES.info).border
            }`,
            background: `linear-gradient(180deg, ${
              (LEVEL_STYLES[selectedEntry.level] || LEVEL_STYLES.info).bg
            }, rgba(10,15,24,0.92))`,
            padding: 14,
            boxShadow: `0 20px 40px ${
              (LEVEL_STYLES[selectedEntry.level] || LEVEL_STYLES.info).glow
            }`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: "0.78rem", fontWeight: 800 }}>
              Replay Detail
            </div>
            <button
              type="button"
              onClick={() => setSelectedEntryId(null)}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "#c8d4e4",
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: "0.7rem",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: "0.82rem", color: "#eef5ff" }}>
            {selectedEntry.message}
          </div>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <div style={{ fontSize: "0.74rem", color: "#8fa4bc" }}>
              <strong style={{ color: "#dbe7f3" }}>Level:</strong>{" "}
              <span
                style={{
                  color:
                    (LEVEL_STYLES[selectedEntry.level] || LEVEL_STYLES.info).text,
                  fontWeight: 800,
                }}
              >
                {selectedEntry.level}
              </span>
            </div>
            <div style={{ fontSize: "0.74rem", color: "#8fa4bc" }}>
              <strong style={{ color: "#dbe7f3" }}>Section:</strong> {selectedEntry.meta?.section || "—"}
            </div>
            <div style={{ fontSize: "0.74rem", color: "#8fa4bc" }}>
              <strong style={{ color: "#dbe7f3" }}>Feedback:</strong> {selectedEntry.feedback?.verdict || "—"}
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: "0.76rem", color: "#8fa4bc" }}>
            Retrieval:
            {" "}
            {(selectedEntry.meta?.retrievalTrace?.topics || []).slice(0, 3).join(", ") || "—"}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.76rem", color: "#8fa4bc" }}>
            Sources:
            {" "}
            {(selectedEntry.meta?.retrievalTrace?.sources || []).slice(0, 4).join(", ") || "—"}
          </div>
        </div>
      )}
    </section>
  );
});
