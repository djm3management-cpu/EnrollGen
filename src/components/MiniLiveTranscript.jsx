import { useRef, useEffect, useState, memo } from "react";

/**
 * MiniLiveTranscript — Compact live transcript panel for the right rail.
 * Mirrors the Live Telemetry from ScriptPrompter in a smaller, always-visible format.
 *
 * Features:
 * - Interleaved AGT/CUST labels with color coding
 * - Auto-scroll with pause-on-manual-scroll (resumes within ~50px of bottom)
 * - Fixed height ~160px with its own internal scrollbar
 * - Subtle fade-in animation on new entries
 */

const AUTO_SCROLL_THRESHOLD = 50; // px from bottom to re-enable auto-scroll

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
          height: 160,
          overflowY: "auto",
          padding: "0 8px",
        }}
      >
        {finals.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 6, opacity: 0.4,
          }}>
            <div style={{ display: "flex", gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: listening ? "#39FF88" : "#333", animation: listening ? "customerPulse 1.5s ease-in-out infinite" : "none" }} />
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: listening ? "#39FF88" : "#333", animation: listening ? "customerPulse 1.5s ease-in-out infinite 0.2s" : "none" }} />
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: listening ? "#39FF88" : "#333", animation: listening ? "customerPulse 1.5s ease-in-out infinite 0.4s" : "none" }} />
            </div>
            <span style={{ fontSize: "0.6rem", fontFamily: "'DM Sans', sans-serif", color: "#555" }}>
              {listening ? "Listening..." : "Awaiting speech"}
            </span>
          </div>
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
