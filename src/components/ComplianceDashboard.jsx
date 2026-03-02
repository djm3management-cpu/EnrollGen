import { useState, useMemo, useCallback, memo } from "react";
import {
  AlertTriangle,
  BookOpen,
  BriefcaseMedical,
  Check,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  FileSignature,
  LayoutGrid,
  List,
  Megaphone,
  Mic,
  PhoneCall,
  Scale,
  ScrollText,
  Star,
} from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { useCopilotLog } from "../context/CopilotTranscriptLog";
import { scoreCompliance } from "../context/ComplianceScorer";

/**
 * ComplianceDashboard v2 — Dual-Layer Live Compliance Scoring
 *
 * Shows 9 categories with real-time scores that combine BOTH:
 *   - Gate state (checkbox) scoring
 *   - Live transcript intent detection (Conversely AI-style)
 *
 * Each sub-question shows its evidence SOURCE:
 *   🎙️ = Detected from transcript only (agent said it but didn't click)
 *   ☑️ = Gate only (agent clicked but transcript not yet analyzed)
 *   ✓  = Both confirm (highest confidence)
 *   ⚠️ = Transcript violation detected
 *
 * Props:
 *   transcript — Current agent transcript string from ScriptPrompter
 *
 * Drop into: src/components/ComplianceDashboard.jsx
 */

