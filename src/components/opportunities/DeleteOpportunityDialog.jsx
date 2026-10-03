import { useState } from 'react';
import OpportunityDialog from './OpportunityDialog';

export default function DeleteOpportunityDialog({ row, data, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      await data.remove(row);
      onDeleted();
    } catch (err) { setError(err.message || 'Opportunity could not be deleted.'); }
    finally { setBusy(false); }
  };
  return <OpportunityDialog title="Delete Opportunity" busy={busy} onClose={onClose}>
    <div className="opps-delete-stage">
      <strong>Delete this opportunity?</strong>
      <dl className="opps-delete-details"><div><dt>Contact</dt><dd>{row.contact_name}</dd></div><div><dt>Title</dt><dd>{row.title}</dd></div></dl>
      <p>It will disappear from Opportunities. Its stage history will be retained.</p>
    </div>
    {error && <div className="ops-error" role="alert">{error}</div>}
    <div className="opps-actions">
      <button type="button" className="contacts-mini-btn opps-danger" disabled={busy} onClick={() => { void confirm(); }}>{busy ? 'DELETING…' : 'DELETE OPPORTUNITY'}</button>
      <button type="button" className="contacts-mini-btn" disabled={busy} onClick={onClose}>CANCEL</button>
    </div>
  </OpportunityDialog>;
}
