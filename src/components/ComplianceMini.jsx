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
 * ComplianceMini v2, Floating score badge with transcript awareness
 *
 * Props:
 *   transcript, Current agent transcript from ScriptPrompter
 *
 * Drop into: src/components/ComplianceMini.jsx
 */

function getScoreColor(s) {
  if (s >= 75) return "var(--status-live)";
  if (s >= 25) return "var(--status-pending)";
  return "var(--status-offline)";
}

function renderCategoryIcon(icon, color = "var(--text-primary)", size = 14) {
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

const DORMANT_COLOR = "var(--text-muted)";

const ACTIVE_CATEGORY_BY_SECTION = {
  1: "Call Opening",
  2: "Required Disclosures",
  3: "Scope of Appointment",
  4: "Eligibility Verification",
  5: "Needs Assessment",
  6: "Presentation / SOB",
  7: "Consent for Enrollment",
  8: "Call Closing",
};

function getActiveCategoryName(activeSection) {
  const section = Number(activeSection);
  if (section === 2.5) return "Required Disclosures";
  const step = Number.isFinite(section) ? Math.ceil(section) : 1;
  return ACTIVE_CATEGORY_BY_SECTION[step] || null;
}

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
  const activeCategoryName = getActiveCategoryName(activeSection);

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
                background: "var(--chart-track)",
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
                    background: "linear-gradient(90deg, var(--status-offline) 0%, var(--status-pending) 50%, var(--status-live) 100%)",
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
                color: isDormant ? DORMANT_COLOR : "var(--text-muted)",
              }}
            >
              {isDormant
                ? "0/0"
                : `${result.categoriesPassed}/${result.totalCategories}`}
            </span>
            {!isDormant && isTranscriptScored && (
              <Mic className="compliance-mini__transcript-icon" size={11} style={{ color: "var(--status-live)" }} />
            )}
            {!isDormant && violationCount > 0 && (
              <span
                className="compliance-mini__violation-count"
                style={{
                  color: "var(--status-offline)",
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
                color: "var(--text-muted)",
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
              const isActiveCategory = c.name === activeCategoryName;
              return (
                <div
                  key={c.name}
                  className={`compliance-mini__category-row${
                    isActiveCategory ? " is-active-section" : ""
                  }`}
                  aria-current={isActiveCategory ? "step" : undefined}
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
                      color: isDormant
                        ? DORMANT_COLOR
                        : isActiveCategory
                          ? "var(--status-live)"
                          : "var(--text-secondary)",
                      fontWeight: isActiveCategory ? 700 : undefined,
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
                      background: "var(--chart-track)",
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
                  color: "var(--status-live)",
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
                  background: "var(--status-offline-bg)",
                  borderRadius: 4,
                  fontSize: "0.58em",
                  color: "var(--eg-red-text)",
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
