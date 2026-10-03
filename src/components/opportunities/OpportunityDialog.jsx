import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function OpportunityDialog({ title, drawer = false, busy = false, onClose, children }) {
  const panel = useRef(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape' && !latest.current.busy) { event.stopPropagation(); latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    const element = panel.current;
    element.addEventListener('keydown', keydown);
    return () => { element.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return createPortal(<div className={`opps-overlay${drawer ? ' opps-overlay--drawer' : ''}`} onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section className={`opps-dialog${drawer ? ' opps-dialog--drawer' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
      <header className="opps-dialog-head"><h2>{title}</h2><button type="button" className="contacts-mini-btn" aria-label="Close" disabled={busy} onClick={onClose}><X size={16} /></button></header>
      <div className="opps-dialog-body">{children}</div>
    </section>
  </div>, document.body);
}
