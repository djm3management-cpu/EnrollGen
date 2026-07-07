import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useContactsList, contactDisplayName } from "../../hooks/useContacts";
import { useUnreadMessages } from "../../hooks/useMessages";
import ContactDetail from "./ContactDetail";
import ContactImportPanel from "./ContactImportPanel";

const STATUS_FILTERS = ["ALL", "LEAD", "CLIENT", "FORMER"];

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "--";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

function fmtLastActivity(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

function LeadScoreChip({ intel }) {
  if (!intel || intel.lead_score == null) return <span className="contacts-muted">--</span>;
  const score = Math.round(Number(intel.lead_score));
  const band = score >= 75 ? "high" : score >= 45 ? "mid" : "low";
  return <span className={`contacts-chip contacts-chip-score band-${band}`}>{score}</span>;
}

export default function ContactsTab({ variant = "home", onStartCall = null, focusContact = null }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [agentFilter, setAgentFilter] = useState("ALL");
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const { contacts, loading, error, refresh } = useContactsList(search);
  const { unreadByContact } = useUnreadMessages();

  // Deep-open from the call log (focusContact.ts changes per request).
  useEffect(() => {
    if (focusContact?.id) {
      setSelectedContactId(focusContact.id);
      setImportOpen(false);
    }
  }, [focusContact?.id, focusContact?.ts]);

  const agentOptions = useMemo(() => {
    const agents = new Set();
    for (const contact of contacts) {
      if (contact.assigned_agent_id) agents.add(contact.assigned_agent_id);
    }
    return ["ALL", ...Array.from(agents).sort()];
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter((contact) => {
      if (statusFilter !== "ALL" && contact.status !== statusFilter.toLowerCase()) return false;
      if (agentFilter !== "ALL" && contact.assigned_agent_id !== agentFilter) return false;
      return true;
    });
  }, [contacts, statusFilter, agentFilter]);

  const shellClass = `contacts-tab${variant === "home" ? " contacts-tab--home" : ""}`;

  if (selectedContactId) {
    return (
      <div className={shellClass}>
        <ContactDetail
          contactId={selectedContactId}
          onBack={() => setSelectedContactId(null)}
          onStartCall={onStartCall}
        />
      </div>
    );
  }

  if (importOpen) {
    return (
      <div className={shellClass}>
        <ContactImportPanel
          onClose={() => {
            setImportOpen(false);
            refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className={shellClass}>
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
        <button type="button" className="contacts-mini-btn" onClick={() => setImportOpen(true)}>
          IMPORT
        </button>
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
        <select
          className="contacts-agent-filter"
          value={agentFilter}
          onChange={(event) => setAgentFilter(event.target.value)}
          aria-label="Filter by agent"
        >
          {agentOptions.map((agent) => (
            <option key={agent} value={agent}>
              {agent === "ALL" ? "ALL AGENTS" : agent}
            </option>
          ))}
        </select>
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
              <th>SCORE</th>
              <th>AGENT</th>
              <th>LAST ACTIVITY</th>
              <th>SOURCE</th>
              <th>LOCATION</th>
              {onStartCall ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="contacts-muted">Loading contacts...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="contacts-muted">No contacts found</td>
              </tr>
            ) : (
              filtered.map((contact) => (
                <tr key={contact.id} onClick={() => setSelectedContactId(contact.id)}>
                  <td>
                    {contactDisplayName(contact)}
                    {unreadByContact[contact.id] ? (
                      <span
                        className="contacts-unread-icon"
                        title={`${unreadByContact[contact.id]} unread message${unreadByContact[contact.id] > 1 ? "s" : ""}`}
                      >
                        <MessageSquare size={12} />
                        {unreadByContact[contact.id]}
                      </span>
                    ) : null}
                    {contact.do_not_call ? <span className="contacts-dnc"> DNC</span> : null}
                  </td>
                  <td className="mono">{fmtPhone(contact.phone)}</td>
                  <td>
                    <span className={`contacts-chip status-${contact.status}`}>
                      {(contact.status || "").toUpperCase()}
                    </span>
                  </td>
                  <td><LeadScoreChip intel={contact.lead_intel} /></td>
                  <td>{contact.assigned_agent_id || "--"}</td>
                  <td className="mono">{fmtLastActivity(contact.updated_at)}</td>
                  <td>{(contact.source || "").toUpperCase()}</td>
                  <td>{[contact.county, contact.state].filter(Boolean).join(", ") || "--"}</td>
                  {onStartCall ? (
                    <td>
                      <button
                        type="button"
                        className="contacts-mini-btn contacts-start-call"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStartCall(contact, "ma");
                        }}
                        disabled={contact.do_not_call}
                        title={contact.do_not_call ? "Contact is flagged do not call" : "Start an MA call with this contact"}
                      >
                        START CALL
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
