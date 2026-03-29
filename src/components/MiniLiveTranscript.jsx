import { useRef, useEffect, useState, memo } from "react";
import PanelIdleSpinner from "./PanelIdleSpinner";

/**
 * MiniLiveTranscript — Compact live transcript panel for the right rail.
 * Mirrors the Live Telemetry from ScriptPrompter in a smaller, always-visible format.
 * Now includes an embedded call timer in the CollapsibleWidget header via headerRight.
 */

const AUTO_SCROLL_THRESHOLD = 50; // px from bottom to re-enable auto-scroll

function getTimerColor(seconds) {
  if (seconds < 900) return "#34d399";   // green < 15 min
  if (seconds < 1500) return "#fbbf24";  // yellow 15-25 min
  return "#ef4444";                       // red 25+ min
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Inline timer element for use in CollapsibleWidget headerRight */
export const TranscriptTimer = memo(function TranscriptTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  if (!startTime) return null;

  const color = getTimerColor(elapsed);
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "0.62rem",
      fontWeight: 700,
      color,
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.03em",
      transition: "color 0.4s ease",
    }}>
      {formatTime(elapsed)}
    </span>
  );
});

const MiniLiveTranscript = memo(function MiniLiveTranscript({ mergedEntries = [], listening = false }) {
  const scrollRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Detect manual scroll — pause auto-scroll when user scrolls up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setUserScrolled(distFromBottom > AUTO_SCROLL_THRESHOLD);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom on new entries (unless user scrolled up)
  useEffect(() => {
    if (!userScrolled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mergedEntries, userScrolled]);

  const finals = mergedEntries.filter((e) => e.isFinal && e.text?.trim());

  return (
    <div style={{ padding: "0 0 6px" }}>
      <div
        ref={scrollRef}
        className="right-rail-scroll"
        style={{
          minHeight: 64,
          maxHeight: "calc(40vh - 60px)",
          overflowY: "auto",
          padding: "0 8px",
        }}
      >
        {finals.length === 0 && (
          <PanelIdleSpinner
            variant="telemetry"
            compact
            active={listening}
          />
        )}
        {finals.map((entry, idx) => {
          const isCustomer = entry.speaker === "customer";
          const ts = new Date(entry.timestamp).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          });
          return (
            <div
              key={`${entry.speaker}-${entry.timestamp}-${idx}`}
              style={{
                display: "flex",
                gap: 5,
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                animation: idx === finals.length - 1 ? "miniTranscriptFadeIn 0.3s ease" : "none",
                borderLeft: isCustomer ? "2px solid rgba(0,168,255,0.35)" : "2px solid transparent",
                paddingLeft: 4,
              }}
            >
              <span style={{
                fontSize: "0.52rem",
                color: "#3a3a44",
                fontFamily: "'IBM Plex Mono', monospace",
                whiteSpace: "nowrap",
                lineHeight: 1.6,
                flexShrink: 0,
                minWidth: 48,
              }}>
                {ts}
              </span>
              <span style={{
                fontSize: "0.7rem",
                color: idx === finals.length - 1
                  ? (isCustomer ? "#88c8ff" : "#c8cdd8")
                  : (isCustomer ? "#5588aa" : "#555860"),
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.5,
                overflowWrap: "break-word",
                minWidth: 0,
              }}>
                <span style={{
                  fontSize: "0.54rem",
                  fontWeight: 800,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.06em",
                  color: isCustomer ? "#00A8FF" : "#666",
                  marginRight: 3,
                }}>
                  {isCustomer ? "CUST" : "AGT"}
                </span>
                {entry.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default MiniLiveTranscript;
