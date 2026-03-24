import { useEffect, useRef, useCallback, useState } from "react";
import { RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import ObjectionMini from "./ObjectionMini";
import { useScript } from "../context/ScriptContext";
import { useSessionTracker } from "../hooks/useSessionTracker";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreLive } from "../context/ComplianceScorer";
import {
  MainTimer,
  ProgressBar,
  StickyTimerBar,
  SectionTimer,
} from "./SharedUI";
import ComplianceMini from "./ComplianceMini";
import CopilotMiniFloat from "./CopilotMiniFloat";
import CallerInfo from "./CallerInfo";
import CallTimer from "./CallTimer";
import QuickNotes from "./QuickNotes";
import { SECTION_LABELS, TOTAL_SECTIONS } from "../context/scriptReducer";
import SectionRecording from "./SectionRecording";
import SectionTPMO from "./SectionTPMO";
import SectionSNP from "./SectionSNP";
import SectionSOA from "./SectionSOA";
import SectionQualifications from "./SectionQualifications";
import SectionNEADS from "./SectionNEADS";
import SectionSOB from "./SectionSOB";
import SectionEnrollment from "./SectionEnrollment";
import SectionWrapUp from "./SectionWrapUp";
import ScriptPrompter from "./ScriptPrompter";
import ComplianceDashboard from "./ComplianceDashboard";
import { motion, AnimatePresence } from "framer-motion";

/**
 * ScriptFlow v2 — Now with transcript pass-through for dual-layer scoring.
 *
 * The ScriptPrompter exposes its transcript via onTranscriptChange callback.
 * This transcript is passed down to ComplianceMini and ComplianceDashboard
 * so the compliance scoring engine can do live intent detection against
 * the actual words the agent speaks — not just checkbox state.
 *
 * NOTE: ScriptPrompter needs a small update to call props.onTranscriptChange
 * whenever its transcript state changes. See INTEGRATION_GUIDE.md for the
 * 3-line change needed.
 */

/* ---- Collapsible wrapper for completed sections ---- */
function CollapsibleSection({
  sectionNum,
  label,
  isCompleted,
  isActive,
  children,
  sectionTimestamps,
  canUndo,
  onUndo,
}) {
  if (!isCompleted || isActive) {
    return <div data-section={sectionNum}>{children}</div>;
  }

  return (
    <details className="completed-section" data-section={sectionNum}>
      <summary className="completed-section-summary">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 4,
            background: "rgba(168,85,247,0.15)",
            border: "1px solid rgba(168,85,247,0.4)",
            color: "#a855f7",
            fontSize: "0.65rem",
            fontWeight: 800,
            fontFamily: "'IBM Plex Mono', monospace",
            flexShrink: 0,
          }}
        >
          {sectionNum}
        </span>
        <span className="completed-label">{label}</span>
        {sectionTimestamps[sectionNum]?.start &&
          sectionTimestamps[sectionNum]?.end && (
            <span className="completed-time">
              {formatDuration(
                sectionTimestamps[sectionNum].end -
                  sectionTimestamps[sectionNum].start
              )}
            </span>
          )}
        {canUndo && (
          <button
            className="section-undo-btn"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUndo(); }}
            title="Undo last action"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </summary>
      <div className="completed-section-body">{children}</div>
    </details>
  );
}

