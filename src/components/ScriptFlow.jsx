import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
} from "react";
import { RotateCcw, ChevronLeft, ChevronRight, MessageSquare, ShieldCheck, Radio } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { useSessionTracker } from "../hooks/useSessionTracker";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreCompliance, scoreTwoSided } from "../context/ComplianceScorer";
import { useLiveCall } from "../context/LiveCallContext";
import {
  StickyTimerBar,
} from "./SharedUI";
import ComplianceMini from "./ComplianceMini";
import CopilotFeedMini from "./CopilotFeedMini";
import AskCopilotMini from "./AskCopilotMini";

import CollapsibleWidget from "./CollapsibleWidget";
import MiniLiveTranscript, { TranscriptTimer } from "./MiniLiveTranscript";
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
import AncillaryPopupManager from "./ancillary/AncillaryPopupManager";
import CopilotStartPopupManager from "./ancillary/CopilotStartPopupManager";
import DevotedPopupManager from "./ancillary/DevotedPopupManager";
import { motion } from "framer-motion";

const ComplianceDashboard = lazy(() => import("./ComplianceDashboard"));

const FULL_RAIL_STYLE = {
  position: "fixed",
  top: "calc(var(--top-bar-height) + 12px)",
  right: 18,
  bottom: 18,
  zIndex: 96,
  pointerEvents: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
};

const FULL_RAIL_SCROLL_STYLE = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  width: 250,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  pointerEvents: "auto",
};

const COMPACT_RAIL_TOGGLE_STYLE = {
  position: "fixed",
  right: 0,
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 97,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
};

const COMPACT_RAIL_OVERLAY_STYLE = {
  position: "fixed",
  top: "calc(var(--top-bar-height) + 8px)",
  right: 0,
  bottom: 0,
  zIndex: 98,
  width: 268,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: 8,
};

const CALL_DIRECTION_OPTIONS = [
  { label: "Inbound", value: "inbound" },
  { label: "Outbound", value: "outbound" },
];

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
  // Future (not yet active, not completed) sections are hidden
  if (!isCompleted && !isActive) {
    return null;
  }

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

function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

/* ---- pill button shared style ---- */
const PILL_BASE = {
  flex: 1,
  borderRadius: 50,
  padding: "4px 0",
  fontSize: "0.58rem",
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  border: "1px solid rgba(255,255,255,0.07)",
  cursor: "pointer",
  transition: "all 0.15s",
  background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
};

/* ---- Shared widget stack — used by both full rail and overlay ---- */
function RailWidgets({
  transcript,
  activeSection,
  state,
  mergedEntries,
  listening,
  result,
  copilotHandlersRef,
  coachingLoading,
}) {
  const supportsRecognition = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const hasTranscript = !!transcript.trim();

  return (
    <>
      {/* ── Copilot Control Strip ── */}
      <div style={{
        width: "100%", minWidth: 230, pointerEvents: "auto",
        background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
        border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16,
        backdropFilter: "blur(12px)", boxShadow: "0 10px 24px rgba(0,0,0,0.36)",
        padding: "8px 10px 4px", marginBottom: 6,
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          <button
            onClick={() => { const h = copilotHandlersRef.current; if (listening) h.handleStop?.(); else h.handleStart?.(); }}
            disabled={!supportsRecognition}
            style={{
              ...PILL_BASE,
              background: listening
                ? "linear-gradient(145deg, rgba(232,0,45,0.2) 0%, rgba(180,0,35,0.14) 100%)"
                : PILL_BASE.background,
              border: listening ? "1px solid rgba(232,0,45,0.28)" : PILL_BASE.border,
              color: listening ? "#FF8FA3" : "#00ff41",
              cursor: supportsRecognition ? "pointer" : "not-allowed",
            }}
          >
            {!supportsRecognition ? "NO MIC" : listening ? "■ STOP" : "● START"}
          </button>
          <button
            onClick={() => copilotHandlersRef.current.clearAll?.()}
            style={{ ...PILL_BASE, color: "#666" }}
          >
            CLEAR
          </button>
          <button
            onClick={() => copilotHandlersRef.current.requestCoaching?.()}
            disabled={!hasTranscript || coachingLoading}
            style={{
              ...PILL_BASE,
              border: "1px solid rgba(157,0,255,0.45)",
              color: "#B84DFF",
              cursor: hasTranscript && !coachingLoading ? "pointer" : "not-allowed",
              opacity: !hasTranscript || coachingLoading ? 0.45 : 1,
            }}
          >
            {coachingLoading ? "ANALYZING…" : "◈ ANALYZE"}
          </button>
        </div>
        <AskCopilotMini />
      </div>

      {/* ── Thin divider ── */}
      <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 6 }} />

      {/* ── Live Transcript ── */}
      <CollapsibleWidget
        title="Live Transcript"
        icon={<Radio size={11} />}
        accentColor="#39FF88"
        headerRight={<TranscriptTimer startTime={state.tpmoStart} />}
      >
        <MiniLiveTranscript mergedEntries={mergedEntries} listening={listening} />
      </CollapsibleWidget>

      {/* ── Co-Pilot Feed ── */}
      <CollapsibleWidget title="Co-Pilot Feed" icon={<MessageSquare size={11} />} accentColor="#9D00FF">
        <CopilotFeedMini />
      </CollapsibleWidget>

      {/* ── Compliance ── */}
      <CollapsibleWidget title="Compliance" icon={<ShieldCheck size={11} />} accentColor="#E8002D">
        <ComplianceMini
          transcript={transcript}
          activeSection={activeSection}
          result={result}
        />
      </CollapsibleWidget>
    </>
  );
}

