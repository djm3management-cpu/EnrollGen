import { useRef, useEffect, memo } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";

function levelColor(level) {
  if (level === "critical") return "#ef4444";
  if (level === "warn") return "#f97316";
  if (level === "remind") return "#fbbf24";
  if (level === "tip") return "#34d399";
  return "#94a3b8";
}

const CopilotFeedMini = memo(function CopilotFeedMini() {
  const { entries } = useCopilotLog();
  const feedRef = useRef(null);

  const recentEntries = entries
    .filter((e) => e.logType === LOG_TYPES.COPILOT_MSG)
    .slice(-8);

  // Auto-scroll feed on new entries
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [recentEntries.length]);

  return (
    <div style={{ padding: "0 0 6px" }}>
      <div
        ref={feedRef}
        className="right-rail-scroll"
        style={{
          height: 150,
          overflowY: "auto",
          padding: "4px 8px",
        }}
      >
        {recentEntries.length === 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", opacity: 0.4,
          }}>
            <span style={{ fontSize: "0.6rem", fontFamily: "'DM Sans', sans-serif", color: "#555" }}>
              Awaiting coaching...
            </span>
          </div>
        )}
        {recentEntries.map((entry) => (
          <div
            key={entry.id}
            style={{
              fontSize: "0.62rem",
              color: "#94a3b8",
              marginBottom: 4,
              lineHeight: 1.45,
              display: "flex",
              gap: 5,
            }}
          >
            <span
              style={{
                width: 4,
                minWidth: 4,
                borderRadius: 2,
                background: levelColor(entry.level),
                flexShrink: 0,
                marginTop: 2,
                alignSelf: "stretch",
              }}
            />
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default CopilotFeedMini;
