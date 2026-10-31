import { debugLog } from "../lib/debugLog.js";
import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLeftRailManager } from "./leftRail/LeftRailManager";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Radio } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { useAppAuth } from "../context/AuthContext";
import {
  getActiveSessionMetadata,
  setActivePostCallMetadata,
  useSessionTracker,
  waitForActiveSessionMetadata,
} from "../hooks/useSessionTracker";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { useLiveCall } from "../context/LiveCallContext";
import { telephonyCallIdentity } from "../lib/telephonyCallIdentity.js";
import { registerConferenceCheckpoint } from '../lib/conferenceCheckpoint';
import { agentTrackActive } from "../lib/transcriptionHealth.js";
import { useAvailability } from "../context/AvailabilityContext";
import { evidenceRequest } from "../lib/evidenceApi.js";
import { useInboundCall } from "../context/InboundCallContext";
import { consumePendingCallContact, hydrateNotesFromContact } from "../lib/callLaunch";
import {
  buildPostCallPayload,
  CHECKPOINT_INTERVAL_MS,
  installTranscriptExitFlush,
  checkpointPostCall,
  finalizePostCallTranscript,
  initPostCallRecord,
} from "../lib/postCallPipeline";
import { persistBeforeReset } from "../lib/persistBeforeReset";
import {
  StickyTimerBar,
} from "./SharedUI";
import CopilotFeedMini from "./CopilotFeedMini";
import AskCopilotMini from "./AskCopilotMini";
import DtmfKeypad from "./DtmfKeypad";
import CrossSellTrigger from "./copilot/CrossSellTrigger";

import CollapsibleWidget from "./CollapsibleWidget";
import CallTimer from "./copilot/CallTimer";
import CenterTimerBar from "./CenterTimerBar";
import ProgressDots from "./ProgressDots";
import MiniLiveTranscript, { TranscriptTimer } from "./MiniLiveTranscript";
import { SECTION_LABELS, TOTAL_SECTIONS } from "../context/scriptReducer";
import SectionWrapUp from "./SectionWrapUp";
import ScriptSection from "./ScriptSection";
import ScriptPrompter from "./ScriptPrompter";
import AncillaryPopupManager from "./ancillary/AncillaryPopupManager";
import DevotedPopupManager from "./ancillary/DevotedPopupManager";
import { motion } from "framer-motion";
import { useScriptTemplate } from "../hooks/useScriptTemplate";

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

const MA_FIRST_CARD_WINDOW_SECONDS = 90;

/**
 * ScriptFlow with transcript pass-through for live assistance.
 *
 * The ScriptPrompter exposes its transcript via onTranscriptChange callback.
 * This transcript is passed down to live Co-Pilot widgets
 * so the compliance scoring engine can do live intent detection against
 * the actual words the agent speaks, not just checkbox state.
 *
 * NOTE: ScriptPrompter needs a small update to call props.onTranscriptChange
 * whenever its transcript state changes. See INTEGRATION_GUIDE.md for the
 * 3-line change needed.
 */

function MAFirstCardCountdown({ startTime }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [startTime]);

  const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
  const remainingSeconds = Math.max(
    0,
    MA_FIRST_CARD_WINDOW_SECONDS - elapsedSeconds
  );
  const progress = Math.max(
    0,
    Math.min(100, (remainingSeconds / MA_FIRST_CARD_WINDOW_SECONDS) * 100)
  );
  const tone =
    remainingSeconds <= 0
      ? "expired"
      : remainingSeconds <= 15
        ? "danger"
        : remainingSeconds <= 30
          ? "warning"
          : "active";

  return (
    <aside
      className={`ma-first-card-countdown ma-first-card-countdown--${tone}`}
      aria-label={`MA first card 90 second timer, ${remainingSeconds} seconds remaining`}
    >
      <span className="ma-first-card-countdown__label">90 SEC</span>
      <strong className="ma-first-card-countdown__time">
        {remainingSeconds}
      </strong>
      <span className="ma-first-card-countdown__caption">
        {remainingSeconds > 0 ? "LEFT" : "UP"}
      </span>
      <span className="ma-first-card-countdown__track" aria-hidden="true">
        <span
          className="ma-first-card-countdown__fill"
          style={{ width: `${progress}%` }}
        />
      </span>
    </aside>
  );
}

