// Hand-off slot for "start a call from a contact": the CRM stashes the
// contact here, the cockpit consumes it on mount and hydrates the left
// rail. Module singleton, same pattern as activeSessionMetadata in
// useSessionTracker.js.

let pendingCallContact = null;

export function setPendingCallContact(contact) {
  pendingCallContact = contact || null;
}

export function consumePendingCallContact() {
  const contact = pendingCallContact;
  pendingCallContact = null;
  return contact;
}

// Shared note hydration used by both the inbound-accept path and the
// start-call-from-contact path (MA cockpit only).
export function buildNotesFromContact(contact) {
  if (!contact) return {};
  return {
    customerFirstName: contact.first_name,
    customerLastName: contact.last_name,
    customerPhone: contact.phone,
    customerEmail: contact.email,
    customerDob: contact.dob,
    customerState: contact.state,
    customerCounty: contact.county,
    customerAddress: contact.address,
    customerZip: contact.zip,
    previousCarrier: contact.current_carrier,
    currentCoverage: [contact.current_carrier, contact.current_plan]
      .filter(Boolean)
      .join(" "),
    partsABStatus: contact.medicare_parts === "ab" ? "Active" : "",
  };
}

export function hydrateNotesFromContact(dispatch, contact) {
  const noteValues = buildNotesFromContact(contact);
  for (const [field, value] of Object.entries(noteValues)) {
    if (value) dispatch({ type: "SET_NOTE", field, value });
  }
}
