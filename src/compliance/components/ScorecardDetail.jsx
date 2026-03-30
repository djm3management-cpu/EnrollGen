/**
 * ScorecardDetail — Full scorecard viewer for a single call.
 * Category breakdown, line items with pass/fail/N/A, confidence,
 * transcript evidence, and audio player.
 */

import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchWithClerk } from '../../lib/clerkFetch.js';

const API = '/.netlify/functions/compliance';

const RESULT_COLORS = {
  pass: '#00D166',
  fail: '#FF4455',
  partial: '#FFD700',
  not_applicable: '#555',
};

const RESULT_LABELS = {
  pass: 'PASS',
  fail: 'FAIL',
  partial: 'PARTIAL',
  not_applicable: 'N/A',
};

const ScorecardDetail = memo(function ScorecardDetail({ scorecardId, onBack }) {
  const { getToken } = useAuth();
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!scorecardId) return;
    setLoading(true);
    fetchWithClerk(getToken, `${API}/scorecards/${scorecardId}`)
      .then(res => res.json())
      .then(data => { setScorecard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [scorecardId, getToken]);

  const seekTo = useCallback((ms) => {
    if (audioRef.current && ms != null) {
      audioRef.current.currentTime = ms / 1000;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading scorecard...</div>;
  }

  if (!scorecard) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Scorecard not found</div>;
  }

  const items = scorecard.items || [];
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
  const callRec = scorecard.call_records || {};
  const gradeColor = scorecard.pass_fail === 'PASS' ? '#00D166' : scorecard.pass_fail === 'INSUFFICIENT' ? 'var(--text-muted)' : '#FF4455';
  const catScores = scorecard.category_scores || {};

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-panel)' }}>
        <button onClick={onBack} style={backBtnStyle}>Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {callRec.agent_name || 'Unknown Agent'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {scorecard.created_at ? new Date(scorecard.created_at).toLocaleString() : ''}
            {callRec.call_direction ? ` | ${callRec.call_direction}` : ''}
            {callRec.call_duration_seconds ? ` | ${Math.round(callRec.call_duration_seconds / 60)}m ${callRec.call_duration_seconds % 60}s` : ''}
          </div>
        </div>

        {/* Score Block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={metaLabelStyle}>Score</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: gradeColor, lineHeight: 1 }}>
              {scorecard.pass_fail === 'INSUFFICIENT' ? '—' : `${scorecard.overall_score?.toFixed(1)}%`}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={metaLabelStyle}>Grade</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: gradeColor, lineHeight: 1 }}>
              {scorecard.overall_grade}
            </div>
          </div>
          <div style={{
            padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-display)',
            background: scorecard.pass_fail === 'PASS' ? 'rgba(0,209,102,0.15)' : scorecard.pass_fail === 'INSUFFICIENT' ? 'rgba(255,255,255,0.06)' : 'rgba(255,68,85,0.15)',
            color: gradeColor, border: `1px solid ${gradeColor}33`,
          }}>
            {scorecard.pass_fail}
          </div>
        </div>
      </div>

      {/* Auto-Fail Banner */}
      {scorecard.auto_fail_triggered && (
        <div style={{ padding: '10px 28px', background: 'rgba(255,68,85,0.08)', borderBottom: '1px solid rgba(255,68,85,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FF4455', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Auto-Fail Triggered
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {(scorecard.auto_fail_reasons || []).join(' | ')}
          </span>
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 'calc(100vh - 120px)' }}>
        {/* Left: Category + Line Items */}
        <div style={{ overflow: 'auto', padding: '20px 28px' }}>
          {/* Category Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            {categories.map(cat => {
              const cs = catScores[cat] || {};
              const pct = cs.pct ?? (cs.possible > 0 ? Math.round((cs.earned / cs.possible) * 100) : 0);
              return (
                <div
                  key={cat}
                  onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                  style={{
                    ...miniCardStyle,
                    cursor: 'pointer',
                    borderColor: expandedCategory === cat ? 'rgba(232,0,45,0.3)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {cat.replace(/_/g, ' ')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: barColor(pct) }}>{pct}%</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {cs.earned || 0}/{cs.possible || 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Line Items by Category */}
          {categories.map(cat => {
            const catItems = items.filter(i => i.category === cat);
            const isExpanded = expandedCategory === cat || expandedCategory === null;
            if (!isExpanded) return null;

            return (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: '0.75rem', fontFamily: 'var(--font-display)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '8px 0', marginBottom: 4,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {cat.replace(/_/g, ' ')}
                </div>
                {catItems.map(item => (
                  <LineItem key={item.id} item={item} onSeek={seekTo} />
                ))}
              </div>
            );
          })}

          {items.length === 0 && scorecard.pass_fail === 'INSUFFICIENT' && (
            <div style={{ ...miniCardStyle, textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
              Call was too short for compliance scoring. No line items generated.
            </div>
          )}
        </div>

        {/* Right: Audio + Meta */}
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px', overflow: 'auto' }}>
          {/* Audio Player */}
          <div style={miniCardStyle}>
            <div style={metaLabelStyle}>Call Recording</div>
            {callRec.recording_url ? (
              <audio ref={audioRef} controls style={{ width: '100%', height: 40, marginTop: 8 }} src={callRec.recording_url} />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '8px 0' }}>No recording available</div>
            )}
          </div>

          {/* Points Summary */}
          <div style={{ ...miniCardStyle, marginTop: 14 }}>
            <div style={metaLabelStyle}>Points</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Earned</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  {scorecard.total_points_earned}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Possible</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  {scorecard.total_points_possible}
                </div>
              </div>
            </div>
          </div>

          {/* Risk Flags */}
          {scorecard.risk_flags?.length > 0 && (
            <div style={{ ...miniCardStyle, marginTop: 14 }}>
              <div style={metaLabelStyle}>Risk Flags</div>
              {scorecard.risk_flags.map((flag, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: '#FF4455', padding: '4px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  {flag}
                </div>
              ))}
            </div>
          )}

          {/* Coaching Notes */}
          {scorecard.coaching_notes?.length > 0 && (
            <div style={{ ...miniCardStyle, marginTop: 14 }}>
              <div style={metaLabelStyle}>Coaching Notes</div>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {scorecard.coaching_notes.map((note, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '5px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sequence Violations */}
          {scorecard.sequence_violations > 0 && (
            <div style={{ ...miniCardStyle, marginTop: 14 }}>
              <div style={metaLabelStyle}>Sequence Violations</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#FFD700' }}>
                {scorecard.sequence_violations}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function LineItem({ item, onSeek }) {
  const [expanded, setExpanded] = useState(false);
  const resultColor = RESULT_COLORS[item.result] || '#555';

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        borderLeft: `3px solid ${resultColor}`,
        marginLeft: 8,
        padding: '10px 14px 10px 16px',
        cursor: 'pointer',
        background: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
        transition: 'background 0.12s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Result Badge */}
        <span style={{
          minWidth: 38, textAlign: 'center', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
          background: `${resultColor}18`, color: resultColor, border: `1px solid ${resultColor}33`,
          fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
        }}>
          {RESULT_LABELS[item.result] || item.result}
        </span>

        {/* Question + Evidence */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {item.question_text}
          </div>
          {!expanded && item.evidence_text && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              "{item.evidence_text.slice(0, 100)}"
            </div>
          )}
        </div>

        {/* Points + Confidence */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {item.points_earned}/{item.points_possible}
          </div>
          {item.confidence > 0 && (
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: confColor(item.confidence), marginTop: 2 }}>
              {(item.confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>

        {/* Auto-fail flag */}
        {item.is_auto_fail && item.auto_fail_triggered && (
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#FF4455', background: 'rgba(255,68,85,0.12)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
            AUTO-FAIL
          </span>
        )}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {item.evidence_text && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Evidence
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.45, background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 6 }}>
                "{item.evidence_text}"
              </div>
              {item.evidence_timestamp_ms != null && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSeek(item.evidence_timestamp_ms); }}
                  style={{
                    marginTop: 6, background: 'rgba(232,0,45,0.1)', border: '1px solid rgba(232,0,45,0.25)',
                    color: '#E8002D', padding: '3px 10px', borderRadius: 5, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  Play from {Math.floor(item.evidence_timestamp_ms / 1000)}s
                </button>
              )}
            </div>
          )}
          {item.notes && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              <strong>Notes:</strong> {item.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function confColor(c) {
  if (c >= 0.85) return '#00D166';
  if (c >= 0.70) return '#FFD700';
  return '#FF4455';
}

function barColor(pct) {
  if (pct >= 85) return '#00D166';
  if (pct >= 70) return '#FFD700';
  if (pct >= 50) return '#FF8C00';
  return '#FF4455';
}

const backBtnStyle = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontFamily: 'var(--font-body)',
};

const metaLabelStyle = {
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-display)',
};

const miniCardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
  padding: '14px 18px',
  boxShadow: 'var(--shadow-float)',
};

export default ScorecardDetail;
