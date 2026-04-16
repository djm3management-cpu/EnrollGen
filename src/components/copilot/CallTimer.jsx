import { memo, useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { useCallStore } from "../../stores/callStore";
import { formatTime } from "../SharedUI";

const WARNING_SECONDS = 60;
const BILLABLE_SECONDS = 90;

const CallTimer = memo(function CallTimer({ fallbackStartTime = null }) {
  const callActive = useCallStore((state) => state.callActive);
  const callStartedAt = useCallStore((state) => state.callStartedAt);
  const [elapsed, setElapsed] = useState(0);
  const [pulse, setPulse] = useState(false);
  const previousElapsedRef = useRef(0);
  const pulseTimeoutRef = useRef(null);

  useEffect(() => () => {
    window.clearTimeout(pulseTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!callActive && fallbackStartTime) {
      const initialElapsed = Math.max(
        0,
        Math.floor((Date.now() - fallbackStartTime) / 1000)
      );
      previousElapsedRef.current = initialElapsed;
      setElapsed(initialElapsed);
      setPulse(false);

      const intervalId = window.setInterval(() => {
        setElapsed(
          Math.max(0, Math.floor((Date.now() - fallbackStartTime) / 1000))
        );
      }, 1000);

      return () => window.clearInterval(intervalId);
    }

    if (!callActive || !callStartedAt) {
      previousElapsedRef.current = 0;
      setElapsed(0);
      setPulse(false);
      window.clearTimeout(pulseTimeoutRef.current);
      return undefined;
    }

    const initialElapsed = Math.max(
      0,
      Math.floor((Date.now() - callStartedAt) / 1000)
    );
    previousElapsedRef.current = initialElapsed;
    setElapsed(initialElapsed);

    const intervalId = window.setInterval(() => {
      const nextElapsed = Math.max(
        0,
        Math.floor((Date.now() - callStartedAt) / 1000)
      );

      if (
        previousElapsedRef.current < BILLABLE_SECONDS &&
        nextElapsed >= BILLABLE_SECONDS
      ) {
        window.clearTimeout(pulseTimeoutRef.current);
        setPulse(true);
        pulseTimeoutRef.current = window.setTimeout(() => {
          setPulse(false);
        }, 300);
      }

      previousElapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [callActive, callStartedAt, fallbackStartTime]);

  if (!callActive && !fallbackStartTime) {
    return null;
  }

  const toneClass = callActive
    ? elapsed >= BILLABLE_SECONDS
      ? "copilot-call-timer--billable"
      : elapsed >= WARNING_SECONDS
        ? "copilot-call-timer--warning"
        : ""
    : "";
  const pulseClass = pulse ? " copilot-call-timer--pulse" : "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 6,
      }}
    >
      <span
        style={{
          fontSize: "0.56rem",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#556677",
          whiteSpace: "nowrap",
        }}
      >
        Call Duration
      </span>
      <span
        className={`copilot-call-timer ${toneClass}${pulseClass}`.trim()}
        style={{ gap: 6 }}
        aria-live="polite"
        aria-label={`Call duration ${formatTime(elapsed * 1000)}`}
      >
        <Timer size={12} strokeWidth={2.1} />
        {formatTime(elapsed * 1000)}
      </span>
    </div>
  );
});

export default CallTimer;
