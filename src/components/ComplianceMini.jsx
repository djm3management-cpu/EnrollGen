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
import { SECTION_LABELS } from "../context/scriptReducer";

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

const ComplianceMini = memo(function ComplianceMini({ transcript = "", activeSection = 1 }) {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [collapsed, setCollapsed] = useState(false);
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
  const currentStep = Number.isInteger(activeSection)
    ? activeSection
    : Math.ceil(activeSection);
  const sectionLabel = SECTION_LABELS[currentStep] || `Section ${currentStep}`;

  return (
    <div>
      <div
        style={{
          padding: "8px 10px 10px",
          transition: "all 0.25s ease",
          animation: pulse ? "compliancePulse 0.6s ease" : "none",
        }}
      >
        {/* Section indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#00ff41",
              boxShadow: "0 0 6px rgba(0,255,65,0.6)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "0.68em",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#00ff41",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {currentStep}. {sectionLabel}
          </span>
        </div>

        {/* Header — score + toggle */}
        <div
          onClick={() => setCollapsed((p) => !p)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            marginBottom: collapsed ? 0 : 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginRight: 8 }}>
            <span
              style={{
                fontSize: "0.72em",
                fontWeight: 800,
                color: scoreColor,
                fontVariantNumeric: "tabular-nums",
                minWidth: 30,
              }}
            >
              {result.score}%
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${result.score}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: `linear-gradient(90deg, #ef4444 0%, #fbbf24 50%, #34d399 100%)`,
                  backgroundSize: "200% 100%",
                  backgroundPosition: `${100 - result.score}% 0`,
                  transition: "width 0.6s ease, background-position 0.6s ease",
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.58em", color: "#64748b" }}>
              {result.categoriesPassed}/{result.totalCategories}
            </span>
            {isDual && (
              <Mic size={11} style={{ color: "#34d399" }} />
            )}
            {result.violations > 0 && (
              <span
                style={{
                  color: "#ef4444",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: "0.65em",
                }}
              >
                <AlertTriangle size={10} />
                {result.violations}
              </span>
            )}
            <ChevronDown
              size={12}
              style={{
                color: "#64748b",
                transition: "transform 0.2s",
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              }}
            />
          </div>
        </div>

        {/* Category breakdown */}
        {!collapsed && (
          <div>
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
            {isDual && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: "0.5em",
                  color: "#34d399",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Mic size={10} />
                Live · {result.transcriptCoverage}% coverage
              </div>
            )}
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
                  {result.violations} violation{result.violations !== 1 ? "s" : ""} detected
                </span>
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
