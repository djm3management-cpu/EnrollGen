import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function localDate(key) { return new Date(`${key}T12:00:00`); }
function shiftMonth(date, delta) {
  const last = new Date(date.getFullYear(), date.getMonth() + delta + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + delta, Math.min(date.getDate(), last), 12);
}
function shortDate(key) {
  return localDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CallDateRangePicker({ from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => localDate(from || dateKey(new Date())));
  const [focusedDay, setFocusedDay] = useState(from || dateKey(new Date()));
  const [anchor, setAnchor] = useState(null);
  const [hovered, setHovered] = useState(null);
  const rootRef = useRef(null), triggerRef = useRef(null), focusDay = useRef(false);
  const id = useId();
  const today = dateKey(new Date());
  const label = !from ? 'ALL DATES' : !to || from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const preview = anchor && hovered ? [anchor, hovered].sort() : [from, to || from];

  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!rootRef.current?.contains(event.target)) { setOpen(false); setAnchor(null); setHovered(null); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open && focusDay.current) {
      rootRef.current?.querySelector(`[data-date="${focusedDay}"]`)?.focus();
      focusDay.current = false;
    }
  }, [open, focusedDay]);

  const close = () => { setOpen(false); setAnchor(null); setHovered(null); triggerRef.current?.focus(); };
  const select = key => {
    setFocusedDay(key); setHovered(null);
    if (!anchor) { setAnchor(key); onChange(key, key); }
    else { const [start, end] = [anchor, key].sort(); onChange(start, end); setAnchor(null); }
  };
  const move = (date, focus = false) => {
    focusDay.current = focus;
    setFocusedDay(dateKey(date)); setMonth(date);
  };
  const dayKeyDown = (event, key) => {
    const date = localDate(key);
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getDay(), End: 6 - date.getDay() };
    if (Object.hasOwn(offsets, event.key)) {
      event.preventDefault(); date.setDate(date.getDate() + offsets[event.key]); move(date, true);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault(); move(shiftMonth(date, event.key === 'PageUp' ? -1 : 1), true);
    }
  };

  return <div className="call-date-picker" ref={rootRef} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button type="button" ref={triggerRef} className={`contacts-mini-btn call-log-toolbar-icon call-date-trigger${from ? ' is-active' : ''}`} title={`Filter calls by date: ${label}`} aria-label={`Filter calls by date: ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => {
      if (open) { close(); return; }
      const key = from || today;
      setAnchor(null); setHovered(null); focusDay.current = true; setFocusedDay(key); setMonth(localDate(key)); setOpen(true);
    }}><CalendarDays size={16} aria-hidden="true" /></button>
    {open && <div id={id} className="call-date-popover" role="dialog" aria-label="Choose call dates">
      <div className="call-date-month">
        <button type="button" className="contacts-mini-btn" aria-label="Previous month" onClick={() => move(shiftMonth(localDate(focusedDay), -1))}><ChevronLeft size={16} /></button>
        <span aria-live="polite">{monthLabel}</span>
        <button type="button" className="contacts-mini-btn" aria-label="Next month" onClick={() => move(shiftMonth(localDate(focusedDay), 1))}><ChevronRight size={16} /></button>
      </div>
      <p className="call-date-help">Click one day, or click a start and end date.</p>
      <div className="call-date-weekdays" aria-hidden="true">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="call-date-days" role="group" aria-label={`${monthLabel} dates`} onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: first.getDay() }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(first.getFullYear(), first.getMonth(), index + 1, 12), key = dateKey(date);
          const selected = Boolean(from && key >= from && key <= (to || from));
          const inRange = preview[0] && key >= preview[0] && key <= preview[1];
          const endpoint = key === preview[0] || key === preview[1];
          return <button type="button" key={key} data-date={key} tabIndex={key === focusedDay ? 0 : -1}
            className={`call-date-day${inRange ? ' is-in-range' : ''}${endpoint ? ' is-endpoint' : ''}${key === today ? ' is-today' : ''}`}
            aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            aria-pressed={selected} aria-current={key === today ? 'date' : undefined}
            onFocus={() => { setFocusedDay(key); if (anchor) setHovered(key); }} onMouseEnter={() => { if (anchor) setHovered(key); }}
            onKeyDown={event => dayKeyDown(event, key)} onClick={() => select(key)}>{index + 1}</button>;
        })}
      </div>
      <div className="call-date-selection" role="status">{!from ? 'All calls' : label}{anchor ? ' · Choose another day for a range' : ''}</div>
      <div className="call-date-footer">
        <button type="button" className="contacts-mini-btn" onClick={() => { onChange('', ''); setAnchor(null); setHovered(null); }}>CLEAR</button>
        <button type="button" className="contacts-mini-btn" onClick={close}>DONE</button>
      </div>
    </div>}
  </div>;
}
