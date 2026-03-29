/**
 * CalibrationDashboard — Calibration status, confidence triage, and spot-check queue.
 * F1 pit wall dark theme with inline styles.
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchWithClerk } from '../../lib/clerkFetch.js';
import SpotCheckView from './SpotCheckView.jsx';
import BatchImport from './BatchImport.jsx';

const API = '/.netlify/functions/compliance';

const TIER_COLORS = {
  high: '#00D166',
  medium: '#FFD700',
  low: '#FF4455',
};

const CalibrationDashboard = memo(function CalibrationDashboard() {
  const { getToken } = useAuth();
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState(null);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'spotcheck'

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetchWithClerk(getToken, `${API}/calibration/runs`);
      if (res.ok) {
        const data = await res.json();
        setRuns(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [getToken]);

  const loadReport = useCallback(async (runId) => {
    if (!runId) return;
    setLoading(true);
    try {
      const res = await fetchWithClerk(getToken, `${API}/calibration/${runId}`);
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => { if (activeRun) loadReport(activeRun); }, [activeRun, loadReport]);

  const openSpotCheck = (call) => {
    setSelectedCall(call);
    setView('spotcheck');
  };

  if (view === 'spotcheck' && selectedCall) {
    return (
      <SpotCheckView
        callId={selectedCall.call_id}
        scorecardId={selectedCall.scorecard_id}
        calibrationRunId={activeRun}
        onBack={() => { setView('dashboard'); setSelectedCall(null); loadReport(activeRun); }}
      />
    );
  }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8002D', boxShadow: '0 0 8px rgba(232,0,45,0.5)' }} />
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
          Calibration Mode
        </h1>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          COMPLIANCE ENGINE v1
        </span>
      </div>

      {loading && !report && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Loading...</div>
      )}

      {report && (
        <>
          {/* Status Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            <StatCard label="Total Calls" value={report.totalScored || report.run?.total_calls || 0} />
            <StatCard label="High Confidence" value={report.run?.high_confidence_count || 0} color={TIER_COLORS.high}
              sub={`${report.run?.high_confidence_count && report.run?.total_calls ? Math.round((report.run.high_confidence_count / report.run.total_calls) * 100) : 0}%`} />
            <StatCard label="Medium Confidence" value={report.run?.medium_confidence_count || 0} color={TIER_COLORS.medium}
              sub={`${report.run?.medium_confidence_count && report.run?.total_calls ? Math.round((report.run.medium_confidence_count / report.run.total_calls) * 100) : 0}%`} />
            <StatCard label="Low Confidence" value={report.run?.low_confidence_count || 0} color={TIER_COLORS.low}
              sub={`${report.run?.low_confidence_count && report.run?.total_calls ? Math.round((report.run.low_confidence_count / report.run.total_calls) * 100) : 0}% — spot-check required`} />
          </div>

          {/* Overrides & Accuracy */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>Spot-Check Progress</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: '#E8002D' }}>
                  {report.overridesCount || 0}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  overrides submitted / {report.run?.spot_checks_required || 0} required
                </span>
              </div>
              {report.run?.accuracy_after != null && (
                <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Accuracy: <span style={{ color: TIER_COLORS.high, fontWeight: 600 }}>{report.run.accuracy_after}%</span>
                  {report.run.accuracy_before != null && (
                    <span> (was {report.run.accuracy_before}%)</span>
                  )}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={cardHeaderStyle}>Score Distribution</div>
              <ScoreDistribution scorecards={report.scorecards || []} />
            </div>
          </div>

          {/* Top Calls for Spot-Check */}
          <div style={{ ...cardStyle, marginBottom: 28 }}>
            <div style={cardHeaderStyle}>Top Calls for Spot-Check</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>File</th>
                    <th style={thStyle}>Agent</th>
                    <th style={thStyle}>Score</th>
                    <th style={thStyle}>Grade</th>
                    <th style={thStyle}>Confidence</th>
                    <th style={thStyle}>Auto-Fail</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {(report.topCallsForReview || []).map((call, i) => (
                    <tr key={call.call_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{call.filename || '—'}</td>
                      <td style={tdStyle}>{call.agent_name}</td>
                      <td style={{ ...tdStyle, color: scoreColor(call.overall_score), fontWeight: 600 }}>
                        {call.overall_score?.toFixed(1)}%
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{call.overall_grade}</td>
                      <td style={{ ...tdStyle, color: confColor(call.avg_confidence) }}>
                        {(call.avg_confidence * 100).toFixed(0)}%
                      </td>
                      <td style={tdStyle}>
                        {call.auto_fail_triggered
                          ? <span style={{ color: '#FF4455', fontWeight: 600 }}>YES</span>
                          : <span style={{ color: 'var(--text-muted)' }}>No</span>}
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => openSpotCheck(call)} style={spotCheckBtnStyle}>
                          Spot-Check
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weakest Intents */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>Weakest Intents (Lowest Average Confidence)</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(report.weakestIntents || []).slice(0, 10).map((intent, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderRadius: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 200 }}>
                    {intent.intent_code || '—'}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{intent.question}</span>
                  <ConfidenceBar value={intent.avg_confidence} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: confColor(intent.avg_confidence), minWidth: 50, textAlign: 'right' }}>
                    {(intent.avg_confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Batch Import (always visible) */}
      <div style={{ marginBottom: 28 }}>
        <BatchImport onComplete={(runId) => { setActiveRun(runId); loadReport(runId); }} />
      </div>

      {!loading && !report && runs.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Import recordings above to start your first calibration run.
        </div>
      )}
    </div>
  );
});

function StatCard({ label, value, color, sub }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: '2.2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: color || 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: confColor(value), transition: 'width 0.3s ease' }} />
    </div>
  );
}

function ScoreDistribution({ scorecards }) {
  const buckets = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
  for (const sc of scorecards) {
    const g = (sc.overall_grade || 'F')[0];
    buckets[g] = (buckets[g] || 0) + 1;
  }
  const max = Math.max(...Object.values(buckets), 1);
  const colors = { A: '#00D166', B: '#00D166', C: '#FFD700', D: '#FF8C00', F: '#FF4455' };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 60, marginTop: 8 }}>
      {Object.entries(buckets).map(([grade, count]) => (
        <div key={grade} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{ height: Math.max(4, (count / max) * 50), width: '100%', background: colors[grade] || '#555', borderRadius: '3px 3px 0 0', transition: 'height 0.3s ease' }} />
          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>{grade}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

function scoreColor(s) {
  if (s >= 90) return '#00D166';
  if (s >= 80) return '#00D166';
  if (s >= 70) return '#FFD700';
  return '#FF4455';
}

function confColor(c) {
  if (c >= 0.85) return '#00D166';
  if (c >= 0.70) return '#FFD700';
  return '#FF4455';
}

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '18px 20px',
  boxShadow: 'var(--shadow-float)',
};

const cardHeaderStyle = {
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-display)',
  marginBottom: 14,
  paddingBottom: 10,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
};

const tdStyle = {
  padding: '10px 10px',
  color: 'var(--text-secondary)',
};

const spotCheckBtnStyle = {
  background: 'rgba(232,0,45,0.12)',
  border: '1px solid rgba(232,0,45,0.3)',
  color: '#E8002D',
  padding: '5px 12px',
  borderRadius: 6,
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  transition: 'all 0.15s ease',
};

export default CalibrationDashboard;
