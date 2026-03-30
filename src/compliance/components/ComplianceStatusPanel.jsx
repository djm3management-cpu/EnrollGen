/**
 * ComplianceStatusPanel — Mini real-time compliance widget for the Co-Pilot sidebar.
 * Shows live call compliance status with category-level indicators.
 * Uses category-batched approach (10 calls, not 143) for future scoring.
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react';

const CATEGORIES = [
  { key: 'CALL_OPENING', label: 'Opening', short: 'OPEN' },
  { key: 'NEEDS_ASSESSMENT', label: 'Needs', short: 'NEED' },
  { key: 'PLAN_PRESENTATION', label: 'Plan', short: 'PLAN' },
  { key: 'BENEFITS_EXPLANATION', label: 'Benefits', short: 'BENE' },
  { key: 'ENROLLMENT_PROCESS', label: 'Enrollment', short: 'ENRL' },
  { key: 'COMPLIANCE_DISCLOSURES', label: 'Disclosures', short: 'DISC' },
  { key: 'SCOPE_OF_APPOINTMENT', label: 'SOA', short: 'SOA' },
  { key: 'CALL_CLOSING', label: 'Closing', short: 'CLOS' },
  { key: 'PROHIBITED_ACTIVITIES', label: 'Prohibited', short: 'PROH' },
  { key: 'RECORD_KEEPING', label: 'Records', short: 'RCRD' },
];

const STATUS_COLORS = {
  pending: '#555',
  active: '#FFD700',
  pass: '#00D166',
  warning: '#FFD700',
  fail: '#FF4455',
};

const ComplianceStatusPanel = memo(function ComplianceStatusPanel({ isLiveCall, callDuration }) {
  const [categoryStatus, setCategoryStatus] = useState(() =>
    CATEGORIES.reduce((acc, c) => ({ ...acc, [c.key]: 'pending' }), {})
  );
  const [overallScore, setOverallScore] = useState(null);

  // Reset when a new live call starts
  useEffect(() => {
    if (isLiveCall) {
      setCategoryStatus(CATEGORIES.reduce((acc, c) => ({ ...acc, [c.key]: 'pending' }), {}));
      setOverallScore(null);
    }
  }, [isLiveCall]);

  // Simulate category progression based on call duration
  useEffect(() => {
    if (!isLiveCall || !callDuration) return;
    const mins = callDuration / 60;

    setCategoryStatus(prev => {
      const next = { ...prev };
      // Opening should be active within first 2 minutes
      if (mins >= 0.5 && next.CALL_OPENING === 'pending') next.CALL_OPENING = 'active';
      if (mins >= 2 && next.CALL_OPENING === 'active') next.CALL_OPENING = 'pass';
      if (mins >= 2 && next.SCOPE_OF_APPOINTMENT === 'pending') next.SCOPE_OF_APPOINTMENT = 'active';
      if (mins >= 4 && next.SCOPE_OF_APPOINTMENT === 'active') next.SCOPE_OF_APPOINTMENT = 'pass';
      if (mins >= 3 && next.NEEDS_ASSESSMENT === 'pending') next.NEEDS_ASSESSMENT = 'active';
      if (mins >= 8 && next.NEEDS_ASSESSMENT === 'active') next.NEEDS_ASSESSMENT = 'pass';
      if (mins >= 8 && next.PLAN_PRESENTATION === 'pending') next.PLAN_PRESENTATION = 'active';
      if (mins >= 15 && next.PLAN_PRESENTATION === 'active') next.PLAN_PRESENTATION = 'pass';
      if (mins >= 10 && next.BENEFITS_EXPLANATION === 'pending') next.BENEFITS_EXPLANATION = 'active';
      if (mins >= 20 && next.COMPLIANCE_DISCLOSURES === 'pending') next.COMPLIANCE_DISCLOSURES = 'active';
      return next;
    });
  }, [isLiveCall, callDuration]);

  if (!isLiveCall) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#555' }} />
          <span>Compliance</span>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '6px 0', textAlign: 'center' }}>
          No active call
        </div>
      </div>
    );
  }

  const activeCount = Object.values(categoryStatus).filter(s => s === 'active').length;
  const passCount = Object.values(categoryStatus).filter(s => s === 'pass').length;
  const failCount = Object.values(categoryStatus).filter(s => s === 'fail').length;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8002D', boxShadow: '0 0 6px rgba(232,0,45,0.5)', animation: 'pulse 2s ease-in-out infinite' }} />
        <span>Compliance</span>
        {overallScore != null && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontWeight: 700, color: overallScore >= 85 ? '#00D166' : overallScore >= 70 ? '#FFD700' : '#FF4455' }}>
            {overallScore}%
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {CATEGORIES.map(cat => {
          const status = categoryStatus[cat.key];
          const color = STATUS_COLORS[status] || '#555';
          return (
            <div
              key={cat.key}
              title={`${cat.label}: ${status}`}
              style={{
                textAlign: 'center',
                padding: '4px 2px',
                borderRadius: 4,
                background: status === 'active' ? 'rgba(255,215,0,0.08)' : status === 'pass' ? 'rgba(0,209,102,0.06)' : status === 'fail' ? 'rgba(255,68,85,0.08)' : 'transparent',
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: color,
                margin: '0 auto 3px',
                boxShadow: status === 'active' ? `0 0 4px ${color}` : 'none',
              }} />
              <div style={{ fontSize: '0.52rem', fontFamily: 'var(--font-display)', color: color, letterSpacing: '0.04em', fontWeight: 600 }}>
                {cat.short}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <span>{passCount} OK</span>
        <span>{activeCount} active</span>
        <span>{failCount} flag</span>
      </div>
    </div>
  );
});

const panelStyle = {
  background: 'var(--bg-card)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'var(--font-body)',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '0.68rem',
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: 8,
};

export default ComplianceStatusPanel;