/* ---- Responsive right rail with toggle for ≤1400px ---- */
function RightRail({
  transcript,
  activeSection,
  state,
  mergedEntries,
  listening,
  result,
  copilotHandlersRef,
  coachingLoading,
}) {
  const [open, setOpen] = useState(false);
  const [isCompactRail, setIsCompactRail] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1400px)").matches
  );
  const railRef = useRef(null);
  const currentStep = Number.isInteger(activeSection)
    ? activeSection
    : Math.ceil(activeSection);
  const sectionLabel = SECTION_LABELS[currentStep] || `Section ${currentStep}`;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1400px)");
    const handleChange = (event) => setIsCompactRail(event.matches);

    setIsCompactRail(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  // Close overlay on outside click
  useEffect(() => {
    if (!open || !isCompactRail) return;
    const handler = (e) => {
      if (railRef.current && !railRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, isCompactRail]);

  // Close on Escape
  useEffect(() => {
    if (!open || !isCompactRail) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, isCompactRail]);

  useEffect(() => {
    if (!isCompactRail && open) {
      setOpen(false);
    }
  }, [isCompactRail, open]);

  const widgetProps = {
    transcript,
    activeSection,
    state,
    mergedEntries,
    listening,
    result,
    copilotHandlersRef,
    coachingLoading,
  };

  if (!isCompactRail) {
    return (
      <div className="right-rail-full" style={FULL_RAIL_STYLE}>
        <div className="right-rail-scroll" style={FULL_RAIL_SCROLL_STYLE}>
          <RailWidgets {...widgetProps} />
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        className="right-rail-toggle"
        style={COMPACT_RAIL_TOGGLE_STYLE}
        onClick={() => setOpen((p) => !p)}
        title="Toggle compliance rail"
      >
        <span className="right-rail-toggle-score">{result.score}%</span>
        <span className="right-rail-toggle-section">{currentStep}. {sectionLabel}</span>
        {open ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {open && <div className="right-rail-scrim" onClick={() => setOpen(false)} />}
      <div
        ref={railRef}
        className={`right-rail-overlay${open ? " open" : ""}`}
        style={{
          ...COMPACT_RAIL_OVERLAY_STYLE,
          display: open ? "flex" : "none",
        }}
      >
        {open ? <RailWidgets {...widgetProps} /> : null}
      </div>
    </>
  );
}

function DeferredComplianceDashboard({
  transcript,
  customerTranscript = "",
  mergedTranscript = [],
  result = null,
}) {
  const anchorRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender) {
      return undefined;
    }

    const anchor = anchorRef.current;
    if (!anchor) {
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px" }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <div
      id="compliance-hub"
      ref={anchorRef}
      className="deferred-compliance-panel"
    >
      {shouldRender ? (
        <Suspense
          fallback={
            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ color: "#8fa4bc", fontSize: "0.9rem" }}>
                Loadingâ€¦
              </div>
            </div>
          }
        >
          <ComplianceDashboard
            transcript={transcript}
            customerTranscript={customerTranscript}
            mergedTranscript={mergedTranscript}
            result={result}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default function ScriptFlow() {
  const { state, dispatch, activeSection } = useScript();
  const { clearLog, entries } = useCopilotLog();
  const { updateLiveCall, resetLiveCall } = useLiveCall();
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
  const [mergedTranscriptEntries, setMergedTranscriptEntries] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const copilotHandlersRef = useRef({});
  const customerTranscript = useMemo(
    () =>
      mergedTranscriptEntries
        .filter(
          (entry) =>
            entry.speaker === "customer" && entry.isFinal && entry.text.trim()
        )
        .map((entry) => entry.text)
        .join(" "),
    [mergedTranscriptEntries]
  );
  const debouncedTranscript = useDebouncedValue(transcript, 5000);
  const debouncedCustomerTranscript = useDebouncedValue(customerTranscript, 5000);
  const debouncedMergedTranscriptEntries = useDebouncedValue(
    mergedTranscriptEntries,
    5000
  );
  const liveComplianceResult = useMemo(
    () => {
      const scoringOptions = {
        callStarted,
        callDirection: state.callDirection,
        mergedTranscript: debouncedMergedTranscriptEntries,
        customerText: debouncedCustomerTranscript,
      };

      if (!callStarted) {
        return scoreCompliance(state, entries, "", scoringOptions);
      }

      return debouncedCustomerTranscript
        ? scoreTwoSided(
            state,
            entries,
            debouncedTranscript,
            debouncedCustomerTranscript,
            debouncedMergedTranscriptEntries,
            scoringOptions
          )
        : scoreCompliance(state, entries, debouncedTranscript, scoringOptions);
    },
    [
      callStarted,
      state,
      entries,
      debouncedTranscript,
      debouncedCustomerTranscript,
      debouncedMergedTranscriptEntries,
    ]
  );

  useEffect(() => {
    updateLiveCall({
      callStarted,
      callDirection: state.callDirection,
      activeSection,
      transcript,
      customerTranscript,
      mergedTranscript: mergedTranscriptEntries,
      isListening,
      complianceResult: liveComplianceResult,
    });
  }, [
    updateLiveCall,
    callStarted,
    state.callDirection,
    activeSection,
    transcript,
    customerTranscript,
    mergedTranscriptEntries,
    isListening,
    liveComplianceResult,
  ]);

  useEffect(() => {
    return () => {
      resetLiveCall();
    };
  }, [resetLiveCall]);

  // ── Quick notes — persists into wrap-up ──
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
      <RightRail
        transcript={transcript}
        activeSection={activeSection}
        state={state}
        mergedEntries={mergedTranscriptEntries}
        listening={isListening}
        result={liveComplianceResult}
        copilotHandlersRef={copilotHandlersRef}
        coachingLoading={coachingLoading}
      />

      <div className="flow-shell">
        <DevotedPopupManager
          callStarted={callStarted}
          transcript={transcript}
          mergedTranscript={mergedTranscriptEntries}
        />
        <AncillaryPopupManager
          activeSection={activeSection}
          callStarted={callStarted}
        />
        <div className="flow-main">

      {/* ── AI Co-Pilot — passes transcript up via callback ── */}
      <ScriptPrompter onTranscriptChange={setTranscript} onMergedTranscriptChange={setMergedTranscriptEntries} onListeningChange={setIsListening} logComplianceFlag={session.logComplianceFlag} controlsRef={copilotHandlersRef} onCoachingLoadingChange={setCoachingLoading} />

      {/* Start Call gate — timer and session don't begin until clicked */}
      <CopilotStartPopupManager callStarted={callStarted} />

      {!callStarted && (
        <section className="start-call-gate">
          <div className="start-call-gate-stack">
            <div className="start-call-direction-label">Call Direction</div>
            <div
              className="start-call-direction-toggle"
              role="radiogroup"
              aria-label="Call direction"
            >
              {CALL_DIRECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`start-call-direction-button${
                    state.callDirection === option.value ? " is-active" : ""
                  }`}
                  aria-pressed={state.callDirection === option.value}
                  onClick={() =>
                    dispatch({
                      type: "SET_FIELD",
                      field: "callDirection",
                      value: option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              className="start-call-button"
              onClick={() => setCallStarted(true)}
            >
              Start
            </button>
          </div>
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

      {activeSection >= 8 && <SectionWrapUp />}

      {/* ── Full Compliance Dashboard — transcript-aware, at the bottom ── */}
      <DeferredComplianceDashboard
        transcript={debouncedTranscript}
        customerTranscript={customerTranscript}
        mergedTranscript={mergedTranscriptEntries}
        result={liveComplianceResult}
      />
      </>
      )}
        </div>
      </div>
    </motion.div>
  );
}
