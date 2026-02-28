import { useState, useMemo, useCallback, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreCompliance, scoreLive } from "../context/ComplianceScorer";

/**
 * ComplianceDashboard — Live Compliance Scoring Widget
 *
 * Shows 9 categories with real-time scores updating as the agent
 * progresses through the enrollment flow. Expandable to show
 * individual sub-questions with evidence.
 *
 * Drop into: src/components/ComplianceDashboard.jsx
 *
 * Import in ScriptFlow.jsx:
 *   import ComplianceDashboard from "./ComplianceDashboard";
 *   // Render after <ScriptPrompter /> or wherever desired
 *   <ComplianceDashboard />
 */

/* ── Color mapping for score ranges ── */
function getScoreColor(score) {
  if (score >= 90) return "#34d399"; // green
  if (score >= 75) return "#22c55e"; // lime-green
  if (score >= 50) return "#fbbf24"; // amber
  if (score >= 25) return "#f97316"; // orange
  return "#ef4444"; // red
}

function getScoreBg(score) {
  if (score >= 90) return "rgba(52,211,153,0.1)";
  if (score >= 75) return "rgba(34,197,94,0.08)";
  if (score >= 50) return "rgba(251,191,36,0.08)";
  if (score >= 25) return "rgba(249,115,22,0.08)";
  return "rgba(239,68,68,0.08)";
}

function getGradeColor(grade) {
  if (grade.startsWith("A")) return "#34d399";
  if (grade.startsWith("B")) return "#22c55e";
  if (grade.startsWith("C")) return "#fbbf24";
  if (grade.startsWith("D")) return "#f97316";
  return "#ef4444";
}

/* ── Small circular progress indicator ── */
function ScoreRing({ score, size = 44, strokeWidth = 3.5 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: "rotate(-90deg)", flexShrink: 0 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={size * 0.26}
        fontWeight="700"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {score}%
      </text>
    </svg>
  );
}

