import { useState, useMemo, useEffect, useRef, memo } from "react";
import {
  AlertTriangle,
  BriefcaseMedical,
  CheckSquare,
  FileSignature,
  Megaphone,
  Mic,
  PhoneCall,
  Scale,
  ScrollText,
  Star,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreLive } from "../context/ComplianceScorer";

/**
 * ComplianceMini v2 — Floating score badge with transcript awareness
 *
 * Props:
 *   transcript — Current agent transcript from ScriptPrompter
 *
 * Drop into: src/components/ComplianceMini.jsx
 */

function getScoreColor(s) {
  if (s >= 90) return "#34d399";
  if (s >= 75) return "#22c55e";
  if (s >= 50) return "#fbbf24";
  if (s >= 25) return "#f97316";
  return "#ef4444";
}

function renderCategoryIcon(icon, color = "#cbd5e1", size = 14) {
  const props = { size, color, strokeWidth: 2 };
  const iconMap = {
    "📣": <Megaphone {...props} />,
    "📜": <ScrollText {...props} />,
    "📋": <ClipboardList {...props} />,
    "✅": <CheckSquare {...props} />,
    "🩺": <BriefcaseMedical {...props} />,
    "📊": <Scale {...props} />,
    "✍️": <FileSignature {...props} />,
    "📞": <PhoneCall {...props} />,
    "⭐": <Star {...props} />,
  };

  return iconMap[icon] || <CheckSquare {...props} />;
}

const ComplianceMini = memo(function ComplianceMini({ transcript = "" }) {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevScoreRef = useRef(null);

  const result = useMemo(
    () => scoreLive(state, entries, transcript),
    [state, entries, transcript]
  );

  useEffect(() => {
    if (
      prevScoreRef.current !== null &&
      prevScoreRef.current !== result.score
    ) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(t);
    }
    prevScoreRef.current = result.score;
  }, [result.score]);

  const scoreColor = getScoreColor(result.score);
  const isDual = result.scoringMode === "dual";

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        right: 18,
        zIndex: 96,
        display: "flex",
        justifyContent: "flex-end",
        pointerEvents: "none",
        marginBottom: 0,
      }}
    >
      <div
        onClick={() => setExpanded((p) => !p)}
        style={{
          pointerEvents: "auto",
          background: expanded ? "rgba(15,23,42,0.97)" : "rgba(15,23,42,0.92)",
          border: `1px solid ${scoreColor}30`,
          borderRadius: expanded ? 10 : 8,
          padding: expanded ? "8px 10px 10px" : "4px 10px",
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          boxShadow: `0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)`,
          transition: "all 0.25s ease",
          minWidth: expanded ? 210 : "auto",
          animation: pulse ? "compliancePulse 0.6s ease" : "none",
        }}
      >
        {/* Collapsed */}
        {!expanded && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
              {result.categories.map((c) => (
                <div
                  key={c.name}
                  title={`${c.name}: ${c.score}%`}
                  style={{
                    width: 4,
                    height: 14,
                    borderRadius: 1.5,
                    background: getScoreColor(c.score),
                    opacity: 0.85,
                    transition: "all 0.4s",
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontSize: "0.82em",
                fontWeight: 800,
                color: scoreColor,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              {result.score}%
            </span>
            <span
              style={{ fontSize: "0.6em", color: "#64748b", fontWeight: 600 }}
            >
              {result.categoriesPassed}/{result.totalCategories}
            </span>
            {isDual && (
              <span
                style={{
                  color: "#34d399",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <Mic size={11} />
              </span>
            )}
            {result.violations > 0 && (
              <span
                style={{
                  color: "#ef4444",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <AlertTriangle size={11} />
                {result.violations}
              </span>
            )}
          </div>
        )}

        {/* Expanded */}
        {expanded && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontSize: "1.2em",
                    fontWeight: 800,
                    color: scoreColor,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {result.score}%
                </span>
                <span
                  style={{
                    fontSize: "0.75em",
                    fontWeight: 700,
                    color: scoreColor,
                    opacity: 0.7,
                  }}
                >
                  {result.grade}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 1,
                }}
              >
                <span style={{ fontSize: "0.58em", color: "#64748b" }}>
                  {result.categoriesPassed}/{result.totalCategories} passed
                </span>
                {isDual && (
                  <span
                    style={{
                      fontSize: "0.5em",
                      color: "#34d399",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Mic size={11} />
                    Live · {result.transcriptCoverage}% coverage
                  </span>
                )}
              </div>
            </div>
            {result.categories.map((c) => {
              const col = getScoreColor(c.score);
              return (
                <div
                  key={c.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {renderCategoryIcon(c.icon, col, 13)}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      fontSize: "0.66em",
                      color: "#94a3b8",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      width: 50,
                      height: 4,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 2,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: `${c.score}%`,
                        height: "100%",
                        background: col,
                        borderRadius: 2,
                        transition: "width 0.5s ease, background 0.3s",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "0.63em",
                      fontWeight: 700,
                      color: col,
                      minWidth: 30,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {c.score}%
                  </span>
                </div>
              );
            })}
            {result.violations > 0 && (
              <div
                style={{
                  marginTop: 6,
                  padding: "3px 6px",
                  background: "rgba(239,68,68,0.1)",
                  borderRadius: 4,
                  fontSize: "0.58em",
                  color: "#f87171",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <AlertTriangle size={11} />
                  {result.violations} violation
                </span>
                {result.violations !== 1 ? "s" : ""} detected in transcript
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes compliancePulse { 0% { transform: scale(1); } 30% { transform: scale(1.04); } 60% { transform: scale(0.98); } 100% { transform: scale(1); } }`}</style>
    </div>
  );
});

export default ComplianceMini;
