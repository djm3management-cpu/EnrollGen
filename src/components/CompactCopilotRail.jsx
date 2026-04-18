import { memo, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, Radio } from "lucide-react";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import AskCopilotMini from "./AskCopilotMini";
import CopilotFeedMini from "./CopilotFeedMini";
import AgentAvailabilityToggle from "./AgentAvailabilityToggle";
import CollapsibleWidget from "./CollapsibleWidget";
import CallTimer from "./copilot/CallTimer";
import MiniLiveTranscript, { TranscriptTimer } from "./MiniLiveTranscript";

const FULL_RAIL_STYLE = {
  position: "fixed",
  top: 14,
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
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 98,
  width: 268,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: 8,
};

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
  background:
    "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
};

function FloatingAlert({
  alert,
  levelStyles,
  labelMap,
  defaultLabel,
  onDismiss,
}) {
  if (!alert) return null;

  const style = levelStyles?.[alert.level] || levelStyles?.info || {};
  const isPulse = Boolean(alert.pulse);
  const isFading = Boolean(alert.fading);
  const isAlert = alert.level === "warn" || alert.level === "critical";
  const floatLabel =
    labelMap?.[alert.level] || defaultLabel || "CO-PILOT";

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        top: 80,
        right: 20,
        zIndex: 9999,
        maxWidth: isAlert ? 420 : 340,
        width: "auto",
        background: isPulse
          ? "linear-gradient(145deg, rgba(157,0,255,0.12) 0%, rgba(10,10,12,0.99) 100%)"
          : isAlert
            ? "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)"
            : "linear-gradient(145deg, rgba(21,21,26,0.92) 0%, rgba(10,10,12,0.94) 100%)",
        border: `1px solid ${style.border || "rgba(255,255,255,0.07)"}`,
        borderLeftWidth: isAlert ? 4 : 3,
        borderLeftColor: style.color || "#9ca3af",
        borderRadius: isAlert ? 14 : 10,
        padding: isAlert ? "14px 18px" : "10px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: isAlert ? 12 : 8,
        cursor: "pointer",
        boxShadow: isPulse
          ? `14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 30px ${(style.color || "#9ca3af")}33`
          : "14px 14px 28px rgba(0,0,0,0.42), -6px -6px 16px rgba(255,255,255,0.018), 0 0 20px rgba(0,0,0,0.5)",
        animation: isFading
          ? "floatFadeOut 5s ease forwards"
          : isPulse
            ? "slideDown 0.25s ease, alertPulse 1.5s ease-in-out 3"
            : "slideDown 0.25s ease",
        backdropFilter: "blur(12px)",
      }}
    >
      <span
        style={{
          fontSize: isPulse ? "1.1rem" : isAlert ? "0.85rem" : "0.75rem",
          color: style.color || "#9ca3af",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          lineHeight: 1,
          paddingTop: 2,
          flexShrink: 0,
          animation: isPulse ? "iconFlash 0.8s ease-in-out 4" : "none",
        }}
      >
        {style.icon || "!"}
      </span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: isPulse ? "0.7rem" : isAlert ? "0.62rem" : "0.58rem",
            fontWeight: 800,
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: style.color || "#9ca3af",
            marginBottom: isAlert ? 5 : 3,
          }}
        >
          {floatLabel} - tap to dismiss
        </div>
        <div
          style={{
            fontSize: isAlert ? "0.82rem" : "0.76rem",
            color: "#d0d0d0",
            lineHeight: 1.5,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: isPulse ? 600 : 400,
          }}
        >
          {alert.text}
        </div>
      </div>
    </div>
  );
}

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
        style={{
          width: "100%",
          minWidth: 230,
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

        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          <button
            onClick={onToggleListening}
            disabled={!supportsRecognition}
            style={{
              ...PILL_BASE,
              background: listening
                ? "linear-gradient(145deg, rgba(232,0,45,0.2) 0%, rgba(180,0,35,0.14) 100%)"
                : PILL_BASE.background,
              border: listening
                ? "1px solid rgba(232,0,45,0.28)"
                : PILL_BASE.border,
              color: listening ? "#FF8FA3" : "#00ff41",
              cursor: supportsRecognition ? "pointer" : "not-allowed",
            }}
          >
            {!supportsRecognition ? "NO MIC" : listening ? "STOP" : "START"}
          </button>
          <button onClick={onClear} style={{ ...PILL_BASE, color: "#666" }}>
            CLEAR
          </button>
          <button
            onClick={onAnalyze}
            disabled={!hasTranscript || analyzing}
            style={{
              ...PILL_BASE,
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
  floatingAlert,
  onDismissAlert,
  levelStyles,
  alertLabels,
  defaultAlertLabel,
}) {
  const { clearLog } = useCopilotLog();
  const [open, setOpen] = useState(false);
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
      <FloatingAlert
        alert={floatingAlert}
        levelStyles={levelStyles}
        labelMap={alertLabels}
        defaultLabel={defaultAlertLabel}
        onDismiss={onDismissAlert}
      />

      {!isCompactRail ? (
        <div className="right-rail-full" style={FULL_RAIL_STYLE}>
          <div className="right-rail-scroll" style={FULL_RAIL_SCROLL_STYLE}>
            <RailWidgets {...widgetProps} />
          </div>
        </div>
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
            {open ? <RailWidgets {...widgetProps} /> : null}
          </div>
        </>
      )}
    </>
  );
});

export default CompactCopilotRail;
