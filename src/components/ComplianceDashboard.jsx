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
import { scoreCompliance, scoreTwoSided } from "../context/ComplianceScorer";

/**
 * ComplianceDashboard v2, Dual-Layer Live Compliance Scoring
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
 *   transcript, Current agent transcript string from ScriptPrompter
 *
 * Drop into: src/components/ComplianceDashboard.jsx
 */

/* ── Color helpers, semantic score palette ── */
function scoreBand(s) {
  if (s >= 90) return "a";
  if (s >= 75) return "b";
  if (s >= 50) return "c";
  if (s >= 25) return "d";
  return "f";
}
function getScoreColor(s) {
  return `var(--score-${scoreBand(s)})`;
}
function getScoreBg(s) {
  return `var(--score-${scoreBand(s)}-bg)`;
}
function getScoreBorder(s) {
  return `var(--score-${scoreBand(s)}-border)`;
}
function getScoreGlow(s) {
  return `var(--score-${scoreBand(s)}-glow)`;
}
function getGradeColor(g) {
  if (g.startsWith("A")) return "var(--score-a)";
  if (g.startsWith("B")) return "var(--score-b)";
  if (g.startsWith("C")) return "var(--score-c)";
  if (g.startsWith("D")) return "var(--score-d)";
  return "var(--score-f)";
}
function renderCategoryIcon(icon, color = "var(--text-secondary)", size = 16) {
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
function sourceIcon(src, color = "var(--text-secondary)") {
  const props = { size: 12, color, strokeWidth: 2 };
  if (src === "both") return <Check {...props} />;
  if (src === "transcript") return <Mic {...props} />;
  if (
    src === "transcript_violation" ||
    src === "hard_gate" ||
    src === "insufficient_transcript"
  ) {
    return <AlertTriangle {...props} />;
  }
  return <CheckSquare {...props} />;
}
function sourceLabel(src) {
  if (src === "both") return "Gate + Transcript";
  if (src === "transcript") return "Transcript";
  if (src === "transcript_violation") return "VIOLATION";
  if (src === "hard_gate") return "Hard Gate";
  if (src === "insufficient_transcript") return "Insufficient Transcript";
  if (src === "inactive") return "Mic Off";
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
        stroke="var(--chart-track)"
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
  const canToggle = typeof onToggle === "function";
  const col = getScoreColor(cat.score);
  const bg = getScoreBg(cat.score);
  const border = getScoreBorder(cat.score);
  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={canToggle ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 10px",
          background: isExpanded ? bg : "transparent",
          borderRadius: 3,
          cursor: canToggle ? "pointer" : "default",
          transition: "background 0.12s",
          outline: `1px solid ${isExpanded ? border : "transparent"}`,
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
          <div style={{
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {cat.name}
          </div>
          <div style={{ fontSize: "0.62em", color: "var(--text-muted)", marginTop: 1 }}>
            {cat.description}
          </div>
        </div>
        <div
          style={{
            background: bg,
            border: `1px solid ${border}`,
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
          color="var(--text-muted)"
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
            const isViolation =
              q.source === "transcript_violation" ||
              q.source === "hard_gate" ||
              q.source === "insufficient_transcript";
            return (
              <div
                key={q.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 8px",
                  background: isViolation
                    ? "var(--status-offline-bg)"
                    : "var(--bg-elevated)",
                  borderRadius: 4,
                  outline: `1px solid ${isViolation ? "var(--status-offline-border)" : getScoreBorder(q.score)}`,
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
                    {sourceIcon(q.source, isViolation ? "var(--danger)" : qc)}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.72em",
                      color: "var(--text-primary)",
                      lineHeight: 1.35,
                    }}
                  >
                    {q.question.split("?")[0]}?
                  </div>
                  <div
                    style={{
                      fontSize: "0.63em",
                      color: isViolation
                        ? "var(--eg-red-text)"
                        : q.score >= 75
                        ? "var(--text-muted)"
                        : "var(--status-pending)",
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
                          color: "var(--text-muted)",
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
                          background: "var(--chart-track)",
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
                          color: "var(--text-muted)",
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
                    color: "var(--text-muted)",
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
                color: "var(--text-muted)",
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
  customerTranscript = "",
  mergedTranscript = [],
  result: providedResult = null,
  forceExpanded = false,
  forceShowDetail = false,
  forceExpandAllCategories = false,
}) {
  const { state } = useScript();
  const { entries } = useCopilotLog();
  const [expanded, setExpanded] = useState(false);
  const [expandedCats, setExpandedCats] = useState({});
  const [showDetail, setShowDetail] = useState(false);

  const result = useMemo(
    () =>
      providedResult ??
      (customerTranscript
        ? scoreTwoSided(
            state,
            entries,
            transcript,
            customerTranscript,
            mergedTranscript,
            {
              callStarted: true,
              callDirection: state.callDirection,
            }
          )
        : scoreCompliance(state, entries, transcript, {
            callStarted: true,
            callDirection: state.callDirection,
            mergedTranscript,
          })),
    [
      providedResult,
      state,
      entries,
      transcript,
      customerTranscript,
      mergedTranscript,
    ]
  );
  const toggleCat = useCallback(
    (n) => setExpandedCats((p) => ({ ...p, [n]: !p[n] })),
    []
  );
  const gradeColor = getGradeColor(result.grade);
  const isTranscriptScored =
    result.scoringMode !== "gate_only" && result.scoringMode !== "inactive";
  const isExpanded = forceExpanded || expanded;
  const showDetailView = forceShowDetail || showDetail;
  const modeLabel =
    result.scoringMode === "strict_two_sided"
      ? "Strict Transcript + Customer"
      : result.scoringMode === "strict_transcript"
      ? "Strict Transcript"
      : result.scoringMode === "inactive"
      ? "Mic Off / No Transcript"
      : result.scoringMode === "two_sided"
      ? "Two-Sided"
      : result.scoringMode === "dual"
      ? "Gate + Transcript"
      : "Gate Only";

  return (
    <section
      className="card compliance-dashboard"
      style={{
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* Header, F1 HUD bar */}
      <div
        className="compliance-dashboard-header"
        onClick={forceExpanded ? undefined : () => setExpanded((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          cursor: forceExpanded ? "default" : "pointer",
          borderBottom: isExpanded ? "1px solid var(--border-default)" : "none",
          borderRadius: isExpanded ? "5px 5px 0 0" : "5px",
        }}
      >
        <ScoreRing score={result.score} size={48} strokeWidth={4} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontFamily: "var(--font-body)",
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}>
              Compliance HUD
            </span>
            {isExpanded && (
              <span style={{
                fontFamily: "var(--font-body)",
                fontSize: "16px",
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: gradeColor,
                textShadow: `0 0 10px ${getScoreGlow(result.score)}`,
              }}>
                {result.grade}
              </span>
            )}
            {isTranscriptScored && (
              <span style={{
                fontSize: "10px",
                fontFamily: "var(--font-body)",
                fontWeight: 700,
                letterSpacing: "0.10em",
                background: "var(--status-live-bg)",
                color: "var(--status-live)",
                padding: "1px 7px",
                borderRadius: 3,
                border: "1px solid var(--status-live-border)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textTransform: "uppercase",
              }}>
                <Mic size={10} />
                Strict
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.68em", color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
            {result.categoriesPassed}/{result.totalCategories} SECTORS ·{" "}
            {result.totalPassed}/{result.totalQuestions} CHECKS
            {result.transcriptStats &&
              ` · ${result.transcriptStats.intentsDetected}/${result.transcriptStats.intentsTotal} INTENTS`}
          </div>
        </div>
        {/* Sector bars, F1 telemetry style */}
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
          {result.categories.map((c) => (
            <div
              key={c.name}
              title={`${c.name}: ${c.score}%`}
              style={{
                width: 5,
                height: Math.max(8, Math.round(c.score / 100 * 24)),
                borderRadius: 1,
                background: getScoreColor(c.score),
                boxShadow: `0 0 4px ${getScoreGlow(c.score)}`,
                transition: "all 0.4s ease",
              }}
            />
          ))}
        </div>
        <ChevronDown
          size={15}
          color="var(--text-muted)"
          style={{
            transition: "transform 0.2s",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </div>

      {isExpanded && (
        <div className="compliance-dashboard-body">
          {/* Grid view */}
          {!showDetailView && (
            <div className="compliance-dashboard-grid" style={{ marginBottom: 8 }}>
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
                      border: `1px solid ${getScoreBorder(cat.score)}`,
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
                          color: cat.passed ? "var(--status-live)" : "var(--text-muted)",
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
                        color: "var(--text-muted)",
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
              justifyContent: forceShowDetail ? "flex-end" : "space-between",
              alignItems: "center",
              marginBottom: 4,
              padding: "0 4px",
            }}
          >
            {!forceShowDetail && (
              <button
                onClick={() => setShowDetail((p) => !p)}
                style={{
                  background: "linear-gradient(180deg, var(--eg-surface-2) 0%, var(--eg-surface-1) 100%)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 3,
                  padding: "3px 10px",
                  fontFamily: "var(--font-body)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
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
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {result.transcriptStats?.violations?.length > 0 && (
                <span
                  style={{
                    fontSize: "0.6em",
                    color: "var(--danger)",
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
                    color: "var(--status-pending)",
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
          {showDetailView && (
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
                <Scale size={13} color="var(--text-muted)" />
                <span style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--text-label)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}>
                  CMS Compliance Telemetry
                </span>
                {isTranscriptScored && (
                  <span
                    style={{
                      fontSize: "0.55em",
                      color: "var(--text-muted)",
                      marginLeft: "auto",
                    }}
                  >
                    {modeLabel}
                  </span>
                )}
              </div>
              {result.categories.map((cat) => (
                <CategoryRow
                  key={cat.name}
                  cat={cat}
                  isExpanded={forceExpandAllCategories || !!expandedCats[cat.name]}
                  onToggle={
                    forceExpandAllCategories ? undefined : () => toggleCat(cat.name)
                  }
                />
              ))}
            </div>
          )}

          {/* Violations panel */}
          {showDetailView && result.transcriptStats?.violations?.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                background: "var(--status-offline-bg)",
                border: "1px solid var(--status-offline-border)",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: "0.68em",
                  fontWeight: 700,
                  color: "var(--eg-red-text)",
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
                    color: "var(--eg-red-text)",
                    lineHeight: 1.35,
                    marginBottom: 3,
                    paddingLeft: 8,
                    outline: "1px solid var(--status-offline-border)",
                    borderRadius: 3,
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>{v.section}:</span>{" "}
                  {v.evidence.length > 140
                    ? v.evidence.slice(0, 140) + "…"
                    : v.evidence}
                  {v.critical && (
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                      {" "}
                      [CRITICAL]
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Flags panel */}
          {showDetailView &&
            result.flags.length > 0 &&
            !result.transcriptStats?.violations?.length && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  background: "var(--status-offline-bg)",
                  border: "1px solid var(--status-offline-border)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: "0.68em",
                    fontWeight: 700,
                    color: "var(--eg-red-text)",
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
                      color: "var(--eg-red-text)",
                      lineHeight: 1.35,
                      marginBottom: 3,
                      paddingLeft: 8,
                      outline: `1px solid ${
                        f.severity === "high"
                          ? "var(--status-offline-border)"
                          : f.severity === "medium"
                          ? "var(--status-pending-border)"
                          : "var(--status-pending-border)"
                      }`,
                      borderRadius: 3,
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>{f.category}:</span>{" "}
                    {f.evidence.length > 120
                      ? f.evidence.slice(0, 120) + "…"
                      : f.evidence}
                  </div>
                ))}
                {result.flags.length > 5 && (
                  <div
                    style={{
                      fontSize: "0.58em",
                      color: "var(--text-muted)",
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