/* ---- Collapsible wrapper for completed sections ---- */
function CollapsibleSection({
  sectionNum,
  isActive,
  sidecar = null,
  children,
}) {
  if (!isActive) {
    return null;
  }

  if (sidecar) {
    return (
      <div className="ma-first-card-layout" data-section={sectionNum}>
        {sidecar}
        <div className="ma-first-card-main">{children}</div>
      </div>
    );
  }

  return <div data-section={sectionNum}>{children}</div>;
}

/* ---- Shared widget stack, used by both full rail and overlay ---- */
function RailWidgets({
  transcript,
  state,
  dispatch,
  mergedEntries,
  listening,
  copilotHandlersRef,
  coachingLoading,
  onManualCopilotStart,
}) {
  const phone = useInboundCall();
  const supportsRecognition = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const hasTranscript = !!transcript.trim();

  return (
    <>
      {/* Copilot Control Strip */}
      <div className="right-rail-control-panel">
        <CallTimer fallbackStartTime={state.tpmoStart} />

        <div className="right-rail-control-row" style={{ display: "flex", gap: 4, marginTop: 8, marginBottom: 8 }}>
          <button data-key-role="secondary"
            className={`copilot-pill-button copilot-pill-button--listen${
              listening ? " is-listening" : ""
            }`}
            onClick={() => {
              const h = copilotHandlersRef.current;
              if (listening) {
                h.handleStop?.();
              } else {
                onManualCopilotStart?.();
              }
            }}
            disabled={!supportsRecognition}
            style={{ cursor: supportsRecognition ? "pointer" : "not-allowed" }}
          >
            {!supportsRecognition ? "NO MIC" : listening ? "STOP" : "START"}
          </button>
          <button data-key-role="secondary"
            className="copilot-pill-button copilot-pill-button--clear"
            onClick={() => copilotHandlersRef.current.clearAll?.()}
          >
            CLEAR
          </button>
          <button data-key-role="secondary"
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
          <DtmfKeypad />
        </div>
      </div>

      <div className="right-rail-divider" />

      {/* ── Unified Co-Pilot ── */}
      <CollapsibleWidget title="Co-Pilot" fillHeight icon={<MessageSquare size={11} />} accentColor="var(--chart-4)">
        <div className="unified-copilot-widget">
          <CopilotFeedMini />
          <AskCopilotMini />
        </div>
      </CollapsibleWidget>

      {/* ── Live Transcript ── */}
      <CollapsibleWidget
        title="Live Transcript"
        fillHeight
        icon={<Radio size={11} />}
        accentColor="var(--status-live)"
        headerRight={<TranscriptTimer startTime={state.tpmoStart} />}
      >
        <MiniLiveTranscript mergedEntries={mergedEntries} listening={listening} />
      </CollapsibleWidget>

      <CrossSellTrigger
        primaryProduct="MA"
        primaryCarrier={state.notes?.carrierName}
        clientAge=""
        clientState={state.notes?.customerState}
        enrolled={Boolean(phone?.activeCall && state.enrollOk && (state.notes?.callOutcome || "enrolled") === "enrolled")}
        acknowledged={Boolean(state.crossSellAcknowledged)}
        onAcknowledged={(payload) =>
          dispatch?.({
            type: "SET_CROSS_SELL_ACKNOWLEDGED",
            value: true,
            payload,
          })
        }
      />
    </>
  );
}