/* ── Color helpers ── */
function getScoreColor(s) {
  if (s >= 90) return "#34d399";
  if (s >= 75) return "#22c55e";
  if (s >= 50) return "#fbbf24";
  if (s >= 25) return "#f97316";
  return "#ef4444";
}
function getScoreBg(s) {
  if (s >= 90) return "rgba(52,211,153,0.1)";
  if (s >= 75) return "rgba(34,197,94,0.08)";
  if (s >= 50) return "rgba(251,191,36,0.08)";
  if (s >= 25) return "rgba(249,115,22,0.08)";
  return "rgba(239,68,68,0.08)";
}
function getGradeColor(g) {
  if (g.startsWith("A")) return "#34d399";
  if (g.startsWith("B")) return "#22c55e";
  if (g.startsWith("C")) return "#fbbf24";
  if (g.startsWith("D")) return "#f97316";
  return "#ef4444";
}
function renderCategoryIcon(icon, color = "#cbd5e1", size = 16) {
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
function sourceIcon(src, color = "#cbd5e1") {
  const props = { size: 12, color, strokeWidth: 2 };
  if (src === "both") return <Check {...props} />;
  if (src === "transcript") return <Mic {...props} />;
  if (src === "transcript_violation") return <AlertTriangle {...props} />;
  return <CheckSquare {...props} />;
}
function sourceLabel(src) {
  if (src === "both") return "Gate + Transcript";
  if (src === "transcript") return "Transcript";
  if (src === "transcript_violation") return "VIOLATION";
  return "Gate";
}

/* ── Score ring ── */
function ScoreRing({ score, size = 48, strokeWidth = 4 }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const o = c - (score / 100) * c;
  const col = getScoreColor(score);
  return (
    <svg
      width={size}
      height={size}
      style={{ transform: "rotate(-90deg)", flexShrink: 0 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth={strokeWidth}
        strokeDasharray={c}
        strokeDashoffset={o}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={col}
        fontSize={size * 0.26}
        fontWeight="700"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {score}%
      </text>
    </svg>
  );
}

/* ── Category row ── */
const CategoryRow = memo(function CategoryRow({ cat, isExpanded, onToggle }) {
  const col = getScoreColor(cat.score);
  const bg = getScoreBg(cat.score);
  return (
    <div style={{ marginBottom: 2 }}>
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
          transition: "background 0.15s",
          borderLeft: `3px solid ${col}`,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {renderCategoryIcon(cat.icon, col, 15)}
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
          <div style={{ fontSize: "0.63em", color: "#64748b", marginTop: 1 }}>
            {cat.description}
          </div>
        </div>
        <div
          style={{
            background: bg,
            border: `1px solid ${col}30`,
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
              color: col,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {cat.score}%
          </span>
        </div>
        <ChevronDown
          size={14}
          color="#475569"
          style={{
            transition: "transform 0.2s",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </div>

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
            const qc = getScoreColor(q.score);
            const isViolation = q.source === "transcript_violation";
            return (
              <div
                key={q.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 8px",
                  background: isViolation
                    ? "rgba(239,68,68,0.08)"
                    : "rgba(255,255,255,0.02)",
                  borderRadius: 4,
                  borderLeft: `2px solid ${isViolation ? "#ef4444" : qc}40`,
                }}
              >
                {/* Source + score */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    flexShrink: 0,
                    minWidth: 40,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7em",
                      fontWeight: 700,
                      color: qc,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {q.score}%
                  </span>
                  <span
                    title={sourceLabel(q.source)}
                    style={{
                      opacity: 0.8,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 12,
                    }}
                  >
                    {sourceIcon(q.source, isViolation ? "#ef4444" : qc)}
                  </span>
                </div>
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
                      fontSize: "0.63em",
                      color: isViolation
                        ? "#f87171"
                        : q.score >= 75
                        ? "#64748b"
                        : "#f59e0b",
                      lineHeight: 1.3,
                      marginTop: 2,
                      fontWeight: isViolation ? 600 : 400,
                    }}
                  >
                    {q.evidence}
                  </div>
                  {/* Transcript confidence bar */}
                  {q.hasTranscriptEvidence && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.55em",
                          color: "#475569",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Mic size={10} />
                        Intent confidence:
                      </span>
                      <div
                        style={{
                          width: 60,
                          height: 3,
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${q.transcriptConfidence}%`,
                            height: "100%",
                            background: getScoreColor(q.transcriptConfidence),
                            borderRadius: 2,
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "0.55em",
                          color: "#64748b",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {q.transcriptConfidence}%
                      </span>
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: "0.58em",
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
          {cat.cmsRef && (
            <div
              style={{
                fontSize: "0.56em",
                color: "#475569",
                marginTop: 2,
                paddingLeft: 4,
              }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <BookOpen size={10} />
                {cat.cmsRef}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/* ═══════ MAIN ═══════ */
const ComplianceDashboard = memo(function ComplianceDashboard({
  transcript = "",
}) {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [expanded, setExpanded] = useState(true);
  const [expandedCats, setExpandedCats] = useState({});
  const [showDetail, setShowDetail] = useState(false);

  const result = useMemo(
    () => scoreCompliance(state, entries, transcript),
    [state, entries, transcript]
  );
  const toggleCat = useCallback(
    (n) => setExpandedCats((p) => ({ ...p, [n]: !p[n] })),
    []
  );
  const gradeColor = getGradeColor(result.grade);

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
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
        <ScoreRing score={result.score} size={48} strokeWidth={4} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{ fontSize: "0.95em", fontWeight: 700, color: "#e2e8f0" }}
            >
              Compliance Summary
            </span>
            <span
              style={{ fontSize: "0.85em", fontWeight: 800, color: gradeColor }}
            >
              {result.grade}
            </span>
            {result.scoringMode === "dual" && (
              <span
                style={{
                  fontSize: "0.55em",
                  background: "rgba(52,211,153,0.15)",
                  color: "#34d399",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Mic size={10} />
                LIVE TRANSCRIPT
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.68em", color: "#64748b", marginTop: 2 }}>
            {result.categoriesPassed}/{result.totalCategories} categories ·{" "}
            {result.totalPassed}/{result.totalQuestions} checks
            {result.transcriptStats &&
              ` · ${result.transcriptStats.intentsDetected}/${result.transcriptStats.intentsTotal} intents detected`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {result.categories.map((c) => (
            <div
              key={c.name}
              title={`${c.name}: ${c.score}%`}
              style={{
                width: 6,
                height: 20,
                borderRadius: 2,
                background: getScoreColor(c.score),
                opacity: 0.8,
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
        <ChevronDown
          size={15}
          color="#475569"
          style={{
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </div>

      {expanded && (
        <div style={{ padding: "6px 8px 10px" }}>
          {/* Grid view */}
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
                const col = getScoreColor(cat.score);
                return (
                  <div
                    key={cat.name}
                    onClick={() => {
                      setShowDetail(true);
                      setExpandedCats({ [cat.name]: true });
                    }}
                    style={{
                      background: getScoreBg(cat.score),
                      border: `1px solid ${col}20`,
                      borderRadius: 6,
                      padding: "8px 8px 6px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {renderCategoryIcon(cat.icon, col, 15)}
                      </span>
                      <span
                        style={{
                          fontSize: "0.65em",
                          fontWeight: 600,
                          color: cat.passed ? "#34d399" : "#475569",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        {cat.passed ? <Check size={12} /> : null}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "1.1em",
                        fontWeight: 800,
                        color: col,
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

          {/* Toggle + violations count */}
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
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                {showDetail ? <LayoutGrid size={12} /> : <List size={12} />}
                {showDetail ? "Grid" : "Detail"}
              </span>
            </button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {result.transcriptStats?.violations?.length > 0 && (
                <span
                  style={{
                    fontSize: "0.6em",
                    color: "#ef4444",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <AlertTriangle size={11} />
                  {result.transcriptStats.violations.length} violation
                  {result.transcriptStats.violations.length !== 1 ? "s" : ""}
                </span>
              )}
              {result.flags.length > 0 && (
                <span
                  style={{
                    fontSize: "0.6em",
                    color: "#f59e0b",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <AlertTriangle size={11} />
                  {result.flags.length} item
                  {result.flags.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Detail view */}
          {showDetail && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px 4px",
                  marginBottom: 4,
                }}
              >
                <Scale size={13} color="#94a3b8" />
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
                {result.scoringMode === "dual" && (
                  <span
                    style={{
                      fontSize: "0.55em",
                      color: "#64748b",
                      marginLeft: "auto",
                    }}
                  >
                    Dual-layer: gate + transcript
                  </span>
                )}
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

          {/* Violations panel */}
          {showDetail && result.transcriptStats?.violations?.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: "0.68em",
                  fontWeight: 700,
                  color: "#f87171",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <AlertTriangle size={13} />
                  TRANSCRIPT VIOLATIONS DETECTED
                </span>
              </div>
              {result.transcriptStats.violations.map((v, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "0.63em",
                    color: "#fca5a5",
                    lineHeight: 1.35,
                    marginBottom: 3,
                    paddingLeft: 8,
                    borderLeft: "2px solid rgba(239,68,68,0.4)",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>{v.section}:</span>{" "}
                  {v.evidence.length > 140
                    ? v.evidence.slice(0, 140) + "…"
                    : v.evidence}
                  {v.critical && (
                    <span style={{ color: "#ef4444", fontWeight: 700 }}>
                      {" "}
                      [CRITICAL]
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Flags panel */}
          {showDetail &&
            result.flags.length > 0 &&
            !result.transcriptStats?.violations?.length && (
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
                  }}
                >
                  <span
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <AlertTriangle size={13} />
                    ITEMS REQUIRING ATTENTION
                  </span>
                </div>
                {result.flags.slice(0, 5).map((f) => (
                  <div
                    key={f.id}
                    style={{
                      fontSize: "0.63em",
                      color: "#fca5a5",
                      lineHeight: 1.35,
                      marginBottom: 3,
                      paddingLeft: 8,
                      borderLeft: `2px solid ${
                        f.severity === "high"
                          ? "#ef4444"
                          : f.severity === "medium"
                          ? "#f97316"
                          : "#fbbf24"
                      }40`,
                    }}
                  >
                    <span style={{ color: "#94a3b8" }}>{f.category}:</span>{" "}
                    {f.evidence.length > 120
                      ? f.evidence.slice(0, 120) + "…"
                      : f.evidence}
                  </div>
                ))}
                {result.flags.length > 5 && (
                  <div
                    style={{
                      fontSize: "0.58em",
                      color: "#64748b",
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
