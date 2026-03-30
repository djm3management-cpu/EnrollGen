/**
 * ScorecardList — Scorecards tab listing all scored calls.
 * Click any row to open the full ScorecardDetail viewer.
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchWithClerk } from '../../lib/clerkFetch.js';
import ScorecardDetail from './ScorecardDetail.jsx';

const API = '/.netlify/functions/compliance';

const ScorecardList = memo(function ScorecardList() {
  const { getToken } = useAuth();
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all'); // all | pass | fail | insufficient

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithClerk(getToken, `${API}/scorecards?limit=100`);
      if (res.ok) setScorecards(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  if (selectedId) {
    return (
      <ScorecardDetail
        scorecardId={selectedId}
        onBack={() => { setSelectedId(null); load(); }}
      />
    );
  }

  const filtered = scorecards.filter(sc => {
    if (filter === 'all') return true;
    if (filter === 'pass') return sc.pass_fail === 'PASS';
    if (filter === 'fail') return sc.pass_fail === 'FAIL';
    if (filter === 'insufficient') return sc.pass_fail === 'INSUFFICIENT';
    return true;
  });

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'pass', 'fail', 'insufficient'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'rgba(232,0,45,0.12)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(232,0,45,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? '#E8002D' : 'var(--text-muted)',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {f === 'all' ? `All (${scorecards.length})` : `${f} (${scorecards.filter(sc => f === 'pass' ? sc.pass_fail === 'PASS' : f === 'fail' ? sc.pass_fail === 'FAIL' : sc.pass_fail === 'INSUFFICIENT').length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading scorecards...</div>
      ) : (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Direction</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Grade</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Auto-Fail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sc => {
                const callRec = sc.call_records || {};
                return (
                  <tr
                    key={sc.id}
                    onClick={() => setSelectedId(sc.id)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,0,45,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {callRec.agent_name || 'Unknown'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {sc.created_at ? new Date(sc.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                        background: callRec.call_direction === 'outbound' ? 'rgba(168,85,247,0.12)' : 'rgba(0,209,102,0.08)',
                        color: callRec.call_direction === 'outbound' ? '#a855f7' : '#00D166',
                      }}>
                        {callRec.call_direction || 'inbound'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: scoreColor(sc.overall_score), fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                      {sc.pass_fail === 'INSUFFICIENT' ? '—' : `${sc.overall_score?.toFixed(1)}%`}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                      {sc.overall_grade}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                        background: sc.pass_fail === 'PASS' ? 'rgba(0,209,102,0.12)' : sc.pass_fail === 'INSUFFICIENT' ? 'rgba(255,255,255,0.06)' : 'rgba(255,68,85,0.12)',
                        color: sc.pass_fail === 'PASS' ? '#00D166' : sc.pass_fail === 'INSUFFICIENT' ? 'var(--text-muted)' : '#FF4455',
                      }}>
                        {sc.pass_fail}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                        background: riskColor(sc.risk_level),
                        marginRight: 6,
                      }} />
                      <span style={{ fontSize: '0.78rem' }}>{sc.risk_level}</span>
                    </td>
                    <td style={tdStyle}>
                      {sc.auto_fail_triggered
                        ? <span style={{ color: '#FF4455', fontWeight: 600, fontSize: '0.78rem' }}>YES</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>No scorecards match this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

function scoreColor(s) {
  if (s == null) return 'var(--text-muted)';
  if (s >= 90) return '#00D166';
  if (s >= 70) return '#FFD700';
  return '#FF4455';
}

function riskColor(level) {
  if (level === 'low') return '#00D166';
  if (level === 'medium') return '#FFD700';
  if (level === 'high') return '#FF8C00';
  return '#FF4455';
}

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '8px 0',
  boxShadow: 'var(--shadow-float)',
  overflowX: 'auto',
};

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
};

const tdStyle = {
  padding: '12px 12px',
  color: 'var(--text-secondary)',
};

export default ScorecardList;
