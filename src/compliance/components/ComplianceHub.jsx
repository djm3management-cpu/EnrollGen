/**
 * ComplianceHub — Main container with 4 sub-tabs:
 * Dashboard, Scorecards, Calibration, Agent Profiles.
 * F1 pit wall dark theme with inline styles.
 */

import { memo, useState, lazy, Suspense } from 'react';

const ComplianceOverview = lazy(() => import('./ComplianceOverview.jsx'));
const ScorecardList = lazy(() => import('./ScorecardList.jsx'));
const CalibrationDashboard = lazy(() => import('./CalibrationDashboard.jsx'));
const AgentProfiles = lazy(() => import('./AgentProfiles.jsx'));

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scorecards', label: 'Scorecards' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'agents', label: 'Agent Profiles' },
];

const ComplianceHub = memo(function ComplianceHub() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8002D', boxShadow: '0 0 8px rgba(232,0,45,0.5)' }} />
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
          Compliance Hub
        </h1>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          COMPLIANCE ENGINE v1
        </span>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, padding: '16px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 22px',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: '0.82rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: activeTab === tab.id ? '#E8002D' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid #E8002D' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}>
        {activeTab === 'dashboard' && <ComplianceOverview />}
        {activeTab === 'scorecards' && <ScorecardList />}
        {activeTab === 'calibration' && <CalibrationDashboard />}
        {activeTab === 'agents' && <AgentProfiles />}
      </Suspense>
    </div>
  );
});

export default ComplianceHub;
