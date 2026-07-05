import { useState } from "react";
import { redactSensitiveText } from "../../lib/redaction";

// Call intelligence detail view shared by the CALLS tab and the
// CONTACTS tab. Expects a detail object shaped like the
// call_records row plus an attached compliance scorecard:
// { transcript_diarized, dg_summary, dg_sentiment, call_analytics,
//   agent_assessment, beneficiary_risk, scorecard, ... }

const DETAIL_TABS = ["Transcript", "Analytics", "Assessment", "Compliance"];

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString();
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "-";
  const total = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sentenceCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function scoreLabel(score) {
  const value = asNumber(score, 0);
  if (value > 0.05) return "positive";
  if (value < -0.05) return "negative";
  return "neutral";
}

function addDaysISO(value, days) {
  const base = value ? new Date(value) : new Date();
  const valid = Number.isNaN(base.getTime()) ? new Date() : base;
  valid.setDate(valid.getDate() + asNumber(days, 30));
  return valid.toISOString().slice(0, 10);
}

function sentimentForUtterance(text, segments = []) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return "neutral";
  const match = segments.find((segment) => {
    const segmentText = String(segment.text || "").toLowerCase();
    if (!segmentText) return false;
    const probe = segmentText.slice(0, 48);
    return normalized.includes(probe) || segmentText.includes(normalized.slice(0, 48));
  });
  return match?.sentiment || scoreLabel(match?.score);
}

function EmptyLine({ children = "--" }) {
  return <div className="ops-inline-empty">{children}</div>;
}

