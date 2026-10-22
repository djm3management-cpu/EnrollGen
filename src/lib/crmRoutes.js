export const CRM_NAVIGATION_EVENT = 'crm-navigation';
const VIEWS = new Set(['contacts', 'calls', 'opportunities', 'followups']);

export function readCrmLocation(location) {
  const url = new URL(location.href || String(location), 'https://enrollgen.local');
  const parts = url.pathname.split('/').filter(Boolean);
  const legacy = url.searchParams.get('view');
  const view = parts[0] === 'crm' && VIEWS.has(parts[1]) ? parts[1]
    : parts[0] === 'calls' ? 'calls' : VIEWS.has(legacy) ? legacy : 'contacts';
  let contactId = view === 'contacts' ? url.searchParams.get('contact') || null : null;
  if (parts[0] === 'crm' && parts[1] === 'contacts' && parts[2]) {
    try { contactId = decodeURIComponent(parts[2]); } catch { contactId = null; }
  }
  return { view, contactId };
}

export function crmPath(view = 'contacts', contactId = null) {
  const section = VIEWS.has(view) ? view : 'contacts';
  return `/crm/${section}${section === 'contacts' && contactId ? `/${encodeURIComponent(contactId)}` : ''}`;
}

export function navigateCrm(view, contactId = null, { replace = false, host = window } = {}) {
  const url = new URL(host.location.href);
  url.pathname = crmPath(view, contactId);
  url.searchParams.delete('view');
  url.searchParams.delete('contact');
  host.history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
  host.dispatchEvent(new Event(CRM_NAVIGATION_EVENT));
}
