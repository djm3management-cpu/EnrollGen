import { useRef, useEffect, useState, memo } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import PanelIdleSpinner from "./PanelIdleSpinner";

const AUTO_SCROLL_THRESHOLD = 50;
const MAX_FEED_ENTRIES = 3;
const FEED_LEVELS = new Set(["silent", "info", "tip", "remind", "warn", "critical"]);

const CopilotFeedMini = memo(function CopilotFeedMini() {
  const { entries } = useCopilotLog();
  const feedRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const recentEntries = entries
    .filter((e) => e.logType === LOG_TYPES.COPILOT_MSG)
    .slice(-MAX_FEED_ENTRIES);
  const latestEntryId = recentEntries.at(-1)?.id;

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
  }, [latestEntryId, userScrolled]);

  return (
    <div className="copilot-feed-mini">
      <div
        ref={feedRef}
        className="right-rail-scroll copilot-feed-mini__scroll"
      >
        {recentEntries.length === 0 && (
          <PanelIdleSpinner variant="copilot" compact />
        )}
        {recentEntries.map((entry) => {
          const level = FEED_LEVELS.has(entry.level) ? entry.level : "info";
          return (
            <div
              key={entry.id}
              className={`copilot-feed-mini__entry copilot-msg copilot-msg--${level}`}
            >
              <span className="copilot-feed-mini__text">{entry.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default CopilotFeedMini;
