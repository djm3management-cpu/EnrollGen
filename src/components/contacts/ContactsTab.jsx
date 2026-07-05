import { useMemo, useState } from "react";
import { useContactsList, contactDisplayName } from "../../hooks/useContacts";
import ContactDetail from "./ContactDetail";

const STATUS_FILTERS = ["ALL", "LEAD", "CLIENT", "FORMER"];

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "--";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

function LeadScoreChip({ intel }) {
  if (!intel || intel.lead_score == null) return <span className="contacts-muted">--</span>;
  const score = Math.round(Number(intel.lead_score));
  const band = score >= 75 ? "high" : score >= 45 ? "mid" : "low";
  return <span className={`contacts-chip contacts-chip-score band-${band}`}>{score}</span>;
}

export default function ContactsTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedContactId, setSelectedContactId] = useState(null);
  const { contacts, loading, error, refresh } = useContactsList(search);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return contacts;
    return contacts.filter((contact) => contact.status === statusFilter.toLowerCase());
  }, [contacts, statusFilter]);

  if (selectedContactId) {
    return (
      <div className="contacts-tab">
        <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
      </div>
    );
  }

  return (
    <div className="contacts-tab">
      <div className="ops-command-line">
        <span>CONTACTS</span>
        <span className="ops-section-meta">{filtered.length} RECORDS</span>
      </div>

      <div className="contacts-toolbar">
        <input
          type="search"
          className="contacts-search"
          placeholder="Search name, phone, email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="contacts-filters">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={statusFilter === filter ? "is-active" : ""}
              onClick={() => setStatusFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <button type="button" className="contacts-mini-btn" onClick={refresh}>
          REFRESH
        </button>
      </div>

      {error ? <div className="ops-error">⚠ {error}</div> : null}

      <div className="contacts-table-wrap">
        <table className="contacts-table">
          <thead>
            <tr>
              <th>NAME</th>
              <th>PHONE</th>
              <th>STATUS</th>
              <th>AGENT</th>
              <th>SCORE</th>
              <th>SOURCE</th>
              <th>LOCATION</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="contacts-muted">Loading contacts...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="contacts-muted">No contacts found</td>
              </tr>
            ) : (
              filtered.map((contact) => (
                <tr key={contact.id} onClick={() => setSelectedContactId(contact.id)}>
                  <td>
                    {contactDisplayName(contact)}
                    {contact.do_not_call ? <span className="contacts-dnc"> DNC</span> : null}
                  </td>
                  <td className="mono">{fmtPhone(contact.phone)}</td>
                  <td>
                    <span className={`contacts-chip status-${contact.status}`}>
                      {(contact.status || "").toUpperCase()}
                    </span>
                  </td>
                  <td>{contact.assigned_agent_id || "--"}</td>
                  <td><LeadScoreChip intel={contact.lead_intel} /></td>
                  <td>{(contact.source || "").toUpperCase()}</td>
                  <td>{[contact.county, contact.state].filter(Boolean).join(", ") || "--"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
