import { useEffect, useMemo, useRef, useState } from 'react';
import { useContactsList, useContactMutations, contactDisplayName } from '../../hooks/useContacts';
import { LINES_OF_BUSINESS, opportunityFields } from '../../lib/opportunities';
import OpportunityDialog from './OpportunityDialog';

export function OpportunityEditor({ data, prefill = {}, existing = null, onSaved, onBusyChange = () => {}, focusNotes = false }) {
  const notesRef = useRef(null);
  useEffect(() => {
    if (!focusNotes) return undefined;
    const frame = window.requestAnimationFrame(() => {
      notesRef.current?.scrollIntoView({ block: 'center' });
      notesRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusNotes]);
  const defaultPipeline = data.pipelines.find((row) => row.id === prefill.pipeline_id) || data.pipelines.find((row) => row.is_default) || data.pipelines[0];
  const defaultStage = data.stages.find((row) => row.pipeline_id === defaultPipeline?.id);
  const [fields, setFields] = useState(() => opportunityFields(existing || {
    pipeline_id: defaultPipeline?.id, stage_id: defaultStage?.id,
    assigned_agent_id: data.agentUuid, title: `${defaultPipeline?.line_of_business || 'MA'} opportunity`, line_of_business: defaultPipeline?.line_of_business || 'MA', est_value: 0, ...prefill,
  }));
  const [search, setSearch] = useState('');
  const [createNew, setCreateNew] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState(null);
  const [calls, setCalls] = useState([]);
  const [callError, setCallError] = useState('');
  const syncedVersion = useRef(existing ? `${existing.id}:${existing.updated_at}` : null);
  const { contacts, loading: contactsLoading, error: contactsError } = useContactsList('', data.agentUuid, true);
  const { createContact } = useContactMutations(data.agentUuid);
  const matching = useMemo(() => contacts.filter((row) => contactDisplayName(row).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [contacts, search]);
  const selectedContact = contacts.find((row) => row.id === fields.contact_id);
  const pipelineStages = data.stages.filter((row) => row.pipeline_id === fields.pipeline_id);
  const set = (key, value) => setFields((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!existing) return;
    const version = `${existing.id}:${existing.updated_at}`;
    if (version !== syncedVersion.current) {
      syncedVersion.current = version;
      setFields(opportunityFields(existing));
    }
  }, [existing]);

  useEffect(() => {
    let cancelled = false;
    setCalls([]); setCallError('');
    if (!fields.contact_id) return undefined;
    data.supabaseClient.from('call_records').select('id, call_start, call_outcome, product_type')
      .eq('tenant_id', data.tenantId).eq('contact_id', fields.contact_id).order('call_start', { ascending: false }).limit(100)
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) setCallError(err.message); else setCalls(rows || []);
      });
    return () => { cancelled = true; };
  }, [data.supabaseClient, data.tenantId, fields.contact_id]);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); onBusyChange(true); setError('');
    try {
      const draft = { ...fields };
      if (createNew) {
        const contact = await createContact({ ...newContact, assigned_agent_id: data.agents.find((agent) => agent.id === draft.assigned_agent_id)?.agent_slug || null });
        draft.contact_id = contact.id;
        // Retain a successfully created contact if saving the opportunity fails.
        setFields(draft); setCreateNew(false);
      }
      if (!draft.contact_id) throw new Error('Choose an existing contact or create one.');
      const id = await data.save(draft, existing);
      onSaved(id);
    } catch (err) {
      setError(err.message || 'Opportunity could not be saved.');
      setDuplicateId(err.duplicateId || null);
    } finally { setSaving(false); onBusyChange(false); }
  };

  return <form className="opps-editor" onSubmit={submit}>
    {error && <div className="ops-error" role="alert">{error}</div>}
    {duplicateId && <button type="button" className="contacts-mini-btn" onClick={() => { set('contact_id', duplicateId); setCreateNew(false); setError(''); setDuplicateId(null); }}>USE EXISTING CONTACT</button>}
    <fieldset disabled={saving}>
      <div className="opps-actions contacts-filters">
        <button type="button" className={!createNew ? 'is-active' : ''} onClick={() => setCreateNew(false)}>Existing contact</button>
        <button type="button" className={createNew ? 'is-active' : ''} onClick={() => {
          setCreateNew(true);
          setFields((current) => ({ ...current, contact_id: '', call_id: '' }));
        }}>Create contact</button>
      </div>
      {createNew ? <div className="contacts-edit-grid">
        {Object.keys(newContact).map((key) => <label className="contacts-edit-field" key={key}><span>{key.replace('_', ' ').toUpperCase()}</span>
          <input className="contacts-edit-input" required={key === 'first_name'} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={newContact[key]} onChange={(event) => setNewContact((current) => ({ ...current, [key]: event.target.value }))} />
        </label>)}
      </div> : <div className="opps-contact-picker">
        <label className="contacts-edit-field"><span>SEARCH CONTACTS BY NAME</span><input className="contacts-edit-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts…" /></label>
        <label className="contacts-edit-field"><span>CONTACT</span><select className="contacts-edit-input" required value={fields.contact_id} onChange={(event) => {
          setFields((current) => ({ ...current, contact_id: event.target.value, call_id: '' }));
        }}><option value="">{contactsLoading ? 'Loading contacts…' : 'Choose contact'}</option>
          {fields.contact_id && !matching.some((row) => row.id === fields.contact_id) && <option value={fields.contact_id}>{selectedContact ? contactDisplayName(selectedContact) : existing?.contact_name || prefill.contact_name || 'Selected contact'}</option>}
          {matching.map((row) => <option key={row.id} value={row.id}>{contactDisplayName(row)} · {row.phone_last4 || row.id.slice(0, 8)}</option>)}
        </select></label>
        {contactsError && <div className="ops-error" role="alert">{contactsError}</div>}
      </div>}
      <div className="contacts-edit-grid">
        <label className="contacts-edit-field contacts-edit-field-wide"><span>TITLE</span><input className="contacts-edit-input" required maxLength={200} value={fields.title} onChange={(event) => set('title', event.target.value)} /></label>
        <label className="contacts-edit-field"><span>PIPELINE</span><select className="contacts-edit-input" required value={fields.pipeline_id} onChange={(event) => {
          const id = event.target.value;
          setFields((current) => ({ ...current, pipeline_id: id, stage_id: data.stages.find((row) => row.pipeline_id === id)?.id || '' }));
        }}>{data.pipelines.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="contacts-edit-field"><span>STAGE / STATUS</span><select className="contacts-edit-input" required value={fields.stage_id} onChange={(event) => set('stage_id', event.target.value)}>{pipelineStages.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_won ? ' · Won' : row.is_lost ? ' · Lost' : ''}</option>)}</select></label>
        <label className="contacts-edit-field"><span>LINE OF BUSINESS</span><select className="contacts-edit-input" required value={fields.line_of_business} onChange={(event) => set('line_of_business', event.target.value)}>{LINES_OF_BUSINESS.map((line) => <option key={line}>{line}</option>)}</select></label>
        <label className="contacts-edit-field"><span>ASSIGNED AGENT</span><select className="contacts-edit-input" value={fields.assigned_agent_id} onChange={(event) => set('assigned_agent_id', event.target.value)}><option value="">Unassigned</option>{data.agents.filter((row) => row.is_active !== false || row.id === fields.assigned_agent_id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {['carrier', 'plan_name', 'effective_date', 'est_value'].map((key) => <label className="contacts-edit-field" key={key}><span>{key.replace('_', ' ').toUpperCase()}</span><input className="contacts-edit-input" type={key === 'effective_date' ? 'date' : key === 'est_value' ? 'number' : 'text'} min={key === 'est_value' ? 0 : undefined} step={key === 'est_value' ? '0.01' : undefined} max={key === 'est_value' ? '999999999999.99' : undefined} maxLength={key === 'carrier' || key === 'plan_name' ? 200 : undefined} value={fields[key]} onChange={(event) => set(key, event.target.value)} /></label>)}
        <label className="contacts-edit-field"><span>SOURCE</span><select className="contacts-edit-input" value={fields.lead_source_id} onChange={(event) => set('lead_source_id', event.target.value)}><option value="">No source</option>{data.sources.filter((row) => data.activeSources.some((source) => source.id === row.id) || row.id === fields.lead_source_id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="contacts-edit-field"><span>LINKED CALL</span><select className="contacts-edit-input" value={fields.call_id} onChange={(event) => set('call_id', event.target.value)}><option value="">{existing ? 'No call' : 'Latest related call (if any)'}</option>
          {fields.call_id && !calls.some((row) => row.id === fields.call_id) && <option value={fields.call_id}>Selected call</option>}
          {calls.map((row) => <option key={row.id} value={row.id}>{row.call_start ? new Date(row.call_start).toLocaleString() : row.id.slice(0, 8)} · {row.call_outcome || row.product_type || 'Call'}</option>)}
        </select></label>
        <label className="contacts-edit-field contacts-edit-field-wide"><span>NOTES</span><textarea ref={notesRef} className="contacts-edit-input contacts-edit-textarea" rows={4} maxLength={10000} value={fields.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      </div>
    </fieldset>
    {callError && <div className="ops-error" role="alert">Linked calls: {callError}</div>}
    <button className="contacts-mini-btn opps-primary" disabled={saving || !data.agentUuid || !data.stages.length}>{saving ? 'SAVING…' : existing ? 'SAVE OPPORTUNITY' : 'CREATE OPPORTUNITY'}</button>
  </form>;
}

export default function NewOpportunityModal({ data, prefill, onClose, onSaved = onClose }) {
  const [busy, setBusy] = useState(false);
  return <OpportunityDialog title="New Opportunity" busy={busy} onClose={onClose}>
    {data.loading ? <p className="contacts-muted">Loading pipeline…</p> : data.error && !data.stages.length ? <div className="ops-error" role="alert">{data.error}<button className="contacts-mini-btn" onClick={() => data.refresh()}>RETRY</button></div>
      : <OpportunityEditor data={data} prefill={prefill} onBusyChange={setBusy} onSaved={onSaved} />}
  </OpportunityDialog>;
}
