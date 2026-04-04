/**
 * AgentProfiles — Per-agent compliance breakdown.
 * Rolling average, top deficiencies, call count.
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { fetchWithClerk } from '../../lib/clerkFetch.js';

const API = '/.netlify/functions/compliance';

const AgentProfiles = memo(function AgentProfiles() {
  const { getToken } = useAppAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithClerk(getToken, `${API}/agents`);
      if (res.ok) setAgents(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading agent profiles...</div>;
  }

  if (agents.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No agent data available yet.</div>;
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Agent Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 28 }}>
        {agents.map(agent => (
          <AgentCard
            key={agent.agent_name}
            agent={agent}
            isSelected={selectedAgent === agent.agent_name}
            onSelect={() => setSelectedAgent(selectedAgent === agent.agent_name ? null : agent.agent_name)}
          />
        ))}
      </div>

      {/* Expanded Detail */}
      {selectedAgent && (
        <AgentDetail agent={agents.find(a => a.agent_name === selectedAgent)} />
      )}
    </div>
  );
});

function AgentCard({ agent, isSelected, onSelect }) {
  const scoreColor = agent.avg_score >= 90 ? '#00D166' : agent.avg_score >= 70 ? '#FFD700' : '#FF4455';

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isSelected ? 'rgba(232,0,45,0.3)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 12,
        padding: '20px 22px',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, transform 0.1s ease',
        boxShadow: 'var(--shadow-float)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(232,0,45,0.15), rgba(232,0,45,0.05))`,
          border: '1px solid rgba(232,0,45,0.2)',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: '#E8002D',
        }}>
          {agent.agent_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary)' }}>
            {agent.agent_name}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {agent.call_count} call{agent.call_count !== 1 ? 's' : ''} scored
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: scoreColor, lineHeight: 1 }}>
            {agent.avg_score.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <MiniStat label="Pass Rate" value={`${agent.pass_rate}%`} color={agent.pass_rate >= 80 ? '#00D166' : agent.pass_rate >= 60 ? '#FFD700' : '#FF4455'} />
        <MiniStat label="Auto-Fails" value={agent.auto_fail_count} color={agent.auto_fail_count === 0 ? '#00D166' : '#FF4455'} />
        <MiniStat label="Calls" value={agent.call_count} color="var(--text-primary)" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display)', color }}>
        {value}
      </div>
    </div>
  );
}

function AgentDetail({ agent }) {
  if (!agent) return null;

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>{agent.agent_name} — Deficiency Breakdown</div>

      {agent.top_failing_categories?.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {agent.top_failing_categories.map(cat => (
            <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: 200 }}>
                {cat.category.replace(/_/g, ' ')}
              </span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${cat.pct}%`, height: '100%', borderRadius: 4, background: barColor(cat.pct), transition: 'width 0.4s ease' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: barColor(cat.pct), minWidth: 45, textAlign: 'right' }}>
                {cat.pct}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No category data available</div>
      )}
    </div>
  );
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

export default AgentProfiles;
