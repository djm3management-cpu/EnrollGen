import { useState, useEffect, memo } from "react";
import { Clock } from "lucide-react";

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

const CallTimer = memo(function CallTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const color = getTimerColor(elapsed);

  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 16,
        padding: "10px 14px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 10px 24px rgba(0, 0, 0, 0.36)",
        width: 230,
        marginBottom: 8,
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Clock size={14} style={{ color, flexShrink: 0 }} />
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "1.3em",
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.04em",
          transition: "color 0.4s ease",
        }}
      >
        {formatTime(elapsed)}
      </span>
      <span
        style={{
          marginLeft: "auto",
          fontSize: "0.5em",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.25)",
        }}
      >
        call
      </span>
    </div>
  );
});

export default CallTimer;