/* ── Category row with expandable sub-questions ── */
const CategoryRow = memo(function CategoryRow({ cat, isExpanded, onToggle }) {
  const color = getScoreColor(cat.score);
  const bg = getScoreBg(cat.score);

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Category header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          background: isExpanded ? bg : "transparent",
          borderRadius: 6,
          cursor: "pointer",
          transition: "background 0.15s ease",
          borderLeft: `3px solid ${color}`,
        }}
      >
        <span style={{ fontSize: "1em", width: 22, textAlign: "center" }}>
          {cat.icon}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.82em",
              fontWeight: 600,
              color: "#e2e8f0",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cat.name}
          </div>
          <div
            style={{
              fontSize: "0.65em",
              color: "#64748b",
              marginTop: 1,
            }}
          >
            {cat.description}
          </div>
        </div>

        {/* Score pill */}
        <div
          style={{
            background: bg,
            border: `1px solid ${color}30`,
            borderRadius: 4,
            padding: "2px 8px",
            minWidth: 48,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: "0.85em",
              fontWeight: 700,
              color,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {cat.score}%
          </span>
        </div>

        <span
          style={{
            fontSize: "0.6em",
            color: "#475569",
            transition: "transform 0.2s ease",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </div>

      {/* Expanded sub-questions */}
      {isExpanded && (
        <div
          style={{
            padding: "4px 10px 8px 35px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {cat.questions.map((q) => {
            const qColor = getScoreColor(q.score);
            return (
              <div
                key={q.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 8px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 4,
                  borderLeft: `2px solid ${qColor}40`,
                }}
              >
                {/* Score badge */}
                <span
                  style={{
                    fontSize: "0.7em",
                    fontWeight: 700,
                    color: qColor,
                    minWidth: 36,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    paddingTop: 1,
                    flexShrink: 0,
                  }}
                >
                  {q.score}%
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.72em",
                      color: "#cbd5e1",
                      lineHeight: 1.35,
                    }}
                  >
                    {q.question.split("?")[0]}?
                  </div>
                  <div
                    style={{
                      fontSize: "0.65em",
                      color: q.score >= 75 ? "#64748b" : "#f59e0b",
                      lineHeight: 1.3,
                      marginTop: 2,
                      fontStyle: q.score < 75 ? "normal" : "italic",
                    }}
                  >
                    {q.evidence}
                  </div>
                </div>

                {/* Points */}
                <span
                  style={{
                    fontSize: "0.6em",
                    color: "#475569",
                    flexShrink: 0,
                    paddingTop: 2,
                  }}
                >
                  {q.earned}/{q.points}
                </span>
              </div>
            );
          })}

          {/* CMS reference */}
          {cat.cmsRef && (
            <div
              style={{
                fontSize: "0.58em",
                color: "#475569",
                marginTop: 2,
                paddingLeft: 4,
              }}
            >
              📖 {cat.cmsRef}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const ComplianceDashboard = memo(function ComplianceDashboard() {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [expanded, setExpanded] = useState(true);
  const [expandedCats, setExpandedCats] = useState({});
  const [showDetail, setShowDetail] = useState(false);

  // Compute live compliance score
  const result = useMemo(
    () => scoreCompliance(state, entries),
    [state, entries]
  );

  const toggleCat = useCallback((name) => {
    setExpandedCats((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const gradeColor = getGradeColor(result.grade);
  const scoreColor = getScoreColor(result.score);

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* ── Header bar ── */}
      <div
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          cursor: "pointer",
          background: "rgba(255,255,255,0.02)",
          borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        {/* Score ring */}
        <ScoreRing score={result.score} size={48} strokeWidth={4} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontSize: "0.95em",
                fontWeight: 700,
                color: "#e2e8f0",
              }}
            >
              Compliance Summary
            </span>
            <span
              style={{
                fontSize: "0.85em",
                fontWeight: 800,
                color: gradeColor,
                letterSpacing: "0.02em",
              }}
            >
              {result.grade}
            </span>
          </div>
          <div
            style={{
              fontSize: "0.7em",
              color: "#64748b",
              marginTop: 2,
            }}
          >
            {result.categoriesPassed} of {result.totalCategories} categories
            passed · {result.totalPassed} of {result.totalQuestions} checks
          </div>
        </div>

        {/* Mini category indicators */}
        <div
          style={{
            display: "flex",
            gap: 3,
            alignItems: "center",
          }}
        >
          {result.categories.map((cat) => (
            <div
              key={cat.name}
              title={`${cat.name}: ${cat.score}%`}
              style={{
                width: 6,
                height: 20,
                borderRadius: 2,
                background: getScoreColor(cat.score),
                opacity: 0.8,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        <span
          style={{
            fontSize: "0.65em",
            color: "#475569",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
          }}
        >
          ▼
        </span>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ padding: "6px 8px 10px" }}>
          {/* Category grid — compact overview */}
          {!showDetail && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {result.categories.map((cat) => {
                const color = getScoreColor(cat.score);
                const bg = getScoreBg(cat.score);
                return (
                  <div
                    key={cat.name}
                    onClick={() => {
                      setShowDetail(true);
                      setExpandedCats({ [cat.name]: true });
                    }}
                    style={{
                      background: bg,
                      border: `1px solid ${color}20`,
                      borderRadius: 6,
                      padding: "8px 8px 6px",
                      cursor: "pointer",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: "0.85em" }}>{cat.icon}</span>
                      <span
                        style={{
                          fontSize: "0.65em",
                          fontWeight: 600,
                          color: cat.passed ? "#34d399" : "#475569",
                        }}
                      >
                        {cat.passed ? "✓" : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "1.1em",
                        fontWeight: 800,
                        color,
                        fontVariantNumeric: "tabular-nums",
                        marginTop: 2,
                      }}
                    >
                      {cat.score}%
                    </div>
                    <div
                      style={{
                        fontSize: "0.6em",
                        color: "#94a3b8",
                        lineHeight: 1.2,
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {cat.name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Toggle between grid and detail view */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
              padding: "0 4px",
            }}
          >
            <button
              onClick={() => setShowDetail((p) => !p)}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: "0.65em",
                color: "#94a3b8",
                cursor: "pointer",
              }}
            >
              {showDetail ? "◉ Grid View" : "☰ Detail View"}
            </button>

            {result.flags.length > 0 && (
              <span
                style={{
                  fontSize: "0.62em",
                  color: "#f59e0b",
                  fontWeight: 600,
                }}
              >
                ⚠ {result.flags.length} item
                {result.flags.length !== 1 ? "s" : ""} need attention
              </span>
            )}
          </div>

          {/* Detail view — collapsible categories */}
          {showDetail && (
            <div>
              {/* CMS Compliance Calibration header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px 4px",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: "0.8em" }}>⚖️</span>
                <span
                  style={{
                    fontSize: "0.72em",
                    fontWeight: 700,
                    color: "#94a3b8",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  CMS Compliance Calibration
                </span>
              </div>

              {result.categories.map((cat) => (
                <CategoryRow
                  key={cat.name}
                  cat={cat}
                  isExpanded={!!expandedCats[cat.name]}
                  onToggle={() => toggleCat(cat.name)}
                />
              ))}
            </div>
          )}

          {/* Flags summary at bottom */}
          {showDetail && result.flags.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: "0.68em",
                  fontWeight: 700,
                  color: "#f87171",
                  marginBottom: 4,
                  letterSpacing: "0.03em",
                }}
              >
                🚩 ITEMS REQUIRING ATTENTION
              </div>
              {result.flags.slice(0, 5).map((flag) => (
                <div
                  key={flag.id}
                  style={{
                    fontSize: "0.65em",
                    color: "#fca5a5",
                    lineHeight: 1.35,
                    marginBottom: 3,
                    paddingLeft: 8,
                    borderLeft: `2px solid ${
                      flag.severity === "high"
                        ? "#ef4444"
                        : flag.severity === "medium"
                        ? "#f97316"
                        : "#fbbf24"
                    }40`,
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>{flag.category}:</span>{" "}
                  {flag.evidence.length > 120
                    ? flag.evidence.slice(0, 120) + "…"
                    : flag.evidence}
                </div>
              ))}
              {result.flags.length > 5 && (
                <div
                  style={{
                    fontSize: "0.6em",
                    color: "#64748b",
                    marginTop: 2,
                    paddingLeft: 8,
                  }}
                >
                  + {result.flags.length - 5} more...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
});

export default ComplianceDashboard;
