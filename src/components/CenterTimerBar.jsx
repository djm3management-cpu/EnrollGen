import { memo, useEffect, useState } from "react";
import { useCallStore } from "../stores/callStore";
import Waveform from "./copilot/Waveform";

const FIFTEEN_MIN = 900;
const TWENTY_MIN = 1200;
const THIRTY_MIN = 1800;

function timerColor(seconds) {
  if (seconds < FIFTEEN_MIN) return "var(--eg-green)";
  if (seconds < TWENTY_MIN) return "var(--eg-amber)";
  if (seconds < THIRTY_MIN) return "var(--eg-accent)";
  return "var(--eg-red)";
}

function formatTimer(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * CenterTimerBar
 * LIVE/IDLE beacon, big call timer with spec thresholds, waveform, START/END button.
 * See docs/DESIGN_SYSTEM.md Section 6 + Section 9 + enrollgen-v3-mockup.jsx.
 */
const CenterTimerBar = memo(function CenterTimerBar({
  onStart,
  onEnd,
  onAnalyze,
  showAnalyze = true,
  fallbackStartTime = null,
}) {
  const callActive = useCallStore((state) => state.callActive);
  const callStartedAt = useCallStore((state) => state.callStartedAt);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = callActive && callStartedAt ? callStartedAt : fallbackStartTime;
    if (!startedAt) {
      setElapsed(0);
      return undefined;
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [callActive, callStartedAt, fallbackStartTime]);

  const handlePrimary = () => {
    if (callActive) {
      onEnd?.();
    } else {
      onStart?.();
    }
  };

  return (
    <div className="eg-timer-bar">
      <div className="eg-timer-bar__live">
        <span
          className={`eg-timer-bar__beacon${callActive ? " is-live" : ""}`}
          aria-hidden="true"
        />
        <span className="eg-timer-bar__live-label">
          {callActive ? "LIVE" : "IDLE"}
        </span>
      </div>

      <div
        className="eg-timer-bar__time"
        style={{ color: timerColor(elapsed) }}
        aria-live="polite"
      >
        {formatTimer(elapsed)}
      </div>

      <Waveform active={callActive} />

      <div className="eg-timer-bar__actions">
        <button
          type="button"
          className={`eg-timer-bar__primary${callActive ? " is-end" : " is-start"}`}
          onClick={handlePrimary}
        >
          {callActive ? "END" : "START"}
        </button>
        {showAnalyze && (
          <button
            type="button"
            className="eg-timer-bar__secondary"
            onClick={onAnalyze}
          >
            ANALYZE
          </button>
        )}
      </div>
    </div>
  );
});

export default CenterTimerBar;
