import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';

export default function ContactTagsPopover({ contactId, contactName, anchor, tags, onClose }) {
  const panelRef = useRef(null), inputRef = useRef(null);
  const [draft, setDraft] = useState('');
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const contactTags = tags.tags.filter((tag) => tag.contact_id === contactId);
  useEffect(() => {
    const place = () => {
      if (!anchor.isConnected) { onClose(); return; }
      const rect = anchor.getBoundingClientRect(), height = panelRef.current?.offsetHeight || 220;
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 292)),
        top: Math.max(12, rect.bottom + height + 12 > window.innerHeight ? rect.top - height - 8 : rect.bottom + 8) });
    };
    place(); inputRef.current?.focus();
    const outside = (event) => { if (!panelRef.current?.contains(event.target) && !anchor.contains(event.target)) onClose(); };
    const escape = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); anchor.focus(); } };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
    };
  }, [anchor, onClose, contactTags.length, tags.error, tags.loading]);
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    try { await tags.add(contactId, draft.trim()); setDraft(''); inputRef.current?.focus(); } catch { /* Hook displays the error. */ }
  };
  return createPortal(<section ref={panelRef} className="opps-tags-popover" style={position} role="dialog" aria-label={`Tags for ${contactName}`}>
    <header><strong>Contact tags</strong><button type="button" className="contacts-mini-btn" aria-label="Close tags" onClick={() => { onClose(); anchor.focus(); }}><X size={14} /></button></header>
    <div className="opps-tag-list">{contactTags.map((tag) => <span key={tag.id} className="contacts-chip">{tag.name}<button type="button" aria-label={`Remove ${tag.name} tag`} disabled={tags.saving} onClick={() => { void tags.remove(tag.id).catch(() => {}); }}><X size={12} /></button></span>)}
      {!contactTags.length && <span className="contacts-muted">{tags.loading ? 'Loading tags…' : 'No tags yet'}</span>}
    </div>
    {tags.error && <div className="ops-error" role="alert">{tags.error}<button type="button" className="contacts-mini-btn" disabled={tags.loading} onClick={() => { void tags.refresh(); }}>RETRY</button></div>}
    <form onSubmit={submit}><input ref={inputRef} className="contacts-edit-input" aria-label="New contact tag" placeholder="Add a tag…" value={draft} maxLength={60} onChange={(event) => setDraft(event.target.value)} disabled={tags.saving || tags.loading} /><button type="submit" className="contacts-mini-btn" aria-label="Add tag" disabled={!draft.trim() || tags.saving || tags.loading}><Plus size={16} /></button></form>
  </section>, document.body);
}
