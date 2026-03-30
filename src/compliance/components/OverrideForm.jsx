/**
 * OverrideForm — Confirm, override, or annotate a scorecard item during spot-check.
 * Three actions: CONFIRM (AI got it right), OVERRIDE (flip result), NOTE (add context).
 */

import { memo, useState, useCallback } from 'react';

const RESULT_OPTIONS = [
  { value: 'pass', label: 'Pass', color: '#00D166' },
  { value: 'fail', label: 'Fail', color: '#FF4455' },
  { value: 'partial', label: 'Partial', color: '#FFD700' },
  { value: 'na', label: 'N/A', color: '#555' },
];

const OverrideForm = memo(function OverrideForm({ item, scorecardId, calibrationRunId, onSubmit, onCancel }) {
  const [action, setAction] = useState(null); // 'confirm' | 'override' | 'note'
  const [newResult, setNewResult] = useState(item.result === 'pass' ? 'fail' : 'pass');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    const override = {
      call_id: item.call_id,
      scorecard_id: scorecardId,
      scorecard_item_id: item.id,
      intent_code: item.intent_code || '',
      ai_result: item.result,
      human_result: action === 'override' ? newResult : item.result,
      ai_confidence: item.confidence,
      override_reason: action === 'confirm'
        ? 'Confirmed: AI scored correctly'
        : action === 'note'
          ? `Note: ${reason}`
          : `Override ${item.result} -> ${newResult}: ${reason}`,
      transcript_segment: item.evidence_text || '',
    };
    await onSubmit(override);
    setSubmitting(false);
    setAction(null);
    setReason('');
  }, [action, newResult, reason, item, scorecardId, onSubmit]);

  const resultColor = {
    pass: '#00D166',
    fail: '#FF4455',
    partial: '#FFD700',
    na: '#555',
    not_applicable: '#555',
  };

  const resultLabel = item.result === 'na' || item.result === 'not_applicable'
    ? 'N/A'
    : item.result.toUpperCase();

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        Review Item
      </div>

      {/* Item Summary */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>
          {item.question_text}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem' }}>
            AI Result: <span style={{ fontWeight: 700, color: resultColor[item.result] || '#555' }}>{resultLabel}</span>
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Confidence: <span style={{ fontFamily: 'var(--font-mono)' }}>{((item.confidence || 0) * 100).toFixed(0)}%</span>
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Points: <span style={{ fontFamily: 'var(--font-mono)' }}>{item.points_earned}/{item.points_possible}</span>
          </span>
          {item.is_auto_fail && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#FF4455', background: 'rgba(255,68,85,0.1)', padding: '2px 8px', borderRadius: 4 }}>
              AUTO-FAIL ITEM
            </span>
          )}
        </div>
        {item.evidence_text && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
            "{item.evidence_text}"
          </div>
        )}
        {item.notes && (
          <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            AI reasoning: {item.notes}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!action && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <ActionButton
            label="Confirm"
            sub="AI got it right"
            color="#00D166"
            onClick={() => setAction('confirm')}
          />
          <ActionButton
            label="Override"
            sub="AI got it wrong"
            color="#FF4455"
            onClick={() => setAction('override')}
          />
          <ActionButton
            label="Note"
            sub="Add context"
            color="#FFD700"
            onClick={() => setAction('note')}
          />
        </div>
      )}

      {/* Confirm */}
      {action === 'confirm' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.85rem', color: '#00D166', fontWeight: 600, marginBottom: 10 }}>
            Confirming AI scored this correctly as {resultLabel}.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSubmit} disabled={submitting} style={submitBtnStyle('#00D166')}>
              {submitting ? 'Saving...' : 'Confirm'}
            </button>
            <button onClick={() => setAction(null)} style={cancelBtnStyle}>Cancel</button>
          </div>
        </div>
      )}

      {/* Override */}
      {action === 'override' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.85rem', color: '#FF4455', fontWeight: 600, marginBottom: 10 }}>
            What should the correct result be?
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {RESULT_OPTIONS.filter(o => o.value !== item.result).map(opt => (
              <button
                key={opt.value}
                onClick={() => setNewResult(opt.value)}
                style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  background: newResult === opt.value ? `${opt.color}22` : 'var(--bg-input)',
                  border: `1px solid ${newResult === opt.value ? opt.color : 'rgba(255,255,255,0.08)'}`,
                  color: newResult === opt.value ? opt.color : 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is the AI wrong? (e.g., 'Agent did say this at 2:15 but AI missed it')"
            style={textareaStyle}
            rows={3}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={handleSubmit} disabled={submitting || !reason.trim()} style={submitBtnStyle('#FF4455')}>
              {submitting ? 'Saving...' : `Override to ${newResult.toUpperCase()}`}
            </button>
            <button onClick={() => { setAction(null); setReason(''); }} style={cancelBtnStyle}>Cancel</button>
          </div>
        </div>
      )}

      {/* Note */}
      {action === 'note' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.85rem', color: '#FFD700', fontWeight: 600, marginBottom: 10 }}>
            Add context the AI could not know:
          </div>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Additional context, observations, or notes..."
            style={textareaStyle}
            rows={3}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={handleSubmit} disabled={submitting || !reason.trim()} style={submitBtnStyle('#FFD700')}>
              {submitting ? 'Saving...' : 'Save Note'}
            </button>
            <button onClick={() => { setAction(null); setReason(''); }} style={cancelBtnStyle}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
});

function ActionButton({ label, sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
        background: `${color}08`, border: `1px solid ${color}33`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transition: 'all 0.15s ease', fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}15`; e.currentTarget.style.borderColor = `${color}55`; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}08`; e.currentTarget.style.borderColor = `${color}33`; }}
    >
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{label}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</span>
    </button>
  );
}

const textareaStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  fontFamily: 'var(--font-body)',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

function submitBtnStyle(color) {
  return {
    padding: '8px 20px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: '0.82rem',
    cursor: 'pointer',
    background: `${color}18`,
    border: `1px solid ${color}44`,
    color,
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s ease',
  };
}

const cancelBtnStyle = {
  padding: '8px 20px',
  borderRadius: 8,
  fontSize: '0.82rem',
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
};

export default OverrideForm;
