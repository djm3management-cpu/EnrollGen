import React, { useState, useEffect, useRef, useCallback } from "react";

/* ===================== TIMER HELPERS ===================== */
export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ===================== SCRIPT BOX (with copy button) ===================== */
export const ScriptBox = React.memo(function ScriptBox({ children, verbatim }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  const handleCopy = useCallback(() => {
    const text =
      textRef.current?.innerText || textRef.current?.textContent || "";
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        // Fallback for older browsers
        const range = document.createRange();
        range.selectNodeContents(textRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("copy");
        sel.removeAllRanges();
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
  }, []);

  return (
    <div className={`script-box ${verbatim ? "verbatim" : ""}`}>
      <div className="script-box-header">
        {verbatim && <div className="verbatim-label">READ VERBATIM</div>}
        <button
          className="copy-btn"
          onClick={handleCopy}
          title="Copy to clipboard"
          aria-label="Copy script text"
        >
          {copied ? "✓ Copied" : "⧉ Copy"}
        </button>
      </div>
      <div ref={textRef}>{children}</div>
    </div>
  );
});

/* ===================== CHECK ITEM (with keyboard support) ===================== */
export const CheckItem = React.memo(function CheckItem({
  value,
  label,
  onChange,
  disabled,
}) {
  const handleKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onChange(!value);
      }
    },
    [disabled, onChange, value]
  );

  return (
    <label
      className={`check ${disabled ? "disabledRow" : ""}`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={value}
      aria-disabled={disabled}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        tabIndex={-1}
      />
      {label}
    </label>
  );
});

/* ===================== MAIN TIMER (sticky) ===================== */
export const MainTimer = React.memo(function MainTimer({
  running,
  startTime,
  onStart,
  onReset,
}) {
  const [elapsed, setElapsed] = useState(0);

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
  const isWarning = elapsed > 50000 && elapsed <= 60000;
  const isDanger = elapsed > 60000;

  return (
    <section className="card timer-card" id="main-timer">
      <h2 style={{ justifyContent: "center" }}>
        <span
          className={`digital ${isWarning ? "timer-warning" : ""} ${
            isDanger ? "timer-danger" : ""
          }`}
        >
          {display}
        </span>
      </h2>

      <div className="timer-controls">
        <button className="primary" onClick={onStart}>
          Start Timer
        </button>
        <button className="primary" onClick={onReset}>
          Reset Timer
        </button>
      </div>

      <p className="muted timer-notice">TPMO REQUIRED WITHIN 60 SECONDS 🕰️</p>
    </section>
  );
});

/* ===================== SECTION TIMER ===================== */
export const SectionTimer = React.memo(function SectionTimer({
  sectionNum,
  timestamps,
}) {
  const ts = timestamps[sectionNum];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!ts || !ts.start) return;
    if (ts.end) {
      setElapsed(ts.end - ts.start);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - ts.start);
    }, 1000);

    return () => clearInterval(interval);
  }, [ts]);

  if (!ts || !ts.start) return null;

  return (
    <span className="section-timer" title="Time in this section">
      ⏱ {formatTime(elapsed)}
    </span>
  );
});

/* ===================== LOCK TEXT ===================== */
export function LockText({ children }) {
  return <p className="lock">{children}</p>;
}

/* ===================== PROGRESS BAR ===================== */
export const ProgressBar = React.memo(function ProgressBar({
  activeSection,
  totalSections,
  sectionLabels,
}) {
  // Map active section to progress number (handle SNP 2.5)
  let currentStep;
  if (activeSection <= 2) currentStep = activeSection;
  else if (activeSection === 2.5) currentStep = 2.5;
  else currentStep = activeSection;

  // Calculate percentage — section 8 = 100%
  const pct = Math.min(
    100,
    Math.round((Math.max(1, currentStep - 1) / (totalSections - 1)) * 100)
  );
  const sectionLabel =
    sectionLabels[activeSection] || `Section ${activeSection}`;

  // Determine integer section for display
  const displayNum = activeSection === 2.5 ? "SNP" : Math.floor(activeSection);

  return (
    <div className="progress-bar-info">
      <div className="section-counter">
        {displayNum === "SNP" ? (
          <span className="section-snp">SNP</span>
        ) : (
          <>
            <span className="section-current">{displayNum}</span>
            <span className="section-divider">/</span>
            <span className="section-total">{totalSections}</span>
          </>
        )}
      </div>

      <div className="section-title">{sectionLabel}</div>
    </div>
  );
});

/* ===================== UNDO BUTTON ===================== */
export const UndoButton = React.memo(function UndoButton({
  undoHistory,
  onUndo,
}) {
  if (undoHistory.length === 0) return null;

  const lastEntry = undoHistory[undoHistory.length - 1];
  const timeSince = Date.now() - lastEntry.timestamp;

  // Only show undo for recent actions (within 30 seconds)
  if (timeSince > 30000) return null;

  return (
    <button className="undo-btn" onClick={onUndo} title="Undo last action">
      ↩ Undo
    </button>
  );
});

/* ===================== STICKY TIMER BAR ===================== */
export const StickyTimerBar = React.memo(function StickyTimerBar({
  running,
  startTime,
  activeSection,
  sectionLabels,
  totalSections,
}) {
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);

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

  // Show sticky bar when main timer scrolls out of view
  useEffect(() => {
    const handleScroll = () => {
      const timerEl = document.getElementById("main-timer");
      if (!timerEl) return;
      const rect = timerEl.getBoundingClientRect();
      setVisible(rect.bottom < 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible || !running) return null;

  const display = formatTime(elapsed);
  const isDanger = elapsed > 60000;
  const isWarning = elapsed > 50000 && !isDanger;
  const sectionLabel = sectionLabels[activeSection] || "";

  return (
    <div
      className={`sticky-timer-bar ${isWarning ? "warning" : ""} ${
        isDanger ? "danger" : ""
      }`}
    >
      <span className="sticky-timer-section">{sectionLabel}</span>
      <span
        className={`sticky-timer-display ${
          isDanger ? "timer-danger" : isWarning ? "timer-warning" : ""
        }`}
      >
        {display}
      </span>
    </div>
  );
});
