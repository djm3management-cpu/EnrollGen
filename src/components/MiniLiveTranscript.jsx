import { useRef, useEffect, useState, memo } from "react";
import PanelIdleSpinner from "./PanelIdleSpinner";

/**
 * MiniLiveTranscript, Compact live transcript panel for the right rail.
 * Mirrors the Live Telemetry from ScriptPrompter in a smaller, always-visible format.
 * Now includes an embedded call timer in the CollapsibleWidget header via headerRight.
 */

const AUTO_SCROLL_THRESHOLD = 50; // px from bottom to re-enable auto-scroll
const TRANSCRIPT_PANEL_HEIGHT = "clamp(104px, 15vh, 144px)";
const MAX_TRANSCRIPT_ENTRIES = 24;

function getTimerColor(seconds) {
  if (seconds < 900) return "var(--status-live)";
  if (seconds < 1500) return "var(--status-pending)";
  return "var(--status-offline)";
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
    <span className="transcript-timer" style={{
      fontFamily: "var(--font-mono)",
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

const MiniLiveTranscript = memo(function MiniLiveTranscript({
  mergedEntries = [],
  listening = false,
  highlightSpeakers = false,
}) {
  const scrollRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const latestEntryTimestamp = mergedEntries.at(-1)?.timestamp;

  // Detect manual scroll, pause auto-scroll when user scrolls up
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
      window.requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [latestEntryTimestamp, userScrolled]);

  const finals = mergedEntries
    .filter((e) => e.isFinal && e.text?.trim())
    .slice(-MAX_TRANSCRIPT_ENTRIES);

  return (
    <div className="mini-live-transcript" style={{ padding: "0 0 6px" }}>
      <div
        ref={scrollRef}
        className="right-rail-scroll mini-live-transcript__scroll"
        style={{
          height: TRANSCRIPT_PANEL_HEIGHT,
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
          return (
            <div
              key={`${entry.speaker}-${entry.timestamp}-${idx}`}
              className={`mini-live-transcript__row ${
                isCustomer ? "is-customer" : "is-agent"
              }${idx === finals.length - 1 ? " is-latest" : ""}`}
              style={{
                display: "flex",
                gap: 5,
                padding: "3px 0",
                borderBottom: "1px solid var(--border-default)",
                animation: idx === finals.length - 1 ? "miniTranscriptFadeIn 0.3s ease" : "none",
                paddingLeft: 4,
                backgroundColor: highlightSpeakers
                  ? isCustomer
                    ? "var(--info-bg)"
                    : "var(--status-pending-bg)"
                  : undefined,
              }}
            >
              <span className="mini-live-transcript__text" style={{
                fontSize: "0.7rem",
                color: idx === finals.length - 1
                  ? (isCustomer ? "var(--info)" : "var(--text-primary)")
                  : (isCustomer ? "var(--eg-blue-text)" : "var(--text-muted)"),
                fontFamily: "var(--font-body)",
                lineHeight: 1.5,
                overflowWrap: "break-word",
                minWidth: 0,
              }}>
                <span className="mini-live-transcript__speaker" style={{
                  fontSize: "0.54rem",
                  fontWeight: 800,
                  fontFamily: "var(--font-body)",
                  letterSpacing: "0.06em",
                  color: isCustomer ? "var(--info)" : "var(--text-label)",
                  marginRight: 5,
                }}>
                  {isCustomer ? "CUSTOMER" : "AGENT"}
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
