import { useRef, useEffect, useState, memo } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import PanelIdleSpinner from "./PanelIdleSpinner";

function levelColor(level) {
  if (level === "critical") return "#ef4444";
  if (level === "warn") return "#f97316";
  if (level === "remind") return "#fbbf24";
  if (level === "tip") return "#34d399";
  return "#94a3b8";
}

const AUTO_SCROLL_THRESHOLD = 50;
const FEED_PANEL_HEIGHT = "clamp(148px, 22vh, 212px)";
const MAX_FEED_ENTRIES = 16;

const CopilotFeedMini = memo(function CopilotFeedMini() {
  const { entries } = useCopilotLog();
  const feedRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const recentEntries = entries
    .filter((e) => e.logType === LOG_TYPES.COPILOT_MSG)
    .slice(-MAX_FEED_ENTRIES);

  // Detect manual scroll — pause auto-scroll when user scrolls up
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setUserScrolled(distFromBottom > AUTO_SCROLL_THRESHOLD);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll feed on new entries (unless user scrolled up)
  useEffect(() => {
    if (!userScrolled && feedRef.current) {
      window.requestAnimationFrame(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
      });
    }
  }, [recentEntries.at(-1)?.id, userScrolled]);

  return (
    <div style={{ padding: "0 0 6px" }}>
      <div
        ref={feedRef}
        className="right-rail-scroll"
        style={{
          height: FEED_PANEL_HEIGHT,
          overflowY: "auto",
          padding: "4px 8px",
        }}
      >
        {recentEntries.length === 0 && (
          <PanelIdleSpinner variant="copilot" compact />
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
