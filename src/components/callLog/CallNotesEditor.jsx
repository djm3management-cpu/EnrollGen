import { useEffect, useRef, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { fetchWithClerk } from '../../lib/clerkFetch.js';

export default function CallNotesEditor({ callRecordId, notes, loading, onSaved }) {
  const { getToken } = useAppAuth();
  const [draft, setDraft] = useState(notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const persisted = useRef(notes || '');
  useEffect(() => {
    if (!dirty.current) { setDraft(notes || ''); persisted.current = notes || ''; }
  }, [notes]);
  const save = async () => {
    if (!callRecordId || !dirty.current) return;
    if (draft === persisted.current) { dirty.current = false; return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetchWithClerk(getToken, `/api/call-record-details?call_record_id=${encodeURIComponent(callRecordId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_notes: draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save notes.');
      const value = result.record?.agent_notes || '';
      persisted.current = value; dirty.current = false; setDraft(value); setSaved(true); onSaved?.(value);
      window.dispatchEvent(new Event('crm-calls-updated'));
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return <>
    <textarea className="call-notes-input" aria-label="Call notes" rows={5} maxLength={10000} value={draft} disabled={!callRecordId || loading || saving} placeholder="Add notes about this call…" onChange={event => {
      dirty.current = true; setDraft(event.target.value); setSaved(false);
    }} onBlur={() => void save()} />
    <span className="call-notes-state contacts-muted" role="status">{saving ? 'Saving…' : saved ? 'Saved' : !callRecordId ? 'No call record linked' : 'Saves when you leave this field'}</span>
    {error && <div className="ops-error" role="alert">{error} <button type="button" className="contacts-mini-btn" onClick={() => void save()}>RETRY</button></div>}
  </>;
}
