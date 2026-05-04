import { memo, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, Radio } from "lucide-react";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import AskCopilotMini from "./AskCopilotMini";
import CopilotFeedMini from "./CopilotFeedMini";
import AgentAvailabilityToggle from "./AgentAvailabilityToggle";
import CollapsibleWidget from "./CollapsibleWidget";
import CallTimer from "./copilot/CallTimer";
import { COPILOT_PILL_BASE } from "./copilot/pillStyles";
import MiniLiveTranscript, { TranscriptTimer } from "./MiniLiveTranscript";

const FULL_RAIL_WIDTH = 278;
const COMPACT_RAIL_OVERLAY_WIDTH = "min(340px, calc(100vw - 24px))";

const FULL_RAIL_STYLE = {
  position: "fixed",
  top: "calc(var(--top-bar-height, 44px) + 12px)",
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
  top: "calc(var(--top-bar-height, 44px) + 8px)",
  right: 0,
  bottom: 0,
  zIndex: 98,
  width: COMPACT_RAIL_OVERLAY_WIDTH,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  gap: 8,
};

function RailWidgets({
  mergedEntries,
  listening,
  startTime,
  transcript,
  supportsRecognition,
  analyzing,
  onToggleListening,
  onClear,
  onAnalyze,
}) {
  const hasTranscript = Boolean(transcript.trim());

  return (
    <>
      <AgentAvailabilityToggle />

      <div
        className="right-rail-control-panel"
        style={{
          width: "100%",
          minWidth: 0,
          pointerEvents: "auto",
          background:
            "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          backdropFilter: "blur(12px)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.36)",
          padding: "8px 10px 4px",
          marginBottom: 6,
          overflow: "hidden",
        }}
      >
        <CallTimer fallbackStartTime={startTime} />

        <div className="right-rail-control-row" style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          <button
            className={`copilot-pill-button copilot-pill-button--listen${
              listening ? " is-listening" : ""
            }`}
            onClick={onToggleListening}
            disabled={!supportsRecognition}
            style={{
              ...COPILOT_PILL_BASE,
              background: listening
                ? "linear-gradient(145deg, rgba(232,0,45,0.2) 0%, rgba(180,0,35,0.14) 100%)"
                : COPILOT_PILL_BASE.background,
              border: listening
                ? "1px solid rgba(232,0,45,0.28)"
                : COPILOT_PILL_BASE.border,
              color: listening ? "#FF8FA3" : "#00ff41",
              cursor: supportsRecognition ? "pointer" : "not-allowed",
            }}
          >
            {!supportsRecognition ? "NO MIC" : listening ? "STOP" : "START"}
          </button>
          <button
            className="copilot-pill-button copilot-pill-button--clear"
            onClick={onClear}
            style={{ ...COPILOT_PILL_BASE, color: "#666" }}
          >
            CLEAR
          </button>
          <button
            className="copilot-pill-button copilot-pill-button--analyze"
            onClick={onAnalyze}
            disabled={!hasTranscript || analyzing}
            style={{
              ...COPILOT_PILL_BASE,
              border: "1px solid rgba(157,0,255,0.45)",
              color: "#B84DFF",
              cursor: hasTranscript && !analyzing ? "pointer" : "not-allowed",
              opacity: !hasTranscript || analyzing ? 0.45 : 1,
            }}
          >
            {analyzing ? "ANALYZING..." : "ANALYZE"}
          </button>
        </div>
        <AskCopilotMini />
      </div>

      <div
        className="right-rail-divider"
        style={{
          width: "100%",
          height: 1,
          background: "rgba(255,255,255,0.06)",
          marginBottom: 6,
        }}
      />

      <CollapsibleWidget
        title="Live Transcript"
        icon={<Radio size={11} />}
        accentColor="#39FF88"
        headerRight={<TranscriptTimer startTime={startTime} />}
      >
        <MiniLiveTranscript mergedEntries={mergedEntries} listening={listening} />
      </CollapsibleWidget>

      <CollapsibleWidget
        title="Co-Pilot Feed"
        icon={<MessageSquare size={11} />}
        accentColor="#9D00FF"
      >
        <CopilotFeedMini />
      </CollapsibleWidget>
    </>
  );
}

const CompactCopilotRail = memo(function CompactCopilotRail({
  transcript = "",
  mergedEntries = [],
  listening = false,
  supportsRecognition = false,
  analyzing = false,
  score,
  toggleLabel,
  startTime,
  sessionActive = false,
  onToggleListening,
  onClear,
  onAnalyze,
}) {
  const { clearLog } = useCopilotLog();
  const [open, setOpen] = useState(false);
  const [fullRailMinimized, setFullRailMinimized] = useState(false);
  const [isCompactRail, setIsCompactRail] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1400px)").matches
  );
  const railRef = useRef(null);
  const previousSessionActiveRef = useRef(sessionActive);

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

  useEffect(() => {
    if (sessionActive && !previousSessionActiveRef.current) {
      clearLog();
    }
    previousSessionActiveRef.current = sessionActive;
  }, [sessionActive, clearLog]);

  useEffect(() => {
    if (!open || !isCompactRail) return undefined;

    const handleMouseDown = (event) => {
      if (railRef.current && !railRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, isCompactRail]);

  useEffect(() => {
    if (!open || !isCompactRail) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isCompactRail]);

  useEffect(() => {
    if (!isCompactRail && open) {
      setOpen(false);
    }
  }, [isCompactRail, open]);

  const handleClear = () => {
    onClear?.();
    clearLog();
  };

  const widgetProps = {
    mergedEntries,
    listening,
    startTime,
    transcript,
    supportsRecognition,
    analyzing,
    onToggleListening,
    onClear: handleClear,
    onAnalyze,
  };
  const scoreDisplay = Number.isFinite(score) ? `${score}%` : "--";

  return (
    <>
      {!isCompactRail ? (
        fullRailMinimized ? (
          <button
            className="right-rail-toggle right-rail-toggle--restore"
            style={COMPACT_RAIL_TOGGLE_STYLE}
            onClick={() => setFullRailMinimized(false)}
            title="Expand co-pilot rail"
            aria-label="Expand co-pilot rail"
          >
            <span className="right-rail-toggle-score">{scoreDisplay}</span>
            <span className="right-rail-toggle-section">{toggleLabel}</span>
            <ChevronLeft size={12} />
          </button>
        ) : (
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
              title="Minimize co-pilot rail"
              aria-label="Minimize co-pilot rail"
            >
              <ChevronRight size={12} />
            </button>
            <div className="right-rail-scroll" style={FULL_RAIL_SCROLL_STYLE}>
              <RailWidgets {...widgetProps} />
            </div>
          </div>
        )
      ) : (
        <>
          <button
            className="right-rail-toggle"
            style={COMPACT_RAIL_TOGGLE_STYLE}
            onClick={() => setOpen((previous) => !previous)}
            title="Toggle co-pilot rail"
          >
            <span className="right-rail-toggle-score">{scoreDisplay}</span>
            <span className="right-rail-toggle-section">{toggleLabel}</span>
            {open ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>

          {open ? (
            <div className="right-rail-scrim" onClick={() => setOpen(false)} />
          ) : null}
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
                  title="Minimize co-pilot rail"
                  aria-label="Minimize co-pilot rail"
                >
                  <ChevronRight size={12} />
                </button>
                <RailWidgets {...widgetProps} />
              </>
            ) : null}
          </div>
        </>
      )}
    </>
  );
});

export default CompactCopilotRail;
