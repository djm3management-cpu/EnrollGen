import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { redactSensitiveText } from "../../lib/redaction";
import { callOutcomeLabel } from "../../lib/postCallPipeline";
import { CATEGORY_WEIGHTS } from "../../compliance/intents/index.js";

// Full compliance breakdown: metadata header, overall score, a
// section-by-section flag breakdown (from scorecard_items, which
// already carries evidence_text/evidence_timestamp_ms per flag —
// see supabase/migrations/001_compliance_engine.sql), and the full
// diarized transcript side-by-side so a flag click can jump/highlight
// the moment that triggered it. This is additive to (not a
// replacement for) CallDetailPanel's lightweight Compliance tab.

const CATEGORY_LABELS = {
  CALL_OPENING: "Call Opening",
  SOA_VERIFICATION: "Scope of Appointment Verification",
  ELIGIBILITY_VERIFICATION: "Eligibility / PII Verification",
  NEEDS_ASSESSMENT: "Needs Assessment",
  PLAN_PRESENTATION: "Plan Presentation",
  IMPACT_ON_CURRENT_COVERAGE: "Impact on Current Coverage",
  PRE_ENROLLMENT_CHECKLIST: "Pre-Enrollment Checklist",
  ENROLLMENT_CLOSING: "Enrollment / Closing",
  SALES_CONDUCT: "Sales Conduct",
  CALL_RECORDING_COMPLIANCE: "Call Recording Compliance",
  ANNUITY_BEST_INTEREST: "Annuity Best Interest",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_WEIGHTS);
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const COMPLIANCE_WARNING_THRESHOLD = 80;

function fmtDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString([], { month: "2-digit", day: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "--";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nearestUtteranceIndex(utterances, timestampMs) {
  if (!Array.isArray(utterances) || !utterances.length || timestampMs == null) return -1;
  let bestIndex = -1;
  let bestDelta = Infinity;
  utterances.forEach((utterance, index) => {
    const delta = Math.abs(asNumber(utterance.start_ms, 0) - timestampMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function ScoreBanner({ scorecard }) {
  const score = scorecard?.overall_score;
  const value = score !== null && score !== undefined ? Math.round(Number(score)) : null;
  const isWarning = value !== null && value < COMPLIANCE_WARNING_THRESHOLD;

  return (
    <div className={`compliance-review-banner${isWarning ? " is-warning" : ""}`}>
      <div className="compliance-review-score">
        <strong>{value !== null ? `${value}%` : "--"}</strong>
        <span>{scorecard?.overall_grade || "--"}</span>
      </div>
      <div className="compliance-review-banner-meta">
        <span>{String(scorecard?.pass_fail || "--").toUpperCase()}</span>
        {scorecard?.auto_fail_triggered ? <span className="is-autofail">AUTO-FAIL</span> : null}
        {isWarning ? <span className="is-warning-label">⚠ BELOW {COMPLIANCE_WARNING_THRESHOLD}% THRESHOLD</span> : null}
      </div>
    </div>
  );
}

function CategorySection({ category, items, onJumpToEvidence, activeItemId }) {
  const [open, setOpen] = useState(false);
  const passCount = items.filter((item) => String(item.result || "").toLowerCase() === "pass").length;
  const pct = items.length ? Math.round((passCount / items.length) * 100) : 0;

  return (
    <div className="compliance-review-category">
      <button type="button" className="compliance-review-category-head" onClick={() => setOpen((v) => !v)}>
        <span>{CATEGORY_LABELS[category] || category}</span>
        <span className="compliance-review-category-count">
          {passCount}/{items.length} passed
        </span>
        <div className="compliance-review-category-track">
          <span style={{ width: `${pct}%` }} />
        </div>
        <b>{open ? "▼" : "▶"}</b>
      </button>
      {open ? (
        <div className="compliance-review-category-body">
          {items.map((item) => {
            const isPass = String(item.result || "").toLowerCase() === "pass";
            return (
              <button
                type="button"
                key={item.id}
                className={`compliance-review-flag${isPass ? " is-pass" : " is-fail"}${activeItemId === item.id ? " is-active" : ""}`}
                onClick={() => onJumpToEvidence(item)}
              >
                <span className="compliance-review-flag-result">{isPass ? "PASS" : "FAIL"}</span>
                <span className="compliance-review-flag-question">{item.question_text || item.intent_id}</span>
                {item.evidence_text ? (
                  <span className="compliance-review-flag-evidence">
                    "{redactSensitiveText(item.evidence_text).slice(0, 140)}"
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TranscriptPanel({ utterances, highlightIndex, containerRef }) {
  return (
    <div className="compliance-review-transcript" ref={containerRef}>
      {utterances.length === 0 ? (
        <div className="contacts-muted">No diarized transcript stored</div>
      ) : (
        utterances.map((utterance, index) => {
          const speaker = utterance.speaker === "customer" ? "Customer" : "Agent";
          return (
            <div
              key={`${utterance.start_ms || 0}-${index}`}
              id={`utterance-${utterance.start_ms || 0}-${index}`}
              className={`ops-utterance${highlightIndex === index ? " is-highlighted" : ""}`}
            >
              <span className="speaker">{speaker}</span>
              <span className="time">{fmtDuration((utterance.start_ms || 0) / 1000)}</span>
              <p>{redactSensitiveText(utterance.text || "")}</p>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function ComplianceReviewModal({ callRecordId, supabaseClient, onClose }) {
  const [callRecord, setCallRecord] = useState(null);
  const [contactSource, setContactSource] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [scorecardItems, setScorecardItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scoringError, setScoringError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [activeItemId, setActiveItemId] = useState(null);
  const transcriptRef = useRef(null);
  const pollStartRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabaseClient || !callRecordId) return;
    const { data: record, error } = await supabaseClient
      .from("call_records")
      .select(
        "id, call_start, call_duration_seconds, agent_name, beneficiary_name, contact_id, call_outcome, transcript_diarized, compliance_scorecard_id, metadata"
      )
      .eq("id", callRecordId)
      .single();
    if (error) {
      console.error("[ComplianceReviewModal] call_records load failed:", error.message);
      return;
    }
    setCallRecord(record);

    if (record.contact_id) {
      const { data: contact } = await supabaseClient
        .from("contacts")
        .select("source")
        .eq("id", record.contact_id)
        .maybeSingle();
      setContactSource(contact?.source || null);
    }

    setScoringError(record.metadata?.scoring_error || null);

    if (!record.compliance_scorecard_id) {
      setScorecard(null);
      setScorecardItems([]);
      return;
    }

    const { data: scorecardRow } = await supabaseClient
      .from("compliance_scorecards")
      .select("*")
      .eq("id", record.compliance_scorecard_id)
      .maybeSingle();
    setScorecard(scorecardRow || null);

    if (scorecardRow?.id) {
      const { data: items } = await supabaseClient
        .from("scorecard_items")
        .select("*")
        .eq("scorecard_id", scorecardRow.id)
        .order("display_order", { ascending: true });
      setScorecardItems(items || []);
    }
  }, [supabaseClient, callRecordId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Poll while scoring is still in flight (fire-and-forget background
  // function — see netlify/functions/score-call-background.js).
  useEffect(() => {
    if (callRecord?.compliance_scorecard_id || scoringError) return undefined;
    if (!pollStartRef.current) pollStartRef.current = Date.now();

    const interval = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        return;
      }
      await load();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [callRecord?.compliance_scorecard_id, scoringError, load]);

  const handleRetryScoring = useCallback(async () => {
    if (!callRecordId) return;
    setRetrying(true);
    setScoringError(null);
    pollStartRef.current = Date.now();
    try {
      await fetch("/.netlify/functions/score-call-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: callRecordId }),
      });
    } catch (err) {
      console.error("[ComplianceReviewModal] retry trigger failed:", err);
    } finally {
      setRetrying(false);
    }
  }, [callRecordId]);

  const utterances = useMemo(
    () => (Array.isArray(callRecord?.transcript_diarized) ? callRecord.transcript_diarized : []),
    [callRecord?.transcript_diarized]
  );

  const groupedItems = useMemo(() => {
    const byCategory = {};
    for (const item of scorecardItems) {
      const category = item.category || "UNCATEGORIZED";
      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(item);
    }
    return byCategory;
  }, [scorecardItems]);

  const handleJumpToEvidence = useCallback(
    (item) => {
      setActiveItemId(item.id);
      const index = nearestUtteranceIndex(utterances, item.evidence_timestamp_ms);
      if (index < 0) return;
      setHighlightIndex(index);
      const utterance = utterances[index];
      const el = document.getElementById(`utterance-${utterance.start_ms || 0}-${index}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setHighlightIndex(-1), 4000);
    },
    [utterances]
  );

  const isScoring = !callRecord?.compliance_scorecard_id && !scoringError;

  return (
    <div className="compliance-review-overlay" onClick={onClose}>
      <div className="compliance-review-modal" onClick={(event) => event.stopPropagation()}>
        <div className="compliance-review-head">
          <h2>COMPLIANCE REVIEW</h2>
          <button type="button" className="contacts-mini-btn" onClick={onClose}>CLOSE</button>
        </div>

        {loading ? (
          <div className="contacts-muted">Loading call record...</div>
        ) : !callRecord ? (
          <div className="ops-error">Call record unavailable</div>
        ) : (
          <>
            <dl className="compliance-review-meta">
              <div><dt>CALL DATE</dt><dd className="mono">{fmtDateTime(callRecord.call_start)}</dd></div>
              <div><dt>DURATION</dt><dd className="mono">{fmtDuration(callRecord.call_duration_seconds)}</dd></div>
              <div><dt>AGENT</dt><dd>{callRecord.agent_name || "--"}</dd></div>
              <div><dt>CONSUMER</dt><dd>{callRecord.beneficiary_name || "--"}</dd></div>
              <div><dt>OUTCOME</dt><dd>{callOutcomeLabel(callRecord.call_outcome)}</dd></div>
              <div><dt>LEAD SOURCE</dt><dd>{contactSource || "--"}</dd></div>
            </dl>

            {isScoring ? (
              <div className="compliance-review-scoring">
                <span className="compliance-review-spinner" />
                Scoring in progress — this can take a minute.
              </div>
            ) : scoringError ? (
              <div className="ops-error">
                Scoring failed: {scoringError}
                <button type="button" className="contacts-mini-btn" onClick={handleRetryScoring} disabled={retrying}>
                  {retrying ? "RETRYING..." : "RETRY SCORING"}
                </button>
              </div>
            ) : (
              <>
                <ScoreBanner scorecard={scorecard} />
                {scorecard?.auto_fail_triggered && scorecard?.auto_fail_reasons?.length ? (
                  <div className="compliance-review-autofail-reasons">
                    {scorecard.auto_fail_reasons.map((reason, index) => (
                      <p key={index}>⚠ {reason}</p>
                    ))}
                  </div>
                ) : null}

                <div className="compliance-review-body">
                  <div className="compliance-review-sections">
                    {CATEGORY_ORDER.filter((category) => groupedItems[category]?.length).map((category) => (
                      <CategorySection
                        key={category}
                        category={category}
                        items={groupedItems[category]}
                        onJumpToEvidence={handleJumpToEvidence}
                        activeItemId={activeItemId}
                      />
                    ))}
                    {Object.keys(groupedItems).length === 0 ? (
                      <div className="contacts-muted">No scorecard line items stored</div>
                    ) : null}
                  </div>
                  <TranscriptPanel utterances={utterances} highlightIndex={highlightIndex} containerRef={transcriptRef} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