function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ---- Responsive right rail with toggle for ≤1400px ---- */
function RightRail({ transcript, activeSection, state, callStarted, onQuickNotes }) {
  const [open, setOpen] = useState(false);
  const railRef = useRef(null);
  const { entries } = useCopilotLog();

  const result = scoreLive(state, entries, transcript);
  const currentStep = Number.isInteger(activeSection)
    ? activeSection
    : Math.ceil(activeSection);
  const sectionLabel = SECTION_LABELS[currentStep] || `Section ${currentStep}`;

  // Close overlay on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (railRef.current && !railRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Always-visible rail for >1400px (CSS hides the toggle, shows this) */}
      <div className="right-rail-full">
        <CallTimer startTime={state.tpmoStart} />
        <CallerInfo />
        <QuickNotes onNotesChange={onQuickNotes} />
        <ObjectionMini />
        <CopilotMiniFloat />
        <ComplianceMini transcript={transcript} activeSection={activeSection} />
      </div>

      {/* Toggle tab for ≤1400px (CSS hides on >1400) */}
      <button
        className="right-rail-toggle"
        onClick={() => setOpen((p) => !p)}
        title="Toggle compliance rail"
      >
        <span className="right-rail-toggle-score">{result.score}%</span>
        <span className="right-rail-toggle-section">{currentStep}. {sectionLabel}</span>
        {open ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Scrim + overlay for ≤1400px */}
      {open && <div className="right-rail-scrim" onClick={() => setOpen(false)} />}
      <div
        ref={railRef}
        className={`right-rail-overlay${open ? " open" : ""}`}
      >
        <CallTimer startTime={state.tpmoStart} />
        <CallerInfo />
        <QuickNotes onNotesChange={onQuickNotes} />
        <ObjectionMini />
        <CopilotMiniFloat />
        <ComplianceMini transcript={transcript} activeSection={activeSection} />
      </div>
    </>
  );
}

