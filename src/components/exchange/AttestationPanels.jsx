import { useCallback, useEffect, useState } from 'react';
import { useExchangeRead, useExchangeWrite, resultLine, errorLine, emptyLine } from './exchangeUi.jsx';
import { fmtDate } from './exchangeFormat.js';

const TONES = { current: 'ok', expired: 'warn', missing: 'warn' };
const LABELS = { current: 'Attested', expired: 'Expired', missing: 'Missing' };
export const attestationBadge = status => <span className={`exchange-badge is-${TONES[status] || 'muted'}`}>{LABELS[status] || 'Unknown'}</span>;

/** Buyer view: attestation status and expiry of the publishers that reach this tenant. */
export function SourcesPanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const [data, setData] = useState(null);
  useEffect(() => { let live = true; read('buyer', 'sources', {}).then(body => { if (live && body) setData(body); }); return () => { live = false; }; }, [read]);
  if (!data) return errorLine(error) || emptyLine('Loading');
  return <div className="exchange-panel">
    {data.sources.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Source</th><th>Attestation</th><th>Expires</th></tr></thead>
      <tbody>{data.sources.map(s => <tr key={s.source_id}><td>{s.name}</td><td>{attestationBadge(s.status)}</td><td>{fmtDate(s.expires_at, context.timezone)}</td></tr>)}</tbody>
    </table></div> : emptyLine('No sources')}
    <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Campaign</th><th>Requires attestations</th></tr></thead>
      <tbody>{data.campaigns.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.require_source_attestations ? 'Yes' : 'No'}</td></tr>)}</tbody>
    </table></div>
  </div>;
}

const blank = { onshore_operation: false, no_resale: false, consent_language_reviewed: false, attestation_document_ref: '', expires_at: '' };

/** Operator view: record publisher attestations and set each campaign's requirement. */
export function AttestationsPanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write } = useExchangeWrite(getToken);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blank);
  const load = useCallback(() => read('operator', 'source_attestations', {}).then(body => { if (body) setData(body); }), [read]);
  useEffect(() => { void load(); }, [load]);
  const open = source => {
    setEditing(source.source_id);
    setDraft({ onshore_operation: source.onshore_operation === true, no_resale: source.no_resale === true,
      consent_language_reviewed: source.consent_language_reviewed === true, attestation_document_ref: source.attestation_document_ref || '',
      expires_at: source.expires_at ? source.expires_at.slice(0, 10) : '' });
  };
  const save = async () => {
    const body = await write('operator', 'source_attestation', { source_id: editing, ...draft,
      attestation_document_ref: draft.attestation_document_ref.trim() || null, expires_at: draft.expires_at }, 'Saved');
    if (body) { setEditing(null); await load(); }
  };
  const setRequired = async (campaign, value) => {
    if (await write('operator', 'campaign_attestations', { campaign_id: campaign.id, require_source_attestations: value }, 'Saved')) await load();
  };
  if (!data) return errorLine(error) || emptyLine('Loading');
  return <div className="exchange-panel">
    {resultLine(result)}
    <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Source</th><th>Attestation</th><th>Onshore</th><th>No resale</th><th>Consent reviewed</th><th>Document</th><th>Expires</th><th /></tr></thead>
      <tbody>{data.sources.map(s => [<tr key={s.source_id}>
        <td>{s.name}</td><td>{attestationBadge(s.status)}</td><td>{s.onshore_operation ? 'Yes' : 'No'}</td><td>{s.no_resale ? 'Yes' : 'No'}</td>
        <td>{s.consent_language_reviewed ? 'Yes' : 'No'}</td><td>{s.attestation_document_ref || ''}</td><td>{fmtDate(s.expires_at, context.timezone)}</td>
        <td className="exchange-actions"><button type="button" data-key-role="secondary" className="eg-key" onClick={() => open(s)}>Edit</button></td>
      </tr>, editing === s.source_id && <tr key={`${s.source_id}-edit`} className="exchange-edit-row"><td colSpan={8}>
        <div className="exchange-form">
          {['onshore_operation', 'no_resale', 'consent_language_reviewed'].map(field => <label key={field}>
            <input type="checkbox" checked={draft[field]} onChange={event => setDraft(d => ({ ...d, [field]: event.target.checked }))} />
            {{ onshore_operation: 'Onshore', no_resale: 'No resale', consent_language_reviewed: 'Consent reviewed' }[field]}</label>)}
          <label>Document <input value={draft.attestation_document_ref} maxLength={200} onChange={event => setDraft(d => ({ ...d, attestation_document_ref: event.target.value }))} /></label>
          <label>Expires <input type="date" value={draft.expires_at} onChange={event => setDraft(d => ({ ...d, expires_at: event.target.value }))} /></label>
          <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy || !draft.expires_at} onClick={save}>Save</button>
          <button type="button" data-key-role="secondary" className="eg-key" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </td></tr>])}</tbody>
    </table></div>
    <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Campaign</th><th>Requires attestations</th></tr></thead>
      <tbody>{data.campaigns.map(c => <tr key={c.id}><td>{c.name}</td><td><label className="exchange-form">
        <input type="checkbox" aria-label={`Require attestations for ${c.name}`} checked={c.require_source_attestations === true} disabled={busy}
          onChange={event => setRequired(c, event.target.checked)} /></label></td></tr>)}</tbody>
    </table></div>
  </div>;
}
