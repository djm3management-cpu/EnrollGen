/**
 * ComplianceOverview — Dashboard tab showing agency-wide stats,
 * category breakdown, risk distribution, and recalculate button.
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchWithClerk } from '../../lib/clerkFetch.js';

const API = '/.netlify/functions/compliance';

const ComplianceOverview = memo(function ComplianceOverview() {
  const { getToken } = useAuth();
  const [data, setData] = useState(null);
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, scRes] = await Promise.all([
        fetchWithClerk(getToken, `${API}/dashboard/overview?days=90`),
        fetchWithClerk(getToken, `${API}/scorecards?limit=10`),
      ]);
      if (dashRes.ok) setData(await dashRes.json());
      if (scRes.ok) setScorecards(await scRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setRecalcResult(null);
    try {
      const res = await fetchWithClerk(getToken, `${API}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      setRecalcResult(result);
      // Refresh dashboard after recalc
      await load();
    } catch (err) {
      setRecalcResult({ error: err.message });
    }
    setRecalculating(false);
  };

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading dashboard...</div>;
  }

  const d = data || {};
  const categories = Object.entries(d.category_breakdown || {}).sort((a, b) => a[1].pct - b[1].pct);
  const risk = d.risk_distribution || {};

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard label="Total Calls" value={d.total_calls || 0} />
        <StatCard label="Avg Score" value={`${(d.avg_score || 0).toFixed(1)}%`} color={scoreColor(d.avg_score || 0)} />
        <StatCard label="Pass Rate" value={`${d.pass_rate || 0}%`} color={d.pass_rate >= 80 ? '#00D166' : d.pass_rate >= 60 ? '#FFD700' : '#FF4455'} />
        <StatCard label="Auto-Fail Rate" value={`${d.auto_fail_rate || 0}%`} color={d.auto_fail_rate <= 10 ? '#00D166' : d.auto_fail_rate <= 25 ? '#FFD700' : '#FF4455'} />
      </div>

      {/* Category Breakdown + Risk Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 28 }}>
        {/* Category Bars */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>Category Breakdown</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {categories.map(([cat, scores]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 180, fontFamily: 'var(--font-body)' }}>
                  {cat.replace(/_/g, ' ')}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${scores.pct}%`, height: '100%', borderRadius: 4, background: barColor(scores.pct), transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: barColor(scores.pct), minWidth: 45, textAlign: 'right' }}>
                  {scores.pct}%
                </span>
              </div>
            ))}
            {categories.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: 10 }}>No category data available</div>
            )}
          </div>
        </div>

        {/* Risk Distribution */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>Risk Distribution</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { key: 'low', label: 'Low', color: '#00D166' },
              { key: 'medium', label: 'Medium', color: '#FFD700' },
              { key: 'high', label: 'High', color: '#FF8C00' },
              { key: 'critical', label: 'Critical', color: '#FF4455' },
            ].map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.label}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, color: r.color }}>
                  {risk[r.key] || 0}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
              Open Corrective Actions
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, color: d.open_corrective_actions > 0 ? '#FF4455' : '#00D166' }}>
              {d.open_corrective_actions || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Scorecards */}
      <div style={{ ...cardStyle, marginBottom: 28 }}>
        <div style={cardHeaderStyle}>Recent Scorecards</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Grade</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Direction</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map(sc => {
                const callRec = sc.call_records || {};
                return (
                  <tr key={sc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={tdStyle}>{callRec.agent_name || 'Unknown'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {sc.created_at ? new Date(sc.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: scoreColor(sc.overall_score), fontWeight: 600 }}>
                      {sc.overall_score?.toFixed(1)}%
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{sc.overall_grade}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                        background: sc.pass_fail === 'PASS' ? 'rgba(0,209,102,0.12)' : sc.pass_fail === 'INSUFFICIENT' ? 'rgba(255,255,255,0.06)' : 'rgba(255,68,85,0.12)',
                        color: sc.pass_fail === 'PASS' ? '#00D166' : sc.pass_fail === 'INSUFFICIENT' ? 'var(--text-muted)' : '#FF4455',
                      }}>
                        {sc.pass_fail}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                        background: sc.risk_level === 'low' ? '#00D166' : sc.risk_level === 'medium' ? '#FFD700' : sc.risk_level === 'high' ? '#FF8C00' : '#FF4455',
                        marginRight: 6,
                      }} />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{sc.risk_level}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem' }}>{callRec.call_direction || '—'}</td>
                  </tr>
                );
              })}
              {scorecards.length === 0 && (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No scorecards yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recalculate Button */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>Retroactive Recalculation</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Re-run inbound/outbound detection and short-call filtering on all existing scorecards. No new API calls — just reclassifies direction, marks outbound-only intents as N/A, and recalculates percentages.
        </p>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          style={{
            background: recalculating ? 'rgba(232,0,45,0.06)' : 'rgba(232,0,45,0.12)',
            border: '1px solid rgba(232,0,45,0.3)',
            color: '#E8002D',
            padding: '10px 24px',
            borderRadius: 8,
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: recalculating ? 'wait' : 'pointer',
            fontFamily: 'var(--font-body)',
            opacity: recalculating ? 0.6 : 1,
          }}
        >
          {recalculating ? 'Recalculating...' : 'Recalculate All Scores'}
        </button>

        {recalcResult && !recalcResult.error && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(0,209,102,0.08)', borderRadius: 8, border: '1px solid rgba(0,209,102,0.2)' }}>
            <div style={{ fontSize: '0.82rem', color: '#00D166', fontWeight: 600, marginBottom: 6 }}>
              Recalculated {recalcResult.recalculated} calls
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxHeight: 200, overflow: 'auto' }}>
              {(recalcResult.results || []).map((r, i) => (
                <div key={i} style={{ padding: '3px 0' }}>
                  {r.short ? `Short call — INSUFFICIENT` : r.skipped ? `Skipped (${r.reason})` : `${r.direction} — ${r.score}% (${r.grade})`}
                  {r.auto_fail ? ' [AUTO-FAIL]' : ''}
                </div>
              ))}
            </div>
          </div>
        )}
        {recalcResult?.error && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(255,68,85,0.08)', borderRadius: 8, border: '1px solid rgba(255,68,85,0.2)', fontSize: '0.82rem', color: '#FF4455' }}>
            Error: {recalcResult.error}
          </div>
        )}
      </div>
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

function scoreColor(s) {
  if (s >= 90) return '#00D166';
  if (s >= 80) return '#00D166';
  if (s >= 70) return '#FFD700';
  return '#FF4455';
}

function barColor(pct) {
  if (pct >= 85) return '#00D166';
  if (pct >= 70) return '#FFD700';
  if (pct >= 50) return '#FF8C00';
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

export default ComplianceOverview;
