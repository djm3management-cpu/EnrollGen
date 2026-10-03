import { useState } from 'react';
import { useOpportunities } from '../../hooks/useOpportunities';
import { money } from '../../lib/opportunities';
import NewOpportunityModal from './OpportunityEditor';
import OpportunityDrawer, { StageBadge } from './OpportunityDrawer';

function CreateFromRecordModal({ contactId, callId, contactName, onClose }) {
  const data = useOpportunities(contactId || null);
  return <NewOpportunityModal data={data} prefill={{ contact_id: contactId || '', call_id: callId || '', contact_name: contactName }} onClose={onClose} />;
}

export function CreateOpportunityButton({ contactId, callId = null, contactName }) {
  const [open, setOpen] = useState(false);
  const needsContact = Boolean(callId && !contactId);
  return <><button type="button" className="contacts-mini-btn" disabled={needsContact} title={needsContact ? 'Link a contact to this call first.' : undefined} onClick={() => setOpen(true)}>CREATE OPPORTUNITY</button>
    {needsContact && <span className="contacts-muted">Link a contact to this call first.</span>}
    {open && <CreateFromRecordModal contactId={contactId} callId={callId} contactName={contactName} onClose={() => setOpen(false)} />}
  </>;
}

export default function ContactOpportunities({ contactId, onOpenContact = () => {} }) {
  const data = useOpportunities(contactId);
  const [selectedId, setSelectedId] = useState(null);
  const selected = data.rows.find((row) => row.id === selectedId);
  return <section className="opps-contact-section">
    <div className="opps-section-head"><h3>OPPORTUNITIES</h3><CreateOpportunityButton contactId={contactId} /></div>
    {data.loading ? <p className="contacts-muted">Loading opportunities…</p> : data.error ? <div className="ops-error" role="alert">{data.error}<button className="contacts-mini-btn" onClick={() => data.refresh()}>RETRY</button></div> : !data.rows.length ? <p className="contacts-muted">No opportunities yet.</p> : data.rows.map((row) => <button type="button" className="opps-contact-opportunity" key={row.id} onClick={() => setSelectedId(row.id)}><strong>{row.title}</strong><StageBadge stage={data.stages.find((stage) => stage.id === row.stage_id)} /><span>{row.line_of_business} · {money(row.est_value)}</span></button>)}
    {selected && <OpportunityDrawer row={selected} data={data} onClose={() => setSelectedId(null)} onOpenContact={(id) => { setSelectedId(null); onOpenContact(id); }} />}
  </section>;
}
