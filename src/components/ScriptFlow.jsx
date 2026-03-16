import { useEffect, useRef, useCallback, useState } from "react";
import { useScript } from "../context/ScriptContext";
import {
  MainTimer,
  ProgressBar,
  SectorBar,
  UndoButton,
  StickyTimerBar,
  SectionTimer,
} from "./SharedUI";
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
import ComplianceMini from "./ComplianceMini";
import ComplianceDashboard from "./ComplianceDashboard";
import { motion, AnimatePresence } from "framer-motion";
import DailyVerse from "./DailyVerse";

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

export default function ScriptFlow() {
  const { state, dispatch, activeSection } = useScript();
  const prevSectionRef = useRef(activeSection);

  // ── Shared transcript state ──
  // ScriptPrompter writes to this, ComplianceMini/Dashboard read it
  const [transcript, setTranscript] = useState("");

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

      <div className="flow-shell">
        <aside className="flow-rail">
          <SectorBar activeSection={activeSection} onSectionClick={handleSectionClick} />
        </aside>

        <div className="flow-main">
      <UndoButton
        undoHistory={state.undoHistory}
        onUndo={() => dispatch({ type: "UNDO_LAST_GATE" })}
      />

      {/* ── Floating Compliance Mini — transcript-aware ── */}
      <ComplianceMini transcript={transcript} />

      {/* ── AI Co-Pilot — passes transcript up via callback ── */}
      <ScriptPrompter onTranscriptChange={setTranscript} />

      {/* Sequential enrollment flow sections */}
      <CollapsibleSection
        sectionNum={1}
        label="Recording Disclosure"
        isCompleted={state.recordingOk}
        isActive={activeSection === 1}
        sectionTimestamps={ts}
      >
        <SectionRecording />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={2}
        label="TPMO Disclaimer"
        isCompleted={state.tpmoOk}
        isActive={activeSection === 2}
        sectionTimestamps={ts}
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
      >
        <SectionSOA />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={4}
        label="Qualifications"
        isCompleted={state.qualOk}
        isActive={activeSection === 4}
        sectionTimestamps={ts}
      >
        <SectionQualifications />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={5}
        label="NEADS Assessment"
        isCompleted={state.neadsOk}
        isActive={activeSection === 5}
        sectionTimestamps={ts}
      >
        <SectionNEADS />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={6}
        label="Plan Selection & SOB"
        isCompleted={state.sobOk}
        isActive={activeSection === 6}
        sectionTimestamps={ts}
      >
        <SectionSOB />
      </CollapsibleSection>

      <CollapsibleSection
        sectionNum={7}
        label="Enrollment"
        isCompleted={state.enrollOk}
        isActive={activeSection === 7}
        sectionTimestamps={ts}
      >
        <SectionEnrollment />
      </CollapsibleSection>

      <SectionWrapUp />

      {/* ── Full Compliance Dashboard — transcript-aware, at the bottom ── */}
      <div id="compliance-hub">
        <ComplianceDashboard transcript={transcript} />
      </div>

      {/* ── Daily Scripture — always visible at the bottom ── */}
      <DailyVerse />
        </div>
      </div>
    </motion.div>
  );
}
