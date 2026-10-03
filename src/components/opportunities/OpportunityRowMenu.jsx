import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function OpportunityRowMenu({ row, anchor, canDelete, onOpen, onDelete, onClose }) {
  const panel = useRef(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useEffect(() => {
    const place = () => {
      if (!anchor.isConnected) { onClose(); return; }
      const rect = anchor.getBoundingClientRect(), height = panel.current?.offsetHeight || 90;
      setPosition({ left: Math.max(12, Math.min(rect.right - 180, window.innerWidth - 192)),
        top: Math.max(12, rect.bottom + height + 12 > window.innerHeight ? rect.top - height - 8 : rect.bottom + 8) });
    };
    place(); panel.current?.querySelector('button')?.focus();
    const outside = (event) => { if (!panel.current?.contains(event.target) && !anchor.contains(event.target)) onClose(); };
    const keydown = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); anchor.focus(); }
      if (event.key === 'Tab') onClose();
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...panel.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside); panel.current?.addEventListener('keydown', keydown);
    const element = panel.current;
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside); element?.removeEventListener('keydown', keydown);
    };
  }, [anchor, onClose]);
  return createPortal(<div ref={panel} className="opps-row-menu" role="menu" aria-label={`Actions for ${row.contact_name}`} style={position}>
    <button type="button" role="menuitem" onClick={onOpen}>Open opportunity</button>
    {canDelete && <button type="button" role="menuitem" className="opps-danger" onClick={onDelete}>Delete opportunity</button>}
  </div>, document.body);
}
