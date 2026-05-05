import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Copy, Check, AlertCircle, Clock, Timer, Pencil } from "lucide-react";

/* ===================== TIMER HELPERS ===================== */
export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function extractScriptText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractScriptText).join("");
  if (React.isValidElement(node)) return extractScriptText(node.props.children);
  return "";
}

/* ===================== SCRIPT BOX (with copy button) ===================== */
export const ScriptBox = React.memo(function ScriptBox({ children, verbatim, editable = true }) {
  const [copied, setCopied] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const textRef = useRef(null);
  const sourceText = useMemo(() => extractScriptText(children), [children]);
  const [draftText, setDraftText] = useState(sourceText);

  const syncEditorHeight = useCallback(() => {
    const editor = textRef.current;
    if (!editor) return;
    editor.style.height = "0px";
    editor.style.height = `${editor.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!isDirty) setDraftText(sourceText);
  }, [sourceText, isDirty]);

  useEffect(() => {
    syncEditorHeight();
  }, [draftText, syncEditorHeight]);

  useEffect(() => {
    if (!isEditing || !textRef.current) return;
    textRef.current.focus();
    const end = textRef.current.value.length;
    textRef.current.setSelectionRange(end, end);
  }, [isEditing]);

  const handleCopy = useCallback(() => {
    const text = draftText.trim() ? draftText : sourceText;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        textRef.current?.focus();
        textRef.current?.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
  }, [draftText, sourceText]);

  return (
    <div className={`script-box ${verbatim ? "verbatim" : ""}`}>
      <div className="script-box-header">
        <div className="script-box-actions">
          <button
            className={`copy-btn script-action-btn ${isEditing ? "is-active" : ""}`}
            onClick={() => setIsEditing((current) => !current)}
            disabled={!editable}
            title={isEditing ? "Finish editing script text" : "Edit script text"}
            aria-label={isEditing ? "Finish editing script text" : "Edit script text"}
          >
            {isEditing ? (
              <Check size={13} />
            ) : (
              <Pencil size={13} />
            )}
          </button>
          <button
            className="copy-btn"
            onClick={handleCopy}
            title="Copy to clipboard"
            aria-label="Copy script text"
          >
            {copied ? (
              <Check size={13} />
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>
      </div>
      <textarea
        ref={textRef}
        className={`script-box-editor ${isEditing ? "is-editing" : ""}`}
        value={draftText}
        onChange={(e) => {
          if (!editable) return;
          setDraftText(e.target.value);
          setIsDirty(true);
        }}
        readOnly={!editable || !isEditing}
        spellCheck={false}
        aria-label="Editable script text"
      />
    </div>
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
  variant = "pill",
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
  const isInline = variant === "inline";
  const timerClassName = `section-timer${
    isInline ? " section-timer--inline" : ""
  } ${isDanger && !isDone ? "section-timer-danger" : isWarn && !isDone ? "section-timer-warn" : ""}`;

  return (
    <div className={`section-timer-wrap${isInline ? " section-timer-wrap--inline" : ""}`}>
      <span
        className={timerClassName}
        title="Time in this section"
      >
        {!isInline &&
          (isDanger && !isDone ? (
            <AlertCircle size={12} />
          ) : isWarn && !isDone ? (
            <Clock size={12} />
          ) : (
            <Timer size={12} />
          ))}
        {formatTime(elapsed)}
      </span>
    </div>
  );
});

/* ===================== SECTION TOAST ===================== */
/* Rendered as first child of .card — positions itself centered on the card's top border */
export const SectionToast = React.memo(function SectionToast() {
  return null;
});

/* ===================== LOCK TEXT ===================== */
export function LockText() {
  return null;
}

export const SectionAdvanceButton = React.memo(function SectionAdvanceButton({
  disabled,
  onClick,
  ariaLabel,
  title,
}) {
  const accessibleLabel = ariaLabel || "Mark section complete";

  return (
    <button
      type="button"
      className="primary section-complete-btn"
      disabled={disabled}
      onClick={onClick}
      aria-label={accessibleLabel}
      title={title || accessibleLabel}
    >
      <Check size={18} strokeWidth={2.8} aria-hidden="true" />
    </button>
  );
});

/* ===================== F1 SECTOR BAR ===================== */
/* ===================== STICKY TIMER BAR ===================== */
export const StickyTimerBar = React.memo(function StickyTimerBar({
  running,
  startTime,
  activeSection,
  sectionLabels,
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