export default function ScriptFlow() {
  const { state, dispatch, activeSection } = useScript();
  const { clearLog } = useCopilotLog();
  const prevSectionRef = useRef(activeSection);
  const session = useSessionTracker();
  const scoredSectionsRef = useRef(new Set());
  const [callStarted, setCallStarted] = useState(false);

  // Start session only after agent clicks Start Call
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (!callStarted || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    clearLog();
    session.startSession("ma");
    dispatch({ type: "MARK_SECTION_START", section: 1 });
    dispatch({ type: "START_TIMER" });
  }, [callStarted, clearLog, session, dispatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current) {
        session.endSession(prevSectionRef.current, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Log section scores when a section gate completes (section changes forward)
  const prevScoreSection = useRef(activeSection);
  useEffect(() => {
    const prev = prevScoreSection.current;
    if (activeSection !== prev && activeSection > prev) {
      prevScoreSection.current = activeSection;
      const ts = state.sectionTimestamps[prev];
      const dur = ts?.start && ts?.end ? Math.round((ts.end - ts.start) / 1000) : null;
      const label = SECTION_LABELS[prev] || `Section ${prev}`;
      if (!scoredSectionsRef.current.has(prev)) {
        scoredSectionsRef.current.add(prev);
        session.logSectionScore(prev, label, true, dur, null, null);
      }
    }
  }, [activeSection, state.sectionTimestamps, session]);

  // ── Shared transcript state ──
  // ScriptPrompter writes to this, ComplianceMini/Dashboard read it
  const [transcript, setTranscript] = useState("");

  // ── Quick notes — persists into wrap-up ──
  const quickNotesRef = useRef("");
  const handleQuickNotes = useCallback((val) => { quickNotesRef.current = val; }, []);

  // Auto-scroll to active section when it changes
  useEffect(() => {
    if (activeSection !== prevSectionRef.current) {
      prevSectionRef.current = activeSection;
      requestAnimationFrame(() => {
        setTimeout(() => {
          const activeEl = document.querySelector(".active-card");
          if (activeEl) {
            activeEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
      });
    }
  }, [activeSection]);

  // Click a completed section in the rail to scroll back to it
  const handleSectionClick = useCallback((sectionNum) => {
    const el = document.querySelector(`[data-section="${sectionNum}"]`);
    if (!el) return;
    // If it's a collapsed <details>, open it
    if (el.tagName === "DETAILS" && !el.open) {
      el.open = true;
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (state.undoHistory.length > 0) {
          const last = state.undoHistory[state.undoHistory.length - 1];
          if (Date.now() - last.timestamp < 30000) {
            e.preventDefault();
            dispatch({ type: "UNDO_LAST_GATE" });
          }
        }
      }
    },
    [state.undoHistory, dispatch]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const ts = state.sectionTimestamps;

  return (
    <motion.div
      className="flow"
      initial={{ opacity: 0, y: 40, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <StickyTimerBar
        running={state.tpmoRunning}
        startTime={state.tpmoStart}
        activeSection={activeSection}
        sectionLabels={SECTION_LABELS}
        totalSections={TOTAL_SECTIONS}
      />

      {/* Right rail — responsive: always visible >1400, overlay ≤1400 */}
      <RightRail transcript={transcript} activeSection={activeSection} state={state} callStarted={callStarted} onQuickNotes={handleQuickNotes} />

      <div className="flow-shell">
        <div className="flow-main">

      {/* ── AI Co-Pilot — passes transcript up via callback ── */}
      <ScriptPrompter onTranscriptChange={setTranscript} logComplianceFlag={session.logComplianceFlag} />

      {/* Start Call gate — timer and session don't begin until clicked */}
      {!callStarted && (
        <section className="card" style={{ textAlign: "center", padding: "28px 20px" }}>
          <button
            className="primary"
            onClick={() => setCallStarted(true)}
            style={{
              fontSize: 15,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "10px 36px",
            }}
          >
            Start Call
          </button>
          <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>
            Timer begins when you click Start Call
          </p>
        </section>
      )}

      {/* Sequential enrollment flow sections */}
      {callStarted && (
      <>
      {(() => {
        const undoSection = state.undoHistory.length > 0 &&
          (Date.now() - state.undoHistory[state.undoHistory.length - 1].timestamp) < 30000
          ? Math.floor(activeSection) - 1
          : null;
        const handleUndo = () => dispatch({ type: "UNDO_LAST_GATE" });
        return (
          <>
      <CollapsibleSection
        sectionNum={1}
        label="Recording Disclosure"
        isCompleted={state.recordingOk}
        isActive={activeSection === 1}
        sectionTimestamps={ts}
        canUndo={undoSection === 1}
        onUndo={handleUndo}
      >
        <SectionRecording />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={2}
        label="TPMO Disclaimer"
        isCompleted={state.tpmoOk}
        isActive={activeSection === 2}
        sectionTimestamps={ts}
        canUndo={undoSection === 2}
        onUndo={handleUndo}
      >
        <SectionTPMO />
      </CollapsibleSection>

      <SectionSNP />

      <CollapsibleSection
        sectionNum={3}
        label="POA & Scope of Appointment"
        isCompleted={state.soaOk}
        isActive={activeSection === 3}
        sectionTimestamps={ts}
        canUndo={undoSection === 3}
        onUndo={handleUndo}
      >
        <SectionSOA />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={4}
        label="Qualifications"
        isCompleted={state.qualOk}
        isActive={activeSection === 4}
        sectionTimestamps={ts}
        canUndo={undoSection === 4}
        onUndo={handleUndo}
      >
        <SectionQualifications />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={5}
        label="NEADS Assessment"
        isCompleted={state.neadsOk}
        isActive={activeSection === 5}
        sectionTimestamps={ts}
        canUndo={undoSection === 5}
        onUndo={handleUndo}
      >
        <SectionNEADS />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={6}
        label="Plan Selection & SOB"
        isCompleted={state.sobOk}
        isActive={activeSection === 6}
        sectionTimestamps={ts}
        canUndo={undoSection === 6}
        onUndo={handleUndo}
      >
        <SectionSOB />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={7}
        label="Enrollment"
        isCompleted={state.enrollOk}
        isActive={activeSection === 7}
        sectionTimestamps={ts}
        canUndo={undoSection === 7}
        onUndo={handleUndo}
      >
        <SectionEnrollment />
      </CollapsibleSection>
          </>
        );
      })()}

      <SectionWrapUp />

      {/* ── Full Compliance Dashboard — transcript-aware, at the bottom ── */}
      <div id="compliance-hub">
        <ComplianceDashboard transcript={transcript} />
      </div>
      </>
      )}
        </div>
      </div>
    </motion.div>
  );
}
