import React, { useState, useEffect } from "react";

/* ===================== TIMER HELPERS ===================== */
export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ===================== SCRIPT BOX ===================== */
export const ScriptBox = React.memo(function ScriptBox({ children, verbatim }) {
  return (
    <div className={`script-box ${verbatim ? "verbatim" : ""}`}>
      {verbatim && <div className="verbatim-label">READ VERBATIM</div>}
      {children}
    </div>
  );
});

/* ===================== CHECK ITEM ===================== */
export const CheckItem = React.memo(function CheckItem({
  value,
  label,
  onChange,
  disabled,
}) {
  return (
    <label className={`check ${disabled ? "disabledRow" : ""}`}>
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
});

/* ===================== MAIN TIMER ===================== */
export const MainTimer = React.memo(function MainTimer({
  running,
  startTime,
  onStart,
  onReset,
}) {
  const [elapsed, setElapsed] = useState(0);

  // FIX: Reset elapsed to 0 when timer stops
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [running, startTime]);

  const display = formatTime(elapsed);

  return (
    <section className="card">
      <h2 style={{ justifyContent: "center" }}>
        <span className="digital">{display}</span>
      </h2>

      <div className="timer-controls">
        <button className="primary" onClick={onStart}>
          Start Timer
        </button>
        <button className="primary" onClick={onReset}>
          Reset Timer
        </button>
      </div>

      <p className="muted timer-notice">
        TPMO REQUIRED WITHIN 60 SECONDS 🕰️
      </p>
    </section>
  );
});

/* ===================== LOCK TEXT ===================== */
export function LockText({ children }) {
  return <p className="lock">{children}</p>;
}
