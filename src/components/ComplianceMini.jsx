import { useState, useMemo, useEffect, useRef, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreLive } from "../context/ComplianceScorer";

/**
 * ComplianceMini — Floating mini compliance badge
 *
 * A small, always-visible widget that shows the live compliance
 * score as agents progress through the call. Expands on click
 * to show category breakdown.
 *
 * Drop into: src/components/ComplianceMini.jsx
 *
 * Usage in ScriptFlow.jsx:
 *   import ComplianceMini from "./ComplianceMini";
 *   // Place at top level of the flow component (it positions itself)
 *   <ComplianceMini />
 */

function getScoreColor(score) {
  if (score >= 90) return "#34d399";
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#fbbf24";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

function getGradeBg(grade) {
  if (grade.startsWith("A")) return "rgba(52,211,153,0.12)";
  if (grade.startsWith("B")) return "rgba(34,197,94,0.1)";
  if (grade.startsWith("C")) return "rgba(251,191,36,0.1)";
  return "rgba(239,68,68,0.1)";
}

const ComplianceMini = memo(function ComplianceMini() {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevScoreRef = useRef(null);

  const result = useMemo(() => scoreLive(state, entries), [state, entries]);

  // Pulse animation when score changes
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

  return (
    <div
      style={{
        position: "sticky",
        top: 52, // below the sticky timer bar
        zIndex: 90,
        display: "flex",
        justifyContent: "flex-end",
        pointerEvents: "none",
        marginBottom: -40,
        paddingRight: 4,
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
          minWidth: expanded ? 200 : "auto",
          animation: pulse ? "compliancePulse 0.6s ease" : "none",
        }}
      >
        {/* ── Collapsed view: just the score ── */}
        {!expanded && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Mini bar indicators */}
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
              {result.categories.map((cat) => (
                <div
                  key={cat.name}
                  title={`${cat.name}: ${cat.score}%`}
                  style={{
                    width: 4,
                    height: 14,
                    borderRadius: 1.5,
                    background: getScoreColor(cat.score),
                    opacity: 0.85,
                    transition: "all 0.4s ease",
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
              style={{
                fontSize: "0.6em",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              {result.categoriesPassed}/{result.totalCategories}
            </span>
          </div>
        )}

        {/* ── Expanded view: category breakdown ── */}
        {expanded && (
          <div>
            {/* Header row */}
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
              <span
                style={{
                  fontSize: "0.6em",
                  color: "#64748b",
                }}
              >
                {result.categoriesPassed}/{result.totalCategories} passed
              </span>
            </div>

            {/* Category rows */}
            {result.categories.map((cat) => {
              const color = getScoreColor(cat.score);
              return (
                <div
                  key={cat.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.75em",
                      width: 18,
                      textAlign: "center",
                    }}
                  >
                    {cat.icon}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      fontSize: "0.68em",
                      color: "#94a3b8",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {cat.name}
                  </div>
                  {/* Progress bar */}
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
                        width: `${cat.score}%`,
                        height: "100%",
                        background: color,
                        borderRadius: 2,
                        transition: "width 0.5s ease, background 0.3s ease",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "0.65em",
                      fontWeight: 700,
                      color,
                      minWidth: 30,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {cat.score}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Keyframe for pulse animation */}
      <style>{`
        @keyframes compliancePulse {
          0% { transform: scale(1); }
          30% { transform: scale(1.04); }
          60% { transform: scale(0.98); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
});

export default ComplianceMini;
