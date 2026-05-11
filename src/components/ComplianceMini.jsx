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
import { SectionTimer } from "./SharedUI";

/**
 * ComplianceMini v2, Floating score badge with transcript awareness
 *
 * Props:
 *   transcript, Current agent transcript from ScriptPrompter
 *
 * Drop into: src/components/ComplianceMini.jsx
 */

function getScoreColor(s) {
  if (s >= 90) return "#33cc66";
  if (s >= 75) return "#33cc66";
  if (s >= 50) return "#f4b24d";
  if (s >= 25) return "#d98b45";
  return "#ff3838";
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

const GATE_BOOLEAN_KEYS = [
  "recordingOk",
  "tpmoOk",
  "soaOk",
  "qualOk",
  "neadsOk",
  "sobOk",
  "enrollOk",
  "snpOk",
];

const DORMANT_COLOR = "#555555";

const ComplianceMini = memo(function ComplianceMini({
  transcript = "",
  activeSection = 1,
  result: providedResult,
}) {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [collapsed, setCollapsed] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevScoreRef = useRef(null);

  const result = useMemo(
    () => providedResult ?? scoreLive(state, entries, transcript),
    [providedResult, state, entries, transcript]
  );

  const transcriptEmpty = !(transcript || "").trim();
  const noGatesCompleted = GATE_BOOLEAN_KEYS.every((key) => !state[key]);
  const isDormant = transcriptEmpty && noGatesCompleted;

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

  const scoreColor = isDormant ? DORMANT_COLOR : getScoreColor(result.score);
  const isTranscriptScored =
    result.scoringMode !== "gate_only" && result.scoringMode !== "inactive";
  const violationCount =
    result.transcriptStats?.violations?.length ??
    (typeof result.violations === "number" ? result.violations : 0);
  const currentStep = Number.isInteger(activeSection)
    ? activeSection
    : Math.ceil(activeSection);
  const sectionLabel = SECTION_LABELS[currentStep] || `Section ${currentStep}`;

  return (
    <div className="compliance-mini">
      <div
        className="compliance-mini__body"
        style={{
          padding: "8px 10px 10px",
          transition: "all 0.25s ease",
          animation: pulse ? "compliancePulse 0.6s ease" : "none",
        }}
      >
        {/* Section indicator */}
        <div
          className="compliance-mini__section"
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
            className="compliance-mini__section-dot"
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
            className="compliance-mini__section-label"
            style={{
              fontSize: "0.68em",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#00ff41",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}
          >
            {currentStep}. {sectionLabel}
          </span>
          <SectionTimer
            sectionNum={activeSection}
            timestamps={state.sectionTimestamps}
            variant="inline"
          />
        </div>

        {/* Header, score + toggle */}
        <div
          className="compliance-mini__score-toggle"
          onClick={() => setCollapsed((p) => !p)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            marginBottom: collapsed ? 0 : 8,
          }}
        >
          <div className="compliance-mini__score-main" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginRight: 8 }}>
            <span
              className="compliance-mini__score-value"
              style={{
                fontSize: "0.72em",
                fontWeight: 800,
                color: scoreColor,
                fontVariantNumeric: "tabular-nums",
                minWidth: 30,
              }}
            >
              {isDormant ? "-" : `${result.score}%`}
            </span>
            <div
              className="compliance-mini__score-bar"
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              {isDormant ? null : (
                <div
                  className="compliance-mini__score-fill"
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
              )}
            </div>
          </div>
          <div className="compliance-mini__meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="compliance-mini__count"
              style={{
                fontSize: "0.58em",
                color: isDormant ? DORMANT_COLOR : "#64748b",
              }}
            >
              {isDormant
                ? "0/0"
                : `${result.categoriesPassed}/${result.totalCategories}`}
            </span>
            {!isDormant && isTranscriptScored && (
              <Mic className="compliance-mini__transcript-icon" size={11} style={{ color: "#33cc66" }} />
            )}
            {!isDormant && violationCount > 0 && (
              <span
                className="compliance-mini__violation-count"
                style={{
                  color: "#ff3838",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: "0.65em",
                }}
              >
                <AlertTriangle size={10} />
                {violationCount}
              </span>
            )}
            <ChevronDown
              className="compliance-mini__chevron"
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
          <div className="compliance-mini__categories">
            {result.categories.map((c) => {
              const col = isDormant ? DORMANT_COLOR : getScoreColor(c.score);
              return (
                <div
                  key={c.name}
                  className="compliance-mini__category-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 3,
                  }}
                >
                  <span
                    className="compliance-mini__category-icon"
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
                    className="compliance-mini__category-name"
                    style={{
                      flex: 1,
                      fontSize: "0.66em",
                      color: isDormant ? DORMANT_COLOR : "#94a3b8",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    className="compliance-mini__category-bar"
                    style={{
                      width: 50,
                      height: 4,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 2,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {isDormant ? null : (
                      <div
                        className="compliance-mini__category-fill"
                        style={{
                          width: `${c.score}%`,
                          height: "100%",
                          background: col,
                          borderRadius: 2,
                          transition: "width 0.5s ease, background 0.3s",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className="compliance-mini__category-score"
                    style={{
                      fontSize: "0.63em",
                      fontWeight: 700,
                      color: col,
                      minWidth: 30,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {isDormant ? "-" : `${c.score}%`}
                  </span>
                </div>
              );
            })}
            {!isDormant && isTranscriptScored && (
              <div
                className="compliance-mini__strict"
                style={{
                  marginTop: 4,
                  fontSize: "0.5em",
                  color: "#33cc66",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Mic size={10} />
                Strict · {result.transcriptCoverage}% coverage
              </div>
            )}
            {!isDormant && result.violations > 0 && (
              <div
                className="compliance-mini__violation-banner"
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