function DetailTabs({ activeTab, onTabChange }) {
  return (
    <div className="ops-detail-tabs">
      {DETAIL_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          className={activeTab === tab ? "is-active" : ""}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function TranscriptDetail({ detail }) {
  const utterances = Array.isArray(detail?.transcript_diarized) ? detail.transcript_diarized : [];
  const segments = detail?.dg_sentiment?.segments || [];

  return (
    <div className="ops-detail-grid">
      <div className="ops-summary-box">
        <span className="ops-mini-label">Deepgram Summary</span>
        <p>{redactSensitiveText(detail?.dg_summary || "No Deepgram summary available.")}</p>
      </div>
      <div className="ops-transcript-list">
        {utterances.length === 0 ? (
          <EmptyLine>No diarized transcript stored</EmptyLine>
        ) : (
          utterances.map((utterance, index) => {
            const safeText = redactSensitiveText(utterance.text || "");
            const sentiment = sentimentForUtterance(safeText, segments);
            const speaker = utterance.speaker === "customer" ? "Customer" : "Agent";
            return (
              <div key={`${utterance.start_ms || 0}-${index}`} className={`ops-utterance sentiment-${sentiment}`}>
                <span className="speaker">{speaker}</span>
                <span className="time">{fmtDuration((utterance.start_ms || 0) / 1000)}</span>
                <p>{safeText}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function WpmIndicator({ label, value }) {
  const numeric = asNumber(value, 0);
  const pct = Math.max(0, Math.min(100, (numeric / 220) * 100));
  return (
    <div className="ops-wpm">
      <div className="ops-wpm-head">
        <span>{label}</span>
        <strong>{numeric}</strong>
      </div>
      <div className="ops-wpm-track">
        <span className="ideal" />
        <span className="marker" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function SentimentTrajectory({ trajectory = [] }) {
  const points = trajectory.length ? trajectory : [1, 2, 3, 4].map((quarter) => ({ quarter, avg_score: 0 }));
  const polyline = points.map((point, index) => {
    const x = 12 + index * 45;
    const y = 42 - Math.max(-1, Math.min(1, asNumber(point.avg_score, 0))) * 30;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="ops-sentiment-chart">
      <svg viewBox="0 0 150 82" role="img" aria-label="Sentiment trajectory">
        <line x1="8" y1="42" x2="142" y2="42" />
        <polyline points={polyline} />
        {points.map((point, index) => {
          const x = 12 + index * 45;
          const y = 42 - Math.max(-1, Math.min(1, asNumber(point.avg_score, 0))) * 30;
          return <circle key={point.quarter || index} cx={x} cy={y} r="3" />;
        })}
      </svg>
      <div className="ops-chart-axis">
        {points.map((point, index) => (
          <span key={point.quarter || index}>Q{point.quarter || index + 1}</span>
        ))}
      </div>
    </div>
  );
}

function AnalyticsDetail({ detail }) {
  const analytics = detail?.call_analytics || {};
  const talk = analytics.talk_time || {};
  const wpm = analytics.wpm || {};
  const pauses = analytics.pauses || {};
  const interruptions = analytics.interruptions || {};
  const trajectory = detail?.dg_sentiment?.trajectory || [];
  const pauseRows = Array.isArray(pauses.pauses) ? pauses.pauses : [];
  const longestPause = pauseRows.reduce((max, pause) => (
    asNumber(pause.duration_ms, 0) > asNumber(max?.duration_ms, 0) ? pause : max
  ), null);
  const agentPct = asNumber(talk.agent_talk_pct, 50);
  const customerPct = Math.max(0, 100 - agentPct);

  return (
    <div className="ops-analytics-grid">
      <div className="ops-analytics-block span-2">
        <span className="ops-mini-label">Talk Time</span>
        <div className="ops-talk-bar">
          <span className="agent" style={{ width: `${agentPct}%` }}>{agentPct}%</span>
          <span className="customer" style={{ width: `${customerPct}%` }}>{customerPct}%</span>
        </div>
        <div className="ops-talk-legend">
          <span>Agent {fmtDuration(asNumber(talk.agent_ms, 0) / 1000)}</span>
          <span>Customer {fmtDuration(asNumber(talk.customer_ms, 0) / 1000)}</span>
        </div>
      </div>
      <div className="ops-analytics-block">
        <span className="ops-mini-label">Words Per Minute</span>
        <WpmIndicator label="Agent" value={wpm.agent_wpm} />
        <WpmIndicator label="Customer" value={wpm.customer_wpm} />
      </div>
      <div className="ops-analytics-block">
        <span className="ops-mini-label">Pauses</span>
        <div className="ops-kpi-pair">
          <span>Total</span>
          <strong>{fmtNumber(pauses.total_pauses)}</strong>
        </div>
        <div className="ops-kpi-pair">
          <span>Longest</span>
          <strong>{fmtDuration(asNumber(pauses.longest_pause_ms, 0) / 1000)}</strong>
        </div>
        <div className="ops-position-track">
          <span style={{ left: `${asNumber(longestPause?.position_pct, 0)}%` }} />
        </div>
      </div>
      <div className="ops-analytics-block">
        <span className="ops-mini-label">Interruptions</span>
        <div className="ops-kpi-pair">
          <span>Agent</span>
          <strong>{fmtNumber(interruptions.agent_interruptions)}</strong>
        </div>
        <div className="ops-kpi-pair">
          <span>Customer</span>
          <strong>{fmtNumber(interruptions.customer_interruptions)}</strong>
        </div>
      </div>
      <div className="ops-analytics-block span-2">
        <span className="ops-mini-label">Sentiment Trajectory</span>
        <SentimentTrajectory trajectory={trajectory} />
      </div>
    </div>
  );
}

function Gauge({ label, value }) {
  const numeric = asNumber(value, 0);
  const pct = Math.max(0, Math.min(100, (numeric / 10) * 100));
  return (
    <div className="ops-gauge" style={{ "--score-pct": `${pct}%` }}>
      <div className="ring">
        <span>{numeric || "--"}</span>
      </div>
      <span className="label">{label}</span>
    </div>
  );
}

export function RiskBadge({ level }) {
  const normalized = String(level || "low").toLowerCase();
  return <span className={`ops-risk-badge ${normalized}`}>{normalized.toUpperCase()}</span>;
}

function ListBlock({ title, items }) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="ops-list-block">
      <span className="ops-mini-label">{title}</span>
      {rows.length === 0 ? (
        <EmptyLine>None</EmptyLine>
      ) : (
        rows.map((item, index) => <p key={`${title}-${index}`}>{item}</p>)
      )}
    </div>
  );
}

function AssessmentDetail({ detail }) {
  const agent = detail?.agent_assessment || {};
  const beneficiary = detail?.beneficiary_risk || {};
  const followupDate = addDaysISO(
    detail?.effective_date || detail?.call_start,
    beneficiary.recommended_followup_days || 30
  );

  return (
    <div className="ops-assessment-grid">
      <div className="ops-gauge-row">
        <Gauge label="Rapport" value={agent.rapport_score} />
        <Gauge label="Listening" value={agent.listening_score} />
        <Gauge label="Product" value={agent.product_knowledge_score} />
      </div>
      <div className="ops-coaching-priority">
        <span className="ops-mini-label">Top Coaching Priority</span>
        <p>{agent.top_coaching_priority || "No coaching priority stored."}</p>
      </div>
      <ListBlock title="Missed Opportunities" items={agent.missed_opportunities} />
      <ListBlock title="CMS Audit Flags" items={agent.audit_risk_flags} />
      <div className="ops-beneficiary-box">
        <span className="ops-mini-label">Beneficiary Risk</span>
        <div className="ops-beneficiary-row">
          <span>Engagement</span>
          <strong>{agent.engagement_score || beneficiary.engagement_score || "--"}/10</strong>
        </div>
        <div className="ops-beneficiary-row">
          <span>Disenrollment</span>
          <RiskBadge level={beneficiary.disenrollment_risk} />
        </div>
        <div className="ops-beneficiary-row">
          <span>Follow-up</span>
          <strong>{followupDate}</strong>
        </div>
        <p>{beneficiary.disenrollment_risk_reason || "No risk reason stored."}</p>
      </div>
      <ListBlock title="Confusion Indicators" items={beneficiary.confusion_indicators} />
    </div>
  );
}

function ComplianceDetail({ detail }) {
  const scorecard = detail?.scorecard || {};
  const categoryScores = Object.entries(scorecard.category_scores || {});

  return (
    <div className="ops-compliance-detail">
      <div className="ops-compliance-overview">
        <div>
          <span className="ops-mini-label">Overall</span>
          <strong>{scorecard.overall_score !== undefined ? `${Math.round(Number(scorecard.overall_score))}%` : "--"}</strong>
        </div>
        <div>
          <span className="ops-mini-label">Grade</span>
          <strong>{scorecard.overall_grade || "--"}</strong>
        </div>
        <div>
          <span className="ops-mini-label">Pass/Fail</span>
          <strong>{String(scorecard.pass_fail || "--").toUpperCase()}</strong>
        </div>
      </div>
      {scorecard.auto_fail_triggered ? (
        <ListBlock title="Auto-Fail Reasons" items={scorecard.auto_fail_reasons} />
      ) : null}
      <div className="ops-category-grid">
        {categoryScores.length === 0 ? (
          <EmptyLine>No category scores stored</EmptyLine>
        ) : (
          categoryScores.map(([category, scores]) => (
            <div key={category} className="ops-category-row">
              <span>{sentenceCase(category)}</span>
              <strong>{Math.round(asNumber(scores?.pct, 0))}%</strong>
              <div className="ops-category-track">
                <span style={{ width: `${Math.max(0, Math.min(100, asNumber(scores?.pct, 0)))}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
      <ListBlock title="Risk Flags" items={scorecard.risk_flags} />
    </div>
  );
}

export default function CallDetailPanel({ detail, loading }) {
  const [activeTab, setActiveTab] = useState("Transcript");

  if (loading) {
    return <div className="ops-detail-panel"><EmptyLine>Loading call intelligence</EmptyLine></div>;
  }
  if (!detail) {
    return <div className="ops-detail-panel"><EmptyLine>Call intelligence unavailable</EmptyLine></div>;
  }

  return (
    <div className="ops-detail-panel">
      <DetailTabs activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "Transcript" ? <TranscriptDetail detail={detail} /> : null}
      {activeTab === "Analytics" ? <AnalyticsDetail detail={detail} /> : null}
      {activeTab === "Assessment" ? <AssessmentDetail detail={detail} /> : null}
      {activeTab === "Compliance" ? <ComplianceDetail detail={detail} /> : null}
    </div>
  );
}
