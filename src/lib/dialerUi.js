// UI-only handoff to the existing phone dropdown. Placing the call still
// requires the dialer's Call button and uses its unchanged call handler.
export const OPEN_DIALER_EVENT = 'enrollgen:open-dialer';

export function openContactDialer(contact) {
  window.dispatchEvent(new CustomEvent(OPEN_DIALER_EVENT, { detail: { contact } }));
}
