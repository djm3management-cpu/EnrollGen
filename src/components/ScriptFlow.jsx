import {
  lazy,
  Fragment,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, ShieldCheck, Radio } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { useAppAuth } from "../context/AuthContext";
import {
  getActiveSessionMetadata,
  setActivePostCallMetadata,
  useSessionTracker,
  waitForActiveSessionMetadata,
} from "../hooks/useSessionTracker";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreCompliance, scoreTwoSided } from "../context/ComplianceScorer";
import { useLiveCall } from "../context/LiveCallContext";
import {
  buildPostCallPayload,
  CHECKPOINT_INTERVAL_MS,
  checkpointPostCall,
  finalizePostCallTranscript,
  initPostCallRecord,
} from "../lib/postCallPipeline";
import {
  StickyTimerBar,
} from "./SharedUI";
import ComplianceMini from "./ComplianceMini";
import CopilotFeedMini from "./CopilotFeedMini";
import AskCopilotMini from "./AskCopilotMini";
import AgentAvailabilityToggle from "./AgentAvailabilityToggle";
import { useTrainingMode } from "../context/TrainingModeContext";
import TrainingBanner from "./training/TrainingBanner";
import TrainingExplainer from "./training/TrainingExplainer";
import SimulatedTranscriptInput from "./training/SimulatedTranscriptInput";
import { logTrainingCompletion } from "../lib/trainingCompletion";

import CollapsibleWidget from "./CollapsibleWidget";
import CallTimer from "./copilot/CallTimer";
import CenterTimerBar from "./CenterTimerBar";
import ProgressDots from "./ProgressDots";
import MiniLiveTranscript, { TranscriptTimer } from "./MiniLiveTranscript";
import { SECTION_LABELS, TOTAL_SECTIONS } from "../context/scriptReducer";
import SectionSNP from "./SectionSNP";
import SectionWrapUp from "./SectionWrapUp";
import ScriptSection from "./ScriptSection";
import ScriptPrompter from "./ScriptPrompter";
import AncillaryPopupManager from "./ancillary/AncillaryPopupManager";
import DevotedPopupManager from "./ancillary/DevotedPopupManager";
import { motion } from "framer-motion";
import { useScriptTemplate } from "../hooks/useScriptTemplate";

const ComplianceDashboard = lazy(() => import("./ComplianceDashboard"));
const FULL_RAIL_WIDTH = 296;
const COMPACT_RAIL_OVERLAY_WIDTH = "min(340px, calc(100vw - 24px))";

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
  width: FULL_RAIL_WIDTH,
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
  width: COMPACT_RAIL_OVERLAY_WIDTH,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  gap: 8,
};

const SHOW_MAIN_FLOW_COMPLIANCE_HUD = false;

/**
 * ScriptFlow v2, Now with transcript pass-through for dual-layer scoring.
 *
 * The ScriptPrompter exposes its transcript via onTranscriptChange callback.
 * This transcript is passed down to ComplianceMini and ComplianceDashboard
 * so the compliance scoring engine can do live intent detection against
 * the actual words the agent speaks, not just checkbox state.
 *
 * NOTE: ScriptPrompter needs a small update to call props.onTranscriptChange
 * whenever its transcript state changes. See INTEGRATION_GUIDE.md for the
 * 3-line change needed.
 */

