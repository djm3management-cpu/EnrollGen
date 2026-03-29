/**
 * SpotCheckView — Side-by-side scorecard + audio player for calibration spot-checking.
 * Allows confirming, overriding, or noting individual scorecard items.
 */

import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchWithClerk } from '../../lib/clerkFetch.js';
import OverrideForm from './OverrideForm.jsx';

const API = '/.netlify/functions/compliance';

const RESULT_COLORS = {
  pass: '#00D166',
  fail: '#FF4455',
  partial: '#FFD700',
  na: '#555',
  manual: '#a855f7',
};

const SpotCheckView = memo(function SpotCheckView({ callId, scorecardId, calibrationRunId, onBack }) {
  const { getToken } = useAuth();
  const [scorecard, setScorecard] = useState(null);
  const [callRecord, setCallRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [scRes, callRes] = await Promise.all([
        fetchWithClerk(getToken, `${API}/scorecards/${scorecardId}`),
        fetchWithClerk(getToken, `${API}/calls/${callId}/scorecard`),
      ]);
      if (scRes.ok) setScorecard(await scRes.json());
      // Also fetch call record for recording URL
      try {
        const detRes = await fetchWithClerk(getToken, `${API}/calls/${callId}/detections`);
        if (detRes.ok) {
          // We mainly need the call record — get it from the scorecard response
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [scorecardId, callId, getToken]);

  const seekToTimestamp = useCallback((ms) => {
    if (audioRef.current && ms != null) {
      audioRef.current.currentTime = ms / 1000;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const handleOverrideSubmit = useCallback(async (override) => {
    // Submit the override to the calibration endpoint
    await fetchWithClerk(getToken, `${API}/calibration/${calibrationRunId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(override),
    });

    // Also update the scorecard item itself
    await fetchWithClerk(getToken, `${API}/calls/${callId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scorecard_item_id: override.scorecard_item_id,
        new_result: override.human_result,
        reason: override.override_reason,
      }),
    });

    // Refresh scorecard
    const res = await fetchWithClerk(getToken, `${API}/scorecards/${scorecardId}`);
    if (res.ok) setScorecard(await res.json());
    setActiveItem(null);
  }, [callId, scorecardId, calibrationRunId, getToken]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading scorecard...</div>
    );
  }

  const items = scorecard?.items || [];
  const categories = [...new Set(items.map(i => i.category))];
  const gradeColor = scorecard?.pass_fail === 'PASS' ? '#00D166' : '#FF4455';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-panel)' }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}>
          Back
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Spot-Check Review
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}>Score</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: gradeColor, lineHeight: 1 }}>
              {scorecard?.overall_score?.toFixed(1)}%
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}>Grade</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: gradeColor, lineHeight: 1 }}>
              {scorecard?.overall_grade}
            </div>
          </div>
          <div style={{ padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'var(--font-display)', background: scorecard?.pass_fail === 'PASS' ? 'rgba(0,209,102,0.15)' : 'rgba(255,68,85,0.15)', color: gradeColor, border: `1px solid ${gradeColor}33` }}>
            {scorecard?.pass_fail}
          </div>
        </div>
      </div>

      {/* Main Content: Split View */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel: Scorecard */}
        <div style={{ overflow: 'auto', padding: '20px 24px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {categories.map(cat => {
            const catItems = items.filter(i => i.category === cat);
            const catScore = catItems.reduce((s, i) => s + i.points_earned, 0);
            const catPossible = catItems.reduce((s, i) => s + i.points_possible, 0);
            const catPct = catPossible > 0 ? Math.round((catScore / catPossible) * 100) : 0;
            const isExpanded = expandedCategory === cat || expandedCategory === null;

            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div
                  onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', flex: 1 }}>
                    {cat.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: catPct >= 85 ? '#00D166' : catPct >= 70 ? '#FFD700' : '#FF4455' }}>
                    {catScore}/{catPossible} ({catPct}%)
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{isExpanded ? '▾' : '▸'}</span>
                </div>
                {isExpanded && catItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setActiveItem(activeItem?.id === item.id ? null : item)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px 10px 28px',
                      cursor: 'pointer', borderLeft: `3px solid ${RESULT_COLORS[item.result] || '#555'}`,
                      marginLeft: 12, background: activeItem?.id === item.id ? 'rgba(232,0,45,0.06)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0, background: `${RESULT_COLORS[item.result]}22`, color: RESULT_COLORS[item.result], border: `1px solid ${RESULT_COLORS[item.result]}44` }}>
                      {item.result === 'pass' ? 'P' : item.result === 'fail' ? 'F' : '~'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{item.question_text}</div>
                      {item.evidence_text && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          "{item.evidence_text.slice(0, 120)}"
                        </div>
                      )}
                      {item.confidence > 0 && (
                        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: item.confidence >= 0.85 ? '#00D166' : item.confidence >= 0.70 ? '#FFD700' : '#FF4455', marginTop: 2, display: 'inline-block' }}>
                          conf: {(item.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {item.points_earned}/{item.points_possible}
                    </div>
                    {item.is_auto_fail && item.auto_fail_triggered && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#FF4455', background: 'rgba(255,68,85,0.12)', padding: '2px 6px', borderRadius: 4 }}>AUTO-FAIL</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Right Panel: Audio Player + Override Form */}
        <div style={{ overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Audio Player */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', marginBottom: 10 }}>
              Call Recording
            </div>
            {callRecord?.recording_url ? (
              <audio ref={audioRef} controls style={{ width: '100%', height: 40 }} src={callRecord.recording_url} />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 0' }}>
                No recording URL available. Upload the recording to listen while reviewing.
              </div>
            )}
            {activeItem?.evidence_timestamp_ms != null && (
              <button
                onClick={() => seekToTimestamp(activeItem.evidence_timestamp_ms)}
                style={{ marginTop: 8, background: 'rgba(232,0,45,0.1)', border: '1px solid rgba(232,0,45,0.25)', color: '#E8002D', padding: '4px 12px', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                Jump to {Math.floor(activeItem.evidence_timestamp_ms / 1000)}s
              </button>
            )}
          </div>

          {/* Selected Item Detail / Override */}
          {activeItem ? (
            <OverrideForm
              item={activeItem}
              scorecardId={scorecardId}
              calibrationRunId={calibrationRunId}
              onSubmit={handleOverrideSubmit}
              onCancel={() => setActiveItem(null)}
            />
          ) : (
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '24px 20px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Click a scorecard item on the left to review and override.
              </div>
            </div>
          )}

          {/* Coaching Notes */}
          {scorecard?.coaching_notes?.length > 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', marginBottom: 10 }}>
                Auto-Generated Coaching Notes
              </div>
              {scorecard.coaching_notes.map((note, i) => (
                <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '6px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  {note}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default SpotCheckView;