/* ---- Responsive right rail with toggle for ≤1400px ---- */
function RightRail({
  transcript,
  activeSection,
  state,
  dispatch,
  mergedEntries,
  listening,
  result,
  copilotHandlersRef,
  coachingLoading,
  onManualCopilotStart,
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
    dispatch,
    mergedEntries,
    listening,
    result,
    copilotHandlersRef,
    coachingLoading,
    onManualCopilotStart,
  };

  if (!isCompactRail) {
    if (fullRailMinimized) {
      return (
        <button data-key-role="secondary"
          className="right-rail-toggle right-rail-toggle--restore"
          style={COMPACT_RAIL_TOGGLE_STYLE}
          onClick={() => setFullRailMinimized(false)}
          title="Expand Co-Pilot rail"
          aria-label="Expand Co-Pilot rail"
        >
          <span className="right-rail-toggle-score">Co-Pilot</span>
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
        <button data-key-role="secondary"
          type="button"
          className="rail-minimize-btn right-rail-minimize"
          onClick={() => setFullRailMinimized(true)}
          title="Minimize Co-Pilot rail"
          aria-label="Minimize Co-Pilot rail"
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
      <button data-key-role="secondary"
        className="right-rail-toggle"
        style={COMPACT_RAIL_TOGGLE_STYLE}
        onClick={() => setOpen((p) => !p)}
        title="Toggle Co-Pilot rail"
      >
        <span className="right-rail-toggle-score">Co-Pilot</span>
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
            <button data-key-role="secondary"
              type="button"
              className="rail-minimize-btn right-rail-overlay-minimize"
              onClick={() => setOpen(false)}
              title="Minimize Co-Pilot rail"
              aria-label="Minimize Co-Pilot rail"
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

export default function ScriptFlow() {
  const { promptTarget } = useLeftRailManager();
  const { state, dispatch, activeSection } = useScript();
  const { clearLog } = useCopilotLog();
  const { updateLiveCall, resetLiveCall } = useLiveCall();
  const { getToken } = useAppAuth();
  const { sections: scriptSections } = useScriptTemplate("ma");
  const wrapUpSection = scriptSections.find((section) => section.key === "wrapup");
  const prevSectionRef = useRef(activeSection);
  const inbound = useInboundCall();
  const availability = useAvailability();
  const session = useSessionTracker();
  const completeSession = session.completeSession;
  const scoredSectionsRef = useRef(new Set());
  const [callStarted, setCallStarted] = useState(false);
  const [wrapUpSaved, setWrapUpSaved] = useState(false);
  const [callGeneration, setCallGeneration] = useState(0);
  const checkpointKeyRef = useRef("");
  const finalTranscriptSavedRef = useRef(false);
  const latestPostCallRef = useRef(null);
  const finalPersistencePromiseRef = useRef(null);
  const persistFinalTranscriptRef = useRef(null);
  const previousSoftphoneActiveRef = useRef(false);
  const initializedPostCallSessionsRef = useRef(new Set());
  const checkpointPendingRef = useRef(false);
  const [postCallPersistenceError, setPostCallPersistenceError] = useState("");

  // Start session only after agent clicks Start Call
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (!callStarted || sessionStartedRef.current) return;
    if (inbound?.activeCall?.params?.direction === 'outbound' && !inbound.activeCall.params.attemptId) return;
    sessionStartedRef.current = true;
    clearLog();
    const identity = inbound?.activeCall ? telephonyCallIdentity(inbound.activeCall)
      : {telephonyCall:false,twilioCallSid:null};
    void session.startSession("ma", {...identity, callDirection:inbound?.activeCall?.params?.direction || state.callDirection,
      contactId:inbound?.activeCall?.params?.contactId || (getActiveSessionMetadata().closed ? null : getActiveSessionMetadata().contactId) || null});
    dispatch({ type: "MARK_SECTION_START", section: 1 });
    dispatch({ type: "START_TIMER" });
  }, [callStarted, callGeneration, clearLog, session, dispatch, inbound?.activeCall, state.callDirection]);

  // Cleanup on unmount, mark completed if enrollment gate was reached
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current && !getActiveSessionMetadata().telephonyCall) {
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
  const [liveTranscriptEntries, setLiveTranscriptEntries] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [customerAudioSharing, setCustomerAudioSharing] = useState(false);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const copilotHandlersRef = useRef({});
  const supportsRecognition = useMemo(
    () =>
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    []
  );
  const canStartCopilot = supportsRecognition;
  const handleManualCopilotStart = useCallback(() => {
    if (availability?.status === 'wrap_up') return;
    sessionStartedRef.current = false;
    scoredSectionsRef.current.clear();
    prevScoreSection.current = 1;
    checkpointKeyRef.current = '';
    finalTranscriptSavedRef.current = false;
    setWrapUpSaved(false);
    setPostCallPersistenceError('');
    setTranscript('');
    setMergedTranscriptEntries([]);
    setLiveTranscriptEntries([]);
    dispatch({type:'NEW_CALL',direction:state.callDirection});
    setCallGeneration(value=>value+1);
    setCallStarted(true);
    copilotHandlersRef.current?.clearAll?.();
    const handleStart = copilotHandlersRef.current?.handleStart;
    if (handleStart) {
      void handleStart();
    }
  }, [availability?.status, dispatch, state.callDirection]);

  // Inbound Twilio call accepted: auto-start the session (transcript and
  // Co-Pilot come from the telephony service) and hydrate the left rail
  // client panel from the matched contact record.
  const inboundStartedRef = useRef(false);
  const inboundContactHydratedRef = useRef("");
  useEffect(() => {
    if (!inbound?.activeCall || inboundStartedRef.current) return;
    // Twilio also accepts the browser leg to play a rejection message. Start
    // transcript persistence only after the server confirms a real attempt.
    if (inbound.activeCall.params?.direction === 'outbound' && !inbound.activeCall.params.attemptId) return;
    inboundStartedRef.current = true;
    setCallStarted(true);
  }, [inbound?.activeCall]);

  useEffect(() => {
    const contact = inbound?.contact;
    if (!inbound?.activeCall || !contact || inboundContactHydratedRef.current === contact.id) {
      return;
    }
    inboundContactHydratedRef.current = contact.id;
    setActivePostCallMetadata({ contactId: contact.id });
    hydrateNotesFromContact(dispatch, contact);
  }, [inbound?.activeCall, inbound?.contact, dispatch]);

  // Outbound calls (dial pad or contact click-to-call) reuse the same
  // activeCall slot as inbound; tag the session so the post-call
  // pipeline writes call_records with call_direction = "outbound".
  useEffect(() => {
    if (inbound?.activeCall?.params?.direction === "outbound") {
      dispatch({ type: "SET_FIELD", field: "callDirection", value: "outbound" });
    }
  }, [inbound?.activeCall, dispatch]);

  // Start-call-from-contact (CRM home): hydrate the left rail from the
  // stashed contact. The session is NOT auto-started; the agent presses
  // Start Call as usual.
  useEffect(() => {
    const pendingContact = consumePendingCallContact();
    if (!pendingContact) return;
    setActivePostCallMetadata({ contactId: pendingContact.id });
    hydrateNotesFromContact(dispatch, pendingContact);
  }, [dispatch]);

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
  const liveComplianceResult = null;

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
      if (!final && checkpointPendingRef.current) return null;
      const snapshot = latestPostCallRef.current;
      if (!snapshot?.state) return null;

      let metadata = getActiveSessionMetadata();
      if (metadata.closed) return null;
      if (!metadata.sessionId || !metadata.agentId) {
        metadata = await waitForActiveSessionMetadata(2000);
      }

      if (!metadata.sessionId || !metadata.agentId || metadata.closed) {
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

      if (!final) checkpointPendingRef.current = true;
      let result;
      try {
        result = final ? await finalizePostCallTranscript(getToken, payload) : await checkpointPostCall(getToken, payload);
      } finally { if (!final) checkpointPendingRef.current = false; }

      if (getActiveSessionMetadata().sessionId === metadata.sessionId) {
        setActivePostCallMetadata({
          sessionId: result.session_id || metadata.sessionId,
          callRecordId: result.call_record_id || metadata.callRecordId || null,
          transcriptId: result.transcript_id || metadata.transcriptId || null,
        });
      }

      return result;
    },
    [getToken]
  );

  const persistFinalTranscript = useCallback(() => {
    if (!finalPersistencePromiseRef.current) {
      finalPersistencePromiseRef.current = persistPostCallTranscript({
        final: true,
        force: true,
      }).finally(() => {
        finalPersistencePromiseRef.current = null;
      });
    }
    return finalPersistencePromiseRef.current;
  }, [persistPostCallTranscript]);

  useEffect(() => {
    if (!callStarted || inbound?.activeCall?.params?.direction !== 'outbound') return;
    const sid = telephonyCallIdentity(inbound.activeCall).twilioCallSid;
    if (!sid) return;
    return registerConferenceCheckpoint(sid, async () => {
      // Let an already-running checkpoint commit before saving the latest
      // snapshot; otherwise its delayed response could overwrite this one.
      for (let retry = 0; checkpointPendingRef.current && retry < 50; retry++) {
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
      if (checkpointPendingRef.current) throw new Error('Transcript is still syncing. Please retry the transfer.');
      if (getActiveSessionMetadata().twilioCallSid !== sid) return;
      await persistPostCallTranscript({ final: false, force: true });
    });
  }, [callStarted, inbound?.activeCall, persistPostCallTranscript]);

  useEffect(() => {
    persistFinalTranscriptRef.current = persistFinalTranscript;
  }, [persistFinalTranscript]);

  // Twilio clears activeCall on disconnect for both inbound and outbound
  // softphone calls. Persist the final snapshot at that boundary regardless
  // of call length or enrollment progress.
  useEffect(() => {
    const softphoneActive = Boolean(inbound?.activeCall);
    const wasActive = previousSoftphoneActiveRef.current;
    previousSoftphoneActiveRef.current = softphoneActive;
    if (!wasActive || softphoneActive || !callStarted) return;

    void persistBeforeReset({
      persist: persistFinalTranscript,
      onError: (error) => {
        debugLog("[PostCall] disconnect persistence failed");
        setPostCallPersistenceError(
          error?.message || "Transcript could not be saved. The transcript remains available."
        );
      },
    });
  }, [callStarted, inbound?.activeCall, persistFinalTranscript, dispatch]);

  useEffect(() => {
    if (!callStarted) return undefined;

    let cancelled = false;
    void (async () => {
      const metadata = await waitForActiveSessionMetadata(2500);
      if (cancelled || !metadata.sessionId || !metadata.agentId || metadata.callRecordId) {
        return;
      }
      if (initializedPostCallSessionsRef.current.has(metadata.sessionId)) return;
      initializedPostCallSessionsRef.current.add(metadata.sessionId);

      const snapshot = latestPostCallRef.current;
      const payload = buildPostCallPayload({
        state: snapshot?.state,
        liveCall: snapshot?.liveCall,
        sessionMetadata: metadata,
        flow: "ma",
      });

      try {
        const result = await initPostCallRecord(getToken, payload);
        if (getActiveSessionMetadata().sessionId !== metadata.sessionId) return;
        setActivePostCallMetadata({
          callRecordId: result.call_record_id || null,
          transcriptId: result.transcript_id || null,
        });
      } catch {
        debugLog("[PostCall] init failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callStarted, callGeneration, getToken]);

  useEffect(() => {
    if (!callStarted) return undefined;

    const intervalId = window.setInterval(() => {
      void persistPostCallTranscript({ final: false }).catch(error => {
        setPostCallPersistenceError(error?.message || 'Transcript checkpoint failed.');
      });
    }, CHECKPOINT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [callStarted, persistPostCallTranscript]);

  useEffect(() => {
    if (!callStarted) return undefined;
    return installTranscriptExitFlush({ windowTarget: window, documentTarget: document, getToken,
      getSnapshot: () => {
        const snapshot = latestPostCallRef.current;
        const metadata = getActiveSessionMetadata();
        if (metadata.closed) return null;
        if (!snapshot?.state || !metadata.sessionId || !metadata.agentId) return null;
        return buildPostCallPayload({ state: snapshot.state, liveCall: snapshot.liveCall,
          sessionMetadata: metadata, flow: 'ma' });
      }, onError: () => debugLog("[PostCall] exit checkpoint failed"),
    });
  }, [callStarted, getToken]);

  useEffect(() => {
    if (!callStarted || !state.enrollOk || finalTranscriptSavedRef.current) return;
    finalTranscriptSavedRef.current = true;
    void persistPostCallTranscript({ final: true, force: true });
  }, [callStarted, state.enrollOk, persistPostCallTranscript]);

  useEffect(() => {
    return () => {
      // ScriptFlow also mounts for an idle script page. Do not interpret that
      // normal unmount as a failed post-call save; there is no session or
      // transcript to persist until the agent starts a call.
      const latestCall = latestPostCallRef.current?.liveCall;
      if (
        !sessionStartedRef.current ||
        !latestCall?.callStarted ||
        !persistFinalTranscriptRef.current
      ) {
        return;
      }

      void persistBeforeReset({
        persist: persistFinalTranscriptRef.current,
        reset: resetLiveCall,
        onError: () => {
          debugLog("[PostCall] unmount persistence failed");
        },
      });
    };
  }, [resetLiveCall]);

  useEffect(() => {
    if (!callStarted || inbound?.activeCall || wrapUpSaved) return;
    let stopped=false;
    const sync = async () => {
      const metadata=getActiveSessionMetadata();
      if (!metadata.twilioCallSid || !metadata.sessionId) return;
      try {
        const result=await evidenceRequest(getToken,`evidence-session?call_sid=${encodeURIComponent(metadata.twilioCallSid)}`);
        if (stopped || getActiveSessionMetadata().sessionId!==metadata.sessionId) return;
        if (result.wrap_up?.status==='saved' && result.wrap_up.outcome==='short_call_hangup') {
          completeSession(metadata.sessionId);
          setWrapUpSaved(true);
        }
      } catch { /* Durable state remains available for the next refresh. */ }
    };
    void sync();
    const timer=setInterval(()=>void sync(),3000);
    return ()=>{stopped=true;clearInterval(timer);};
  },[callStarted,inbound?.activeCall,wrapUpSaved,getToken,dispatch,completeSession]);

  useEffect(() => {
    const saved = event => {
      if (getActiveSessionMetadata().sessionId !== event.detail?.session_id) return;
      completeSession(event.detail.session_id);
      dispatch({type:'SET_NOTE',field:'callOutcome',value:event.detail.call_outcome});
      setWrapUpSaved(true);
    };
    window.addEventListener('call-disposition-saved',saved);
    return ()=>window.removeEventListener('call-disposition-saved',saved);
  },[completeSession,dispatch]);

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

  const canGoBack = state.maClosed || state.undoHistory.length > 0;
  const handleGoBack = useCallback(() => {
    if (!state.maClosed && !state.undoHistory.length) {
      return;
    }
    dispatch({ type: "UNDO_LAST_GATE" });
  }, [dispatch, state.maClosed, state.undoHistory.length]);

  const leftPopupStack = (
    <div className="left-rail-prompt-content">
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
    {promptTarget
      ? createPortal(leftPopupStack, promptTarget)
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
        dispatch={dispatch}
        mergedEntries={liveTranscriptEntries}
        listening={isListening}
        result={liveComplianceResult}
        copilotHandlersRef={copilotHandlersRef}
        coachingLoading={coachingLoading}
        onManualCopilotStart={handleManualCopilotStart}
      />

      <div className="flow-shell">
        <div className="flow-main">


      <CenterTimerBar
        agentActive={isListening}
        agentTrackHealthy={inbound?.activeCall && inbound.activeCall.params?.direction !== "outbound"
          ? agentTrackActive(inbound, isListening) : undefined}
        onShareAudio={() => {
          const shareAudio = copilotHandlersRef.current?.shareCustomerAudio;
          if (shareAudio) void shareAudio();
        }}
        audioSharing={customerAudioSharing}
        audioShareAvailable={callStarted}
      />

      {/* ── AI Co-Pilot, passes transcript up via callback ── */}
      <ScriptPrompter
        callStarted={callStarted && !wrapUpSaved}
        onTranscriptChange={setTranscript}
        onMergedTranscriptChange={setMergedTranscriptEntries}
        onLiveTranscriptChange={setLiveTranscriptEntries}
        onListeningChange={setIsListening}
        logComplianceFlag={session.logComplianceFlag}
        controlsRef={copilotHandlersRef}
        onCustomerAudioChange={setCustomerAudioSharing}
        onCoachingLoadingChange={setCoachingLoading}
      />

      {postCallPersistenceError ? (
        <div className="call-persistence-error" role="alert">
          {postCallPersistenceError}
        </div>
      ) : null}

      {/* Manual idle state: sections stay hidden until the agent starts Copilot. */}
      {(!callStarted || wrapUpSaved) && (
        <section
          className="script-start-call-gate script-start-call-gate--manual"
        >
          <div className="ma-script-direction-wrap">
            <select
              className="ma-script-direction-select"
              aria-label="Call direction"
              value={state.callDirection}
              onChange={(e) => dispatch({ type: "SET_MA_DIRECTION", value: e.target.value })}
            >
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <span className="ma-script-direction-caret" aria-hidden="true">▾</span>
          </div>
          <button data-key-role="primary"
            type="button"
            className="script-start-call-button"
            onClick={handleManualCopilotStart}
            disabled={!canStartCopilot || availability?.status === "wrap_up"}
          >
            {canStartCopilot ? "START" : "NO MIC"}
          </button>
        </section>
      )}

      {/* Sequential enrollment flow sections */}
      {callStarted && (
      <>
      {canGoBack ? (
        <div className="flow-card-nav">
          <button data-key-role="secondary"
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
              sidecar={
                sectionNum === 1 && callStarted && state.tpmoStart ? (
                  <MAFirstCardCountdown startTime={state.tpmoStart} />
                ) : null
              }
            >
              <ScriptSection section={section} />
            </CollapsibleSection>
          );

          return rendered;
        })}

      {activeSection >= 8 && (
        <>
          <SectionWrapUp scriptBody={wrapUpSection?.body} />
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

      </>
      )}
        </div>
      </div>
    </motion.div>
    </>
  );
}