/* ---- Collapsible wrapper for completed sections ---- */
function CollapsibleSection({
  sectionNum,
  isActive,
  children,
}) {
  if (!isActive) {
    return null;
  }

  return <div data-section={sectionNum}>{children}</div>;
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

/* ---- Shared widget stack, used by both full rail and overlay ---- */
function RailWidgets({
  transcript,
  activeSection,
  state,
  mergedEntries,
  listening,
  result,
  copilotHandlersRef,
  coachingLoading,
  trainingMode,
}) {
  const supportsRecognition = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const hasTranscript = !!transcript.trim();
  const handleAppendSimulated = (text) => {
    copilotHandlersRef.current?.appendSimulatedUtterance?.(text);
  };
  const handleClearSimulated = () => {
    copilotHandlersRef.current?.clearSimulatedTranscript?.();
  };

  return (
    <>
      <AgentAvailabilityToggle />

      {/* Copilot Control Strip */}
      <div className="right-rail-control-panel">
        <CallTimer fallbackStartTime={state.tpmoStart} />

        <div className="right-rail-control-row" style={{ display: "flex", gap: 4, marginTop: 8, marginBottom: 8 }}>
          <button
            className={`copilot-pill-button copilot-pill-button--listen${
              listening ? " is-listening" : ""
            }`}
            onClick={() => { const h = copilotHandlersRef.current; if (listening) h.handleStop?.(); else h.handleStart?.(); }}
            disabled={!supportsRecognition}
            style={{ cursor: supportsRecognition ? "pointer" : "not-allowed" }}
          >
            {!supportsRecognition ? "NO MIC" : listening ? "STOP" : "START"}
          </button>
          <button
            className="copilot-pill-button copilot-pill-button--clear"
            onClick={() => copilotHandlersRef.current.clearAll?.()}
          >
            CLEAR
          </button>
          <button
            className="copilot-pill-button copilot-pill-button--analyze"
            onClick={() => copilotHandlersRef.current.requestCoaching?.()}
            disabled={!hasTranscript || coachingLoading}
            style={{
              cursor: hasTranscript && !coachingLoading ? "pointer" : "not-allowed",
              opacity: !hasTranscript || coachingLoading ? 0.45 : 1,
            }}
          >
            {coachingLoading ? "ANALYZING..." : "ANALYZE"}
          </button>
        </div>
        <AskCopilotMini />
      </div>

      <div className="right-rail-divider" />

      {/* ── Live Transcript / Simulated Transcript ── */}
      <CollapsibleWidget
        title={trainingMode ? "Simulated Transcript" : "Live Transcript"}
        icon={<Radio size={11} />}
        accentColor={trainingMode ? "#ffab00" : "#39FF88"}
        headerRight={trainingMode ? null : <TranscriptTimer startTime={state.tpmoStart} />}
      >
        {trainingMode ? (
          <SimulatedTranscriptInput
            transcript={transcript}
            onAppendUtterance={handleAppendSimulated}
            onClear={handleClearSimulated}
          />
        ) : (
          <MiniLiveTranscript mergedEntries={mergedEntries} listening={listening} />
        )}
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
  trainingMode,
}) {
  const [open, setOpen] = useState(false);
  const [fullRailMinimized, setFullRailMinimized] = useState(false);
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
    trainingMode,
  };

  if (!isCompactRail) {
    if (fullRailMinimized) {
      return (
        <button
          className="right-rail-toggle right-rail-toggle--restore"
          style={COMPACT_RAIL_TOGGLE_STYLE}
          onClick={() => setFullRailMinimized(false)}
          title="Expand compliance rail"
          aria-label="Expand compliance rail"
        >
          <span className="right-rail-toggle-score">{result.score}%</span>
          <span className="right-rail-toggle-section">{currentStep}. {sectionLabel}</span>
          <ChevronLeft size={12} />
        </button>
      );
    }

    return (
      <div
        className="right-rail-full"
        style={{
          ...FULL_RAIL_STYLE,
          "--right-rail-width": `${FULL_RAIL_WIDTH}px`,
        }}
      >
        <button
          type="button"
          className="rail-minimize-btn right-rail-minimize"
          onClick={() => setFullRailMinimized(true)}
          title="Minimize compliance rail"
          aria-label="Minimize compliance rail"
        >
          <ChevronRight size={12} />
        </button>
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
        {open ? (
          <>
            <button
              type="button"
              className="rail-minimize-btn right-rail-overlay-minimize"
              onClick={() => setOpen(false)}
              title="Minimize compliance rail"
              aria-label="Minimize compliance rail"
            >
              <ChevronRight size={12} />
            </button>
            <RailWidgets {...widgetProps} />
          </>
        ) : null}
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
  const { getToken } = useAppAuth();
  const { enabled: trainingModeEnabled } = useTrainingMode();
  const { sections: scriptSections } = useScriptTemplate("ma");
  const wrapUpSection = scriptSections.find((section) => section.key === "wrapup");
  const prevSectionRef = useRef(activeSection);
  const session = useSessionTracker();
  const scoredSectionsRef = useRef(new Set());
  const [callStarted, setCallStarted] = useState(false);
  const trainingStartRef = useRef(null);
  const trainingLoggedRef = useRef(false);
  const checkpointKeyRef = useRef("");
  const finalTranscriptSavedRef = useRef(false);
  const latestPostCallRef = useRef(null);
  const persistPostCallRef = useRef(null);

  // Start session only after agent clicks Start Call
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (!callStarted || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    clearLog();
    session.startSession("ma");
    dispatch({ type: "MARK_SECTION_START", section: 1 });
    dispatch({ type: "START_TIMER" });
    if (trainingModeEnabled) {
      trainingStartRef.current = Date.now();
      trainingLoggedRef.current = false;
    }
  }, [callStarted, clearLog, session, dispatch, trainingModeEnabled]);

  // Log training completion when all 8 sections have been completed in training mode
  useEffect(() => {
    if (!trainingModeEnabled) return;
    if (!callStarted) return;
    if (trainingLoggedRef.current) return;
    if (!state.enrollOk) return;
    if (activeSection < 8) return;

    trainingLoggedRef.current = true;
    const startedAt = trainingStartRef.current;
    const durationSeconds = startedAt
      ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      : null;

    logTrainingCompletion({
      productType: "MA",
      durationSeconds,
      sectionsCompleted: 8,
    });
  }, [trainingModeEnabled, callStarted, state.enrollOk, activeSection]);

  // Cleanup on unmount, mark completed if enrollment gate was reached
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current) {
        session.endSession(prevSectionRef.current, !!state.enrollOk);
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
    // Log wrap-up (section 8) since there is no section 9 to trigger it
    if (activeSection >= 8 && !scoredSectionsRef.current.has(8)) {
      scoredSectionsRef.current.add(8);
      const wrapLabel = SECTION_LABELS[8] || "Wrap-Up";
      session.logSectionScore(8, wrapLabel, true, null, null, null);
    }
  }, [activeSection, state.sectionTimestamps, session]);

  // ── Shared transcript state ──
  // ScriptPrompter writes to this, ComplianceMini/Dashboard read it
  const [transcript, setTranscript] = useState("");
  const [mergedTranscriptEntries, setMergedTranscriptEntries] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [agentAudioLevel, setAgentAudioLevel] = useState(0);
  const [customerAudioLevel, setCustomerAudioLevel] = useState(0);
  const copilotHandlersRef = useRef({});
  const autoStartCallRef = useRef(false);

  useEffect(() => {
    if (autoStartCallRef.current) return undefined;
    autoStartCallRef.current = true;
    setCallStarted(true);

    let attempts = 0;
    const startWhenReady = () => {
      attempts += 1;
      const handleStart = copilotHandlersRef.current?.handleStart;
      if (handleStart) {
        void handleStart({ skipCustomerAudio: true });
        return true;
      }
      return attempts >= 20;
    };

    if (startWhenReady()) return undefined;

    const intervalId = window.setInterval(() => {
      if (startWhenReady()) {
        window.clearInterval(intervalId);
      }
    }, 100);

    return () => window.clearInterval(intervalId);
  }, []);

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
    latestPostCallRef.current = {
      state,
      liveCall: {
        callStarted,
        callDirection: state.callDirection,
        transcript,
        customerTranscript,
        mergedTranscript: mergedTranscriptEntries,
        isListening,
        complianceResult: liveComplianceResult,
      },
    };
  }, [
    state,
    callStarted,
    transcript,
    customerTranscript,
    mergedTranscriptEntries,
    isListening,
    liveComplianceResult,
  ]);

  const persistPostCallTranscript = useCallback(
    async ({ final = false, force = false } = {}) => {
      if (trainingModeEnabled) return null;

      const snapshot = latestPostCallRef.current;
      if (!snapshot?.state) return null;

      let metadata = getActiveSessionMetadata();
      if (!metadata.sessionId || !metadata.agentId) {
        metadata = await waitForActiveSessionMetadata(2000);
      }

      if (!metadata.sessionId || !metadata.agentId) {
        return null;
      }

      const payload = buildPostCallPayload({
        state: snapshot.state,
        liveCall: snapshot.liveCall,
        sessionMetadata: metadata,
        flow: "ma",
        final,
      });

      const checkpointKey = [
        payload.session_id,
        payload.call_record_id || "",
        payload.transcript_text?.length || 0,
        payload.transcript_text?.slice(-80) || "",
        final ? "final" : "checkpoint",
      ].join("|");

      if (!force && checkpointKey === checkpointKeyRef.current) {
        return null;
      }

      checkpointKeyRef.current = checkpointKey;

      const result = final
        ? await finalizePostCallTranscript(getToken, payload)
        : await checkpointPostCall(getToken, payload);

      setActivePostCallMetadata({
        callRecordId: result.call_record_id || metadata.callRecordId || null,
        transcriptId: result.transcript_id || metadata.transcriptId || null,
      });

      return result;
    },
    [getToken, trainingModeEnabled]
  );

  useEffect(() => {
    persistPostCallRef.current = persistPostCallTranscript;
  }, [persistPostCallTranscript]);

  useEffect(() => {
    if (!callStarted || trainingModeEnabled) return undefined;

    let cancelled = false;
    void (async () => {
      let metadata = await waitForActiveSessionMetadata(2500);
      if (cancelled || !metadata.sessionId || !metadata.agentId || metadata.callRecordId) {
        return;
      }

      const snapshot = latestPostCallRef.current;
      const payload = buildPostCallPayload({
        state: snapshot?.state || state,
        liveCall: snapshot?.liveCall || {
          callStarted,
          callDirection: state.callDirection,
          transcript,
          mergedTranscript: mergedTranscriptEntries,
        },
        sessionMetadata: metadata,
        flow: "ma",
      });

      try {
        const result = await initPostCallRecord(getToken, payload);
        setActivePostCallMetadata({
          callRecordId: result.call_record_id || null,
          transcriptId: result.transcript_id || null,
        });
      } catch (error) {
        console.error("[PostCall] init failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    callStarted,
    trainingModeEnabled,
    getToken,
    state,
    transcript,
    mergedTranscriptEntries,
  ]);

  useEffect(() => {
    if (!callStarted || trainingModeEnabled) return undefined;

    const intervalId = window.setInterval(() => {
      void persistPostCallTranscript({ final: false });
    }, CHECKPOINT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [callStarted, trainingModeEnabled, persistPostCallTranscript]);

  useEffect(() => {
    if (!callStarted || !state.enrollOk || finalTranscriptSavedRef.current) return;
    finalTranscriptSavedRef.current = true;
    void persistPostCallTranscript({ final: true, force: true });
  }, [callStarted, state.enrollOk, persistPostCallTranscript]);

  useEffect(() => {
    return () => {
      if (persistPostCallRef.current) {
        void persistPostCallRef.current({ final: true, force: true });
      }
      resetLiveCall();
    };
  }, [resetLiveCall]);

  // ── Quick notes, persists into wrap-up ──
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

  const canGoBack = state.undoHistory.length > 0;
  const handleGoBack = useCallback(() => {
    if (!state.undoHistory.length) {
      return;
    }
    dispatch({ type: "UNDO_LAST_GATE" });
  }, [dispatch, state.undoHistory.length]);

  const leftPopupStack = (
    <div className="left-floating-popup-stack">
      <DevotedPopupManager
        callStarted={callStarted}
        transcript={transcript}
        mergedTranscript={mergedTranscriptEntries}
      />
      <AncillaryPopupManager
        activeSection={activeSection}
        callStarted={callStarted}
      />
    </div>
  );

  return (
    <>
    {typeof document !== "undefined"
      ? createPortal(leftPopupStack, document.body)
      : null}
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

      {/* Right rail, responsive: always visible >1400, overlay ≤1400 */}
      <RightRail
        transcript={transcript}
        activeSection={activeSection}
        state={state}
        mergedEntries={mergedTranscriptEntries}
        listening={isListening}
        result={liveComplianceResult}
        copilotHandlersRef={copilotHandlersRef}
        coachingLoading={coachingLoading}
        trainingMode={trainingModeEnabled}
      />

      <div className="flow-shell">
        <div className="flow-main">

      {trainingModeEnabled ? <TrainingBanner /> : null}

      <CenterTimerBar
        agentLevel={agentAudioLevel}
        customerLevel={customerAudioLevel}
        agentActive={isListening}
        customerActive={customerAudioLevel > 0.015}
      />

      {/* ── AI Co-Pilot, passes transcript up via callback ── */}
      <ScriptPrompter
        onTranscriptChange={setTranscript}
        onMergedTranscriptChange={setMergedTranscriptEntries}
        onListeningChange={setIsListening}
        logComplianceFlag={session.logComplianceFlag}
        controlsRef={copilotHandlersRef}
        onCoachingLoadingChange={setCoachingLoading}
        onAgentAudioLevelChange={setAgentAudioLevel}
        onCustomerAudioLevelChange={setCustomerAudioLevel}
      />

      {/* Idle state: retained only if automatic start is blocked before controls mount. */}
      {!callStarted && (
        <section
          className="script-start-call-gate script-start-call-gate--bare"
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "24px 0",
            color: "var(--eg-text-mid)",
            fontFamily: "var(--eg-font-body)",
            fontSize: 13,
          }}
        >
          Audio meters initialize automatically.
        </section>
      )}

      {/* Sequential enrollment flow sections */}
      {callStarted && (
      <>
      {canGoBack ? (
        <div className="flow-card-nav">
          <button
            type="button"
            className="flow-back-button"
            onClick={handleGoBack}
            aria-label="Go to previous card"
            title="Go to previous card"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </button>
        </div>
      ) : null}
      {scriptSections
        .filter((section) => section.key !== "wrapup")
        .map((section, index) => {
          const sectionNum = Number(section.section_number || index + 1);
          const rendered = (
            <CollapsibleSection
              key={section.key}
              sectionNum={sectionNum}
              isActive={activeSection === sectionNum}
            >
              <ScriptSection section={section} />
              {trainingModeEnabled ? <TrainingExplainer section={sectionNum} /> : null}
            </CollapsibleSection>
          );

          if (section.gate_field === "tpmoOk") {
            return (
              <Fragment key={section.key}>
                {rendered}
                <SectionSNP />
              </Fragment>
            );
          }

          return rendered;
        })}

      {activeSection >= 8 && (
        <>
          <SectionWrapUp scriptBody={wrapUpSection?.body} />
          {trainingModeEnabled ? <TrainingExplainer section={8} /> : null}
        </>
      )}

      <ProgressDots
        sections={scriptSections
          .filter((section) => section.key !== "wrapup")
          .map((section, index) => {
            const sectionNum = Number(section.section_number || index + 1);
            const gateField = section.gate_field;
            const gateDone = gateField ? Boolean(state[gateField]) : false;
            let status = "pending";
            if (gateDone) status = "done";
            else if (sectionNum === activeSection) status = "active";
            return {
              key: section.key,
              label: section.title || SECTION_LABELS[sectionNum] || `Section ${sectionNum}`,
              status,
              sectionNum,
            };
          })}
      />

      {/* ── Full Compliance Dashboard, transcript-aware, at the bottom ── */}
      {SHOW_MAIN_FLOW_COMPLIANCE_HUD ? (
        <DeferredComplianceDashboard
          transcript={debouncedTranscript}
          customerTranscript={customerTranscript}
          mergedTranscript={mergedTranscriptEntries}
          result={liveComplianceResult}
        />
      ) : null}
      </>
      )}
        </div>
      </div>
    </motion.div>
    </>
  );
}
