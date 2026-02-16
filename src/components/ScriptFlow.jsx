import { useEffect, useRef, useCallback } from "react";
import { useScript } from "../context/ScriptContext";
import {
  MainTimer,
  ProgressBar,
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
    return children;
  }

  return (
    <details className="completed-section">
      <summary className="completed-section-summary">
        <span className="completed-check">✅</span>
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

  // Auto-scroll to active section when it changes
  useEffect(() => {
    if (activeSection !== prevSectionRef.current) {
      prevSectionRef.current = activeSection;

      // Small delay to let React render the new active section
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

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      // Ctrl+Z = undo last gate
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
    <div className="flow">
      {/* Sticky Timer Bar (appears when main timer scrolls out of view) */}
      <StickyTimerBar
        running={state.tpmoRunning}
        startTime={state.tpmoStart}
        activeSection={activeSection}
        sectionLabels={SECTION_LABELS}
        totalSections={TOTAL_SECTIONS}
      />

      {/* Progress Bar */}
      <ProgressBar
        activeSection={activeSection}
        totalSections={TOTAL_SECTIONS}
        sectionLabels={SECTION_LABELS}
      />

      {/* Undo Button */}
      <UndoButton
        undoHistory={state.undoHistory}
        onUndo={() => dispatch({ type: "UNDO_LAST_GATE" })}
      />

      {/* Main TPMO Timer */}
      <MainTimer
        running={state.tpmoRunning}
        startTime={state.tpmoStart}
        onStart={() => dispatch({ type: "START_TIMER" })}
        onReset={() => dispatch({ type: "RESET_TIMER" })}
      />

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
    </div>
  );
}
