import React, { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, RotateCcw, AlertCircle, Clock, Timer } from "lucide-react";

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
          {copied ? (
            <><Check size={11} /> Copied</>
          ) : (
            <><Copy size={11} /> Copy</>
          )}
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

      <p className="muted timer-notice">
        <Clock size={11} style={{ verticalAlign: "middle", marginRight: 5 }} />
        TPMO REQUIRED WITHIN 60 SECONDS
      </p>
    </section>
  );
});

/* ===================== SECTION TIMER THRESHOLDS ===================== */
// Per-section time thresholds in seconds: [warn, danger]
const SECTION_THRESHOLDS = {
  1: [45, 60], // Recording Disclosure:  warn 45s,  danger 1m
  2: [60, 120], // TPMO Disclaimer:       warn 1m,   danger 2m
  2.5: [60, 120], // SNP Disclosure:        warn 1m,   danger 2m
  3: [120, 240], // Scope of Appointment:  warn 2m,   danger 4m
  4: [180, 360], // Qualifications:        warn 3m,   danger 6m
  5: [300, 540], // NEADS Assessment:      warn 5m,   danger 9m
  6: [240, 480], // Plan Selection & SOB:  warn 4m,   danger 8m
  7: [180, 360], // Enrollment:            warn 3m,   danger 6m
  8: [120, 240], // Wrap-Up:               warn 2m,   danger 4m
};

/* ===================== SECTION TIMER ===================== */
export const SectionTimer = React.memo(function SectionTimer({
  sectionNum,
  timestamps,
}) {
  const ts = timestamps[sectionNum];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!ts || !ts.start) return;
    if (ts.end) { setElapsed(ts.end - ts.start); return; }
    const interval = setInterval(() => setElapsed(Date.now() - ts.start), 1000);
    return () => clearInterval(interval);
  }, [ts]);

  if (!ts || !ts.start) return null;

  const [warnSec, dangerSec] = SECTION_THRESHOLDS[sectionNum] || [120, 300];
  const sec = Math.floor(elapsed / 1000);
  const isDanger = sec >= dangerSec;
  const isWarn = sec >= warnSec && !isDanger;
  const isDone = !!ts.end;

  return (
    <div className="section-timer-wrap">
      <span
        className={`section-timer ${isDanger && !isDone ? "section-timer-danger" : isWarn && !isDone ? "section-timer-warn" : ""}`}
        title="Time in this section"
      >
        {isDanger && !isDone ? (
          <AlertCircle size={12} />
        ) : isWarn && !isDone ? (
          <Clock size={12} />
        ) : (
          <Timer size={12} />
        )}
        {formatTime(elapsed)}
      </span>
    </div>
  );
});

/* ===================== SECTION TOAST ===================== */
/* Rendered as first child of .card — positions itself centered on the card's top border */
export const SectionToast = React.memo(function SectionToast({
  sectionNum,
  timestamps,
}) {
  const ts = timestamps[sectionNum];
  const [elapsed, setElapsed] = useState(0);
  const [alertShown, setAlertShown] = useState({
    reminder: false,
    warn: false,
    danger: false,
  });
  const [toast, setToast] = useState(null);
  const clearToastTimeoutRef = useRef(null);

  useEffect(() => {
    if (!ts || !ts.start) return;
    if (ts.end) { setElapsed(ts.end - ts.start); return; }
    const interval = setInterval(() => setElapsed(Date.now() - ts.start), 1000);
    return () => clearInterval(interval);
  }, [ts]);

  useEffect(() => {
    if (!ts?.start || ts?.end) return;
    const [warnSec, dangerSec] = SECTION_THRESHOLDS[sectionNum] || [120, 300];
    const sec = Math.floor(elapsed / 1000);
    const scheduleToastClear = (delayMs) => {
      if (clearToastTimeoutRef.current) {
        clearTimeout(clearToastTimeoutRef.current);
      }
      clearToastTimeoutRef.current = setTimeout(() => {
        setToast(null);
        clearToastTimeoutRef.current = null;
      }, delayMs);
    };
    if (sectionNum === 1 && sec >= 10 && !alertShown.reminder) {
      setAlertShown((p) => ({ ...p, reminder: true }));
      setToast({ level: "warn", msg: "Read full disclosure" });
      scheduleToastClear(3500);
    } else if (sec >= dangerSec && !alertShown.danger) {
      setAlertShown((p) => ({ ...p, danger: true }));
      setToast({ level: "danger", msg: `Over ${dangerSec / 60}min — wrap up this section` });
      scheduleToastClear(5000);
    } else if (sec >= warnSec && !alertShown.warn) {
      setAlertShown((p) => ({ ...p, warn: true }));
      setToast({ level: "warn", msg: `${warnSec / 60}min — start moving forward` });
      scheduleToastClear(4000);
    }
  }, [elapsed, sectionNum, alertShown, ts]);

  useEffect(() => {
    setAlertShown({ reminder: false, warn: false, danger: false });
    setToast(null);
    if (clearToastTimeoutRef.current) {
      clearTimeout(clearToastTimeoutRef.current);
      clearToastTimeoutRef.current = null;
    }
  }, [ts?.start]);

  useEffect(() => {
    return () => {
      if (clearToastTimeoutRef.current) {
        clearTimeout(clearToastTimeoutRef.current);
      }
    };
  }, []);

  if (!toast || !!ts?.end) return null;

  return (
    <div className="section-timer-toast-anchor" aria-hidden="true">
      <span className={`section-timer-toast ${toast.level}`}>{toast.msg}</span>
    </div>
  );
});

/* ===================== LOCK TEXT ===================== */
export function LockText({ children }) {
  return <p className="lock">{children}</p>;
}

/* ===================== F1 SECTOR BAR ===================== */
const SECTORS = [
  { num: 1,   abbr: "REC"    },
  { num: 2,   abbr: "TPMO"   },
  { num: 3,   abbr: "SOA"    },
  { num: 4,   abbr: "QUAL"   },
  { num: 5,   abbr: "NEEDS"  },
  { num: 6,   abbr: "SOB"    },
  { num: 7,   abbr: "ENROLL" },
  { num: 8,   abbr: "WRAP"   },
];

export const SectorBar = React.memo(function SectorBar({ activeSection }) {
  const currentStep = Number.isInteger(activeSection)
    ? activeSection
    : Math.ceil(activeSection);

  function status(num) {
    if (num < currentStep) return "done";
    if (num === currentStep) return "active";
    return "pending";
  }

  return (
    <nav className="sector-bar" aria-label="Section progress">
      {SECTORS.map(({ num, abbr }, index) => {
        const s = status(num);
        return (
          <div key={num} className={`sector-step sector-step--${s}`}>
            <div className="sector-rail-node" aria-hidden="true">
              <span className="sector-dot" />
              {index < SECTORS.length - 1 && <span className="sector-connector" />}
            </div>
            <div className={`sector-block sector-block--${s}`}>
              <span className="sector-block-num">{num}</span>
              <span className="sector-block-abbr">{abbr}</span>
            </div>
          </div>
        );
      })}
    </nav>
  );
});

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
      <RotateCcw size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />
      Undo
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
      <span
        className={`sticky-timer-display ${
          isDanger ? "timer-danger" : isWarning ? "timer-warning" : ""
        }`}
      >
        {display}
      </span>
      <span className="sticky-timer-section">{sectionLabel}</span>
    </div>
  );
});
