import { ChevronDown } from 'lucide-react';

export default function CallLogIconSelect({ icon: Icon, label, title, value, onChange, children }) {
  return <label className={`contacts-mini-btn call-log-toolbar-icon call-log-icon-filter${value !== 'ALL' ? ' is-active' : ''}`} title={title}>
    <Icon size={16} aria-hidden="true" />
    <ChevronDown size={9} className="call-log-icon-chevron" aria-hidden="true" />
    <select aria-label={label} title={title} value={value} onChange={onChange}>{children}</select>
  </label>;
}
