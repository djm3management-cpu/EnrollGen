import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Eye, EyeOff, Mail, Phone, Search, Star } from "lucide-react";
import {
  useContactsList,
  useContactDetail,
  useContactMutations,
  useContactPii,
  contactDisplayName,
} from "../../hooks/useContacts";
import { useUnreadMessages } from "../../hooks/useMessages";
import { useAvailability } from "../../context/AvailabilityContext";
import { useCurrentAgent } from "../../hooks/useCurrentAgent";
import MessagesThread from "./MessagesThread";
import MaskedField from "../common/MaskedField";

const PII_FIELD_SET = new Set(["first_name", "last_name", "dob", "phone", "email", "address", "mbi_full"]);

const LIST_FILTERS = ["UNREAD", "ALL", "RECENT"];
const CENTER_TABS = ["CONVERSATIONS", "ACTIVITY", "NOTES"];
const RIGHT_TABS = ["ALL FIELDS", "DND", "ACTIONS"];

const STATUS_OPTIONS = [
  { value: "lead", label: "LEAD" },
  { value: "client", label: "CLIENT" },
  { value: "former", label: "FORMER" },
];

const MEDICARE_PART_OPTIONS = [
  { value: "none", label: "NONE" },
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "ab", label: "A/B" },
];

const SOURCE_OPTIONS = [
  { value: "manual", label: "MANUAL" },
  { value: "fmo_transfer", label: "FMO TRANSFER" },
  { value: "tms", label: "TMS" },
  { value: "ghl_import", label: "GHL IMPORT" },
];

const CHURN_RISK_OPTIONS = [
  { value: "", label: "NONE" },
  { value: "low", label: "LOW" },
  { value: "medium", label: "MEDIUM" },
  { value: "high", label: "HIGH" },
];

const PRODUCT_LINE_OPTIONS = [
  { value: "MA", label: "MA" },
  { value: "MS", label: "MS" },
  { value: "ACA", label: "ACA" },
  { value: "U65", label: "U65" },
  { value: "ANC", label: "ANC" },
];

const POLICY_STATUS_OPTIONS = [
  { value: "pending", label: "PENDING" },
  { value: "active", label: "ACTIVE" },
  { value: "lapsed", label: "LAPSED" },
  { value: "cancelled", label: "CANCELLED" },
];

const CALL_FLOWS = [
  { id: "ma", label: "MA" },
  { id: "aca", label: "ACA" },
  { id: "medsup", label: "MS" },
  { id: "u65", label: "U65" },
  { id: "ancillary", label: "ANC" },
];

const DEFAULT_SECTIONS = {
  contactInfo: true,
  leadIntel: true,
  policies: true,
};

const DEFAULT_POLICY_DRAFT = {
  product_line: "MA",
  carrier: "",
  plan_name: "",
  plan_id: "",
  effective_date: "",
  status: "pending",
};

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "--";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

function fmtDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShortDate(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "--";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatDateInput(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateTimeInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function cleanText(value) {
  const next = String(value ?? "").trim();
  return next || null;
}

function valuesMatch(left, right) {
  if (typeof left === "boolean" || typeof right === "boolean") return Boolean(left) === Boolean(right);
  return String(left ?? "") === String(right ?? "");
}

function normalizeContactValue(field, value) {
  if (field === "do_not_call") return Boolean(value);
  if (field === "dob") return cleanText(value) ? String(value).slice(0, 10) : null;
  if (field === "status") return cleanText(value) || "lead";
  if (field === "medicare_parts") return cleanText(value) || "none";
  if (field === "source") return cleanText(value) || "manual";
  if (field === "mbi_last4") {
    const digits = String(value ?? "").replace(/\D/g, "").slice(-4);
    return digits || null;
  }
  return cleanText(value);
}

function normalizePolicyValue(field, value) {
  if (field === "effective_date") return cleanText(value) ? String(value).slice(0, 10) : null;
  if (field === "product_line") return cleanText(value) || "MA";
  if (field === "status") return cleanText(value) || "pending";
  return cleanText(value);
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function initialsFor(contact) {
  const first = contact?.first_initial || String(contact?.first_name || "").trim()[0] || "";
  const last = contact?.last_initial || String(contact?.last_name || "").trim()[0] || "";
  const initials = `${first}${last}`.trim();
  if (initials) return initials.toUpperCase();
  return String(contact?.phone_last4 || contact?.phone || "?").slice(-2);
}

function latestTime(contact) {
  return (
    contact?.last_message?.created_at ||
    contact?.last_activity?.occurred_at ||
    contact?.updated_at ||
    contact?.created_at ||
    null
  );
}

function previewFor(contact) {
  if (contact?.last_message) {
    const prefix = contact.last_message.direction === "inbound" ? "Inbound" : "Outbound";
    return `${prefix}: ${contact.last_message.body || contact.last_message.status || "Message"}`;
  }
  if (contact?.last_activity) return contact.last_activity.summary || String(contact.last_activity.type || "Activity");
  const maskedPhone = contact?.phone_last4 ? `•••-•••-${contact.phone_last4}` : "";
  return maskedPhone || "No activity yet";
}

function usePersistedState(key, fallback) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) return fallback;
      const parsed = JSON.parse(stored);
      if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
        return { ...fallback, ...parsed };
      }
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  }, [key, value]);

  return [value, setValue];
}

function EditableField({ label, value, type = "text", onCommit, className = "", placeholder = "", autoComplete, disabled = false }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return (
    <label className={`contacts-edit-field ${className}`.trim()}>
      <span>{label}</span>
      <input
        className="contacts-edit-input"
        type={type}
        value={draft}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        title={disabled ? "Reveal PII to edit" : undefined}
        onContextMenu={(event) => event.preventDefault()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function EditableSelect({ label, value, options, onCommit, className = "" }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return (
    <label className={`contacts-edit-field ${className}`.trim()}>
      <span>{label}</span>
      <select
        className="contacts-edit-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EditableTextarea({ label, value, rows = 4, onCommit }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return (
    <label className="contacts-edit-field contacts-edit-field-wide">
      <span>{label}</span>
      <textarea
        className="contacts-edit-input contacts-edit-textarea"
        rows={rows}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
      />
    </label>
  );
}

function ToggleField({ label, checked, onCommit }) {
  return (
    <label className="contacts-toggle-field">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onCommit(event.target.checked)} />
      <b>{checked ? "ON" : "OFF"}</b>
    </label>
  );
}

function AccordionSection({ id, title, open, onToggle, meta = null, children }) {
  return (
    <section className="contacts-accordion">
      <button
        type="button"
        className="contacts-accordion-head"
        onClick={() => onToggle(id)}
        aria-expanded={open}
      >
        <span>{title}</span>
        {meta ? <small>{meta}</small> : null}
        <b>{open ? "OPEN" : "CLOSED"}</b>
      </button>
      {open ? <div className="contacts-accordion-body">{children}</div> : null}
    </section>
  );
}

function ContactListPanel({
  contacts,
  selectedContactId,
  unreadByContact,
  loading,
  search,
  setSearch,
  filter,
  setFilter,
  onSelectContact,
}) {
  return (
    <aside className="contacts-conv-left">
      <div className="contacts-conv-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search contacts"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="contacts-conv-filters">
        {LIST_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "is-active" : ""}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="contacts-conv-list">
        {loading ? <div className="contacts-muted contacts-conv-empty">Loading contacts...</div> : null}
        {!loading && contacts.length === 0 ? (
          <div className="contacts-muted contacts-conv-empty">No contacts found</div>
        ) : null}
        {contacts.map((contact) => {
          const unread = unreadByContact[contact.id] || 0;
          return (
            <button
              type="button"
              key={contact.id}
              className={`contacts-conv-row${selectedContactId === contact.id ? " is-selected" : ""}`}
              onClick={() => onSelectContact(contact.id)}
            >
              <span className="contacts-avatar">{initialsFor(contact)}</span>
              <span className="contacts-conv-copy">
                <span className="contacts-conv-title">
                  <strong>{contactDisplayName(contact)}</strong>
                  <small className="mono">{fmtShortDate(latestTime(contact))}</small>
                </span>
                <span className="contacts-conv-preview">{previewFor(contact)}</span>
              </span>
              {unread ? <span className="contacts-unread-badge">{unread}</span> : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CenterTopBar({ contact, onStartCall, onEmail, revealed, revealing, onRequestReveal, onCopy }) {
  return (
    <div className="contacts-conv-center-head">
      <div>
        <h2>{contact ? contactDisplayName(contact).toUpperCase() : "SELECT CONTACT"}</h2>
        {contact ? (
          <span className="contacts-muted contacts-center-head-pii">
            <MaskedField
              maskedValue={contact.phone_last4 ? `•••-•••-${contact.phone_last4}` : ""}
              value={fmtPhone(contact.phone)}
              revealed={revealed}
              onCopy={onCopy}
            />
            <MaskedField
              maskedValue={contact.email_set ? "•••@•••" : ""}
              value={contact.email}
              revealed={revealed}
              onCopy={onCopy}
            />
          </span>
        ) : null}
      </div>
      <div className="contacts-icon-actions">
        {contact ? (
          <button
            type="button"
            title={revealed ? "Hide PII (auto-hides after 30s idle)" : "Reveal PII"}
            disabled={revealing}
            onClick={onRequestReveal}
          >
            {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        ) : null}
        <button
          type="button"
          title="Start call"
          disabled={!contact || contact.do_not_call || !onStartCall}
          onClick={() => contact && onStartCall?.(contact, "ma")}
        >
          <Phone size={15} aria-hidden="true" />
        </button>
        <button type="button" title="Email" disabled={!contact?.email_set} onClick={onEmail}>
          <Mail size={15} aria-hidden="true" />
        </button>
        <button type="button" title="Star contact" disabled={!contact}>
          <Star size={15} aria-hidden="true" />
        </button>
        <button type="button" title="Archive conversation" disabled={!contact}>
          <Archive size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ActivityPanel({ bundle }) {
  const rows = useMemo(() => {
    const activityRows = (bundle?.activities || []).map((item) => ({
      id: `activity-${item.id}`,
      at: item.occurred_at || item.created_at,
      type: String(item.type || "activity").toUpperCase(),
      summary: item.summary || "Activity",
    }));
    const callRows = (bundle?.calls || []).map((call) => ({
      id: `call-${call.id}`,
      at: call.call_start,
      type: "CALL",
      summary:
        [call.product_type, call.carrier_name, call.plan_name].filter(Boolean).join(" ") ||
        call.call_outcome ||
        "Call",
      meta: fmtDuration(call.call_duration_seconds),
    }));
    return [...activityRows, ...callRows]
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [bundle]);

  if (!rows.length) return <div className="contacts-muted">No activity yet</div>;
  return (
    <div className="contacts-conv-activity">
      {rows.map((item) => (
        <div key={item.id} className="contacts-conv-event">
          <span className="contacts-activity-tag">{item.type}</span>
          <span className="mono">{fmtDateTime(item.at)}</span>
          <span>{item.summary}</span>
          {item.meta ? <small>{item.meta}</small> : null}
        </div>
      ))}
    </div>
  );
}

function NotesPanel({ notes, noteDraft, setNoteDraft, onAddNote, onTogglePin, saving }) {
  return (
    <div className="contacts-panel-stack">
      {notes.length === 0 ? <div className="contacts-muted">No notes yet</div> : null}
      {notes.map((note) => (
        <div key={note.id} className={`contacts-note${note.pinned ? " is-pinned" : ""}`}>
          <div className="contacts-note-meta">
            <span className="mono">{fmtDateTime(note.created_at)}</span>
            <button type="button" className="contacts-mini-btn" onClick={() => onTogglePin(note.id, !note.pinned)}>
              {note.pinned ? "UNPIN" : "PIN"}
            </button>
          </div>
          <p>{note.body}</p>
        </div>
      ))}
      <div className="contacts-inline-form contacts-note-form">
        <textarea
          rows={3}
          placeholder="Add note"
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
        />
        <button type="button" className="contacts-mini-btn" disabled={saving} onClick={onAddNote}>
          ADD NOTE
        </button>
      </div>
    </div>
  );
}

function ContactFields({ contact, onSaveContact, onSaveMbiFull, revealed }) {
  return (
    <div className="contacts-edit-grid contacts-fields-compact" onContextMenu={(event) => event.preventDefault()}>
      <EditableField
        label="FIRST NAME"
        value={contact.first_name || ""}
        placeholder={!revealed && contact.first_initial ? `${contact.first_initial}…` : ""}
        disabled={!revealed}
        onCommit={(value) => onSaveContact("first_name", value)}
      />
      <EditableField
        label="LAST NAME"
        value={contact.last_name || ""}
        placeholder={!revealed && contact.last_initial ? `${contact.last_initial}…` : ""}
        disabled={!revealed}
        onCommit={(value) => onSaveContact("last_name", value)}
      />
      <EditableField
        label="PHONE"
        value={contact.phone || ""}
        placeholder={!revealed && contact.phone_last4 ? `•••-•••-${contact.phone_last4}` : ""}
        disabled={!revealed}
        onCommit={(value) => onSaveContact("phone", value)}
      />
      <EditableField
        label="EMAIL"
        type="email"
        value={contact.email || ""}
        placeholder={!revealed && contact.email_set ? "•••@•••" : ""}
        disabled={!revealed}
        onCommit={(value) => onSaveContact("email", value)}
      />
      <EditableField
        label="DOB"
        type="date"
        value={formatDateInput(contact.dob)}
        placeholder={!revealed && contact.dob_set ? "••/••/••••" : ""}
        disabled={!revealed}
        autoComplete="off"
        onCommit={(value) => onSaveContact("dob", value)}
      />
      <EditableField label="COUNTY" value={contact.county || ""} onCommit={(value) => onSaveContact("county", value)} />
      <EditableField label="STATE" value={contact.state || ""} onCommit={(value) => onSaveContact("state", value)} />
      <EditableField label="ZIP" value={contact.zip || ""} onCommit={(value) => onSaveContact("zip", value)} />
      <EditableField
        label="MBI LAST 4"
        value={contact.mbi_last4 || ""}
        autoComplete="off"
        onCommit={(value) => onSaveContact("mbi_last4", value)}
      />
      <EditableField
        label="MBI (FULL)"
        value={contact.mbi_full || ""}
        placeholder={
          !revealed && contact.mbi_last4
            ? `•••••••${contact.mbi_last4}`
            : revealed && !contact.mbi_full
              ? "Not on file — enter full MBI"
              : ""
        }
        disabled={!revealed}
        autoComplete="off"
        onCommit={(value) => onSaveMbiFull(value)}
      />
      <EditableSelect
        label="PARTS A/B"
        value={contact.medicare_parts || "none"}
        options={MEDICARE_PART_OPTIONS}
        onCommit={(value) => onSaveContact("medicare_parts", value)}
      />
      <EditableField
        label="CURRENT CARRIER"
        value={contact.current_carrier || ""}
        onCommit={(value) => onSaveContact("current_carrier", value)}
      />
      <EditableField
        label="CURRENT PLAN"
        value={contact.current_plan || ""}
        onCommit={(value) => onSaveContact("current_plan", value)}
      />
      <EditableSelect
        label="SOURCE"
        value={contact.source || "manual"}
        options={SOURCE_OPTIONS}
        onCommit={(value) => onSaveContact("source", value)}
      />
      <EditableSelect
        label="STATUS"
        value={contact.status || "lead"}
        options={STATUS_OPTIONS}
        onCommit={(value) => onSaveContact("status", value)}
      />
    </div>
  );
}

function LeadIntelFields({ intel, onSaveIntel }) {
  if (!intel) return <div className="contacts-muted">No lead intel received</div>;
  return (
    <div className="contacts-edit-grid contacts-fields-compact">
      <EditableField
        label="LEAD SCORE"
        type="number"
        value={intel.lead_score ?? ""}
        onCommit={(value) => onSaveIntel("lead_score", value)}
      />
      <EditableSelect
        label="CHURN RISK"
        value={intel.churn_risk || ""}
        options={CHURN_RISK_OPTIONS}
        onCommit={(value) => onSaveIntel("churn_risk", value)}
      />
      <EditableField
        label="VENDOR"
        value={intel.vendor_source || ""}
        onCommit={(value) => onSaveIntel("vendor_source", value)}
      />
      <EditableField
        label="RECEIVED"
        type="datetime-local"
        value={formatDateTimeInput(intel.received_at)}
        onCommit={(value) => onSaveIntel("received_at", value)}
      />
      <EditableTextarea label="PAYLOAD" rows={6} value={safeJson(intel.payload)} onCommit={(value) => onSaveIntel("payload", value)} />
    </div>
  );
}

function PoliciesFields({ policies, policyDraft, setPolicyDraft, onSavePolicy, onAddPolicy, saving }) {
  return (
    <div className="contacts-panel-stack">
      {policies.length === 0 ? <div className="contacts-muted">No policies on record</div> : null}
      {policies.map((policy) => (
        <div key={policy.id} className="contacts-policy-edit">
          <EditableSelect
            label="LINE"
            value={policy.product_line || "MA"}
            options={PRODUCT_LINE_OPTIONS}
            onCommit={(value) => onSavePolicy(policy, "product_line", value)}
          />
          <EditableField label="CARRIER" value={policy.carrier || ""} onCommit={(value) => onSavePolicy(policy, "carrier", value)} />
          <EditableField label="PLAN" value={policy.plan_name || ""} onCommit={(value) => onSavePolicy(policy, "plan_name", value)} />
          <EditableField label="PLAN ID" value={policy.plan_id || ""} onCommit={(value) => onSavePolicy(policy, "plan_id", value)} />
          <EditableField
            label="EFFECTIVE"
            type="date"
            value={formatDateInput(policy.effective_date)}
            onCommit={(value) => onSavePolicy(policy, "effective_date", value)}
          />
          <EditableSelect
            label="STATUS"
            value={policy.status || "pending"}
            options={POLICY_STATUS_OPTIONS}
            onCommit={(value) => onSavePolicy(policy, "status", value)}
          />
        </div>
      ))}
      <div className="contacts-policy-form">
        <select
          value={policyDraft.product_line}
          onChange={(event) => setPolicyDraft((prev) => ({ ...prev, product_line: event.target.value }))}
        >
          {PRODUCT_LINE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Carrier"
          value={policyDraft.carrier}
          onChange={(event) => setPolicyDraft((prev) => ({ ...prev, carrier: event.target.value }))}
        />
        <input
          type="text"
          placeholder="Plan"
          value={policyDraft.plan_name}
          onChange={(event) => setPolicyDraft((prev) => ({ ...prev, plan_name: event.target.value }))}
        />
        <input
          type="date"
          value={policyDraft.effective_date}
          onChange={(event) => setPolicyDraft((prev) => ({ ...prev, effective_date: event.target.value }))}
        />
        <select
          value={policyDraft.status}
          onChange={(event) => setPolicyDraft((prev) => ({ ...prev, status: event.target.value }))}
        >
          {POLICY_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" className="contacts-mini-btn" disabled={saving} onClick={onAddPolicy}>
          ADD POLICY
        </button>
      </div>
    </div>
  );
}

function RightPanel({
  contact,
  bundle,
  rightOpen,
  setRightOpen,
  rightTab,
  setRightTab,
  openSections,
  toggleSection,
  assignmentOptions,
  onSaveContact,
  onSaveMbiFull,
  onSaveIntel,
  onSavePolicy,
  onAddPolicy,
  policyDraft,
  setPolicyDraft,
  onStartCall,
  callFlow,
  setCallFlow,
  followUpDraft,
  setFollowUpDraft,
  onAddFollowUp,
  saving,
  revealed,
  revealing,
  onRequestReveal,
}) {
  if (!rightOpen) {
    return (
      <aside className="contacts-conv-right-collapsed">
        <button type="button" className="contacts-mini-btn" onClick={() => setRightOpen(true)}>
          DETAILS
        </button>
      </aside>
    );
  }

  return (
    <aside className="contacts-conv-right">
      <div className="contacts-right-panel-head">
        <span>CONTACT DETAILS</span>
        <div className="contacts-right-panel-head-actions">
          {contact ? (
            <button
              type="button"
              className="contacts-mini-btn pii-reveal-btn"
              onClick={onRequestReveal}
              disabled={revealing}
              title={revealed ? "PII revealed (auto-hides after 30s idle)" : "Reveal PII"}
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
              {revealed ? "HIDE PII" : "REVEAL PII"}
            </button>
          ) : null}
          <button type="button" className="contacts-mini-btn" onClick={() => setRightOpen(false)}>
            COLLAPSE
          </button>
        </div>
      </div>
      {!contact ? (
        <div className="contacts-muted">Select a contact</div>
      ) : (
        <>
          <div className="contacts-right-card">
            <span className="contacts-avatar contacts-avatar-large">{initialsFor(contact)}</span>
            <div>
              <strong>{contactDisplayName(contact)}</strong>
              <span>{contact.assigned_agent_id || "Unassigned"}</span>
            </div>
            <span className={`contacts-chip status-${contact.status}`}>{String(contact.status || "lead").toUpperCase()}</span>
          </div>
          <div className="contacts-right-tabs">
            {RIGHT_TABS.map((tab) => (
              <button
                type="button"
                key={tab}
                className={rightTab === tab ? "is-active" : ""}
                onClick={() => setRightTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="contacts-right-body">
            {rightTab === "ALL FIELDS" ? (
              <>
                <AccordionSection
                  id="contactInfo"
                  title="CONTACT INFO"
                  open={Boolean(openSections.contactInfo)}
                  onToggle={toggleSection}
                >
                  <ContactFields
                    contact={contact}
                    onSaveContact={onSaveContact}
                    onSaveMbiFull={onSaveMbiFull}
                    revealed={revealed}
                  />
                </AccordionSection>
                <AccordionSection
                  id="leadIntel"
                  title="LEAD INTEL"
                  open={Boolean(openSections.leadIntel)}
                  onToggle={toggleSection}
                >
                  <LeadIntelFields intel={bundle?.leadIntel?.[0] || null} onSaveIntel={onSaveIntel} />
                </AccordionSection>
                <AccordionSection
                  id="policies"
                  title="POLICIES"
                  meta={String(bundle?.policies?.length || 0)}
                  open={Boolean(openSections.policies)}
                  onToggle={toggleSection}
                >
                  <PoliciesFields
                    policies={bundle?.policies || []}
                    policyDraft={policyDraft}
                    setPolicyDraft={setPolicyDraft}
                    onSavePolicy={onSavePolicy}
                    onAddPolicy={onAddPolicy}
                    saving={saving}
                  />
                </AccordionSection>
              </>
            ) : null}
            {rightTab === "DND" ? (
              <div className="contacts-panel-stack">
                <ToggleField
                  label="DO NOT CALL"
                  checked={Boolean(contact.do_not_call)}
                  onCommit={(value) => onSaveContact("do_not_call", value)}
                />
                <dl className="contacts-meta-list">
                  <div>
                    <dt>CALLING</dt>
                    <dd>{contact.do_not_call ? "BLOCKED" : "ALLOWED"}</dd>
                  </div>
                  <div>
                    <dt>SMS</dt>
                    <dd>{contact.phone_last4 ? "AVAILABLE" : "NO PHONE"}</dd>
                  </div>
                  <div>
                    <dt>EMAIL</dt>
                    <dd>{contact.email_set ? "AVAILABLE" : "NO EMAIL"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {rightTab === "ACTIONS" ? (
              <div className="contacts-panel-stack">
                {onStartCall ? (
                  <div className="contacts-start-call-group">
                    <select
                      className="contacts-status-select"
                      value={callFlow}
                      onChange={(event) => setCallFlow(event.target.value)}
                      aria-label="Call flow"
                    >
                      {CALL_FLOWS.map((flow) => (
                        <option key={flow.id} value={flow.id}>
                          {flow.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="contacts-start-call-btn"
                      onClick={() => onStartCall(contact, callFlow)}
                      disabled={contact.do_not_call}
                    >
                      START CALL
                    </button>
                  </div>
                ) : null}
                <EditableSelect
                  label="ASSIGN AGENT"
                  value={contact.assigned_agent_id || ""}
                  options={assignmentOptions}
                  onCommit={(value) => onSaveContact("assigned_agent_id", value)}
                />
                <EditableSelect
                  label="STATUS"
                  value={contact.status || "lead"}
                  options={STATUS_OPTIONS}
                  onCommit={(value) => onSaveContact("status", value)}
                />
                <div className="contacts-inline-form contacts-followup-form">
                  <input
                    type="datetime-local"
                    value={followUpDraft.dueAt}
                    onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, dueAt: event.target.value }))}
                  />
                  <input
                    type="text"
                    placeholder="Reason"
                    value={followUpDraft.reason}
                    onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, reason: event.target.value }))}
                  />
                  <button type="button" className="contacts-mini-btn" disabled={saving} onClick={onAddFollowUp}>
                    ADD FOLLOW-UP
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}

export default function ContactsTab({ variant = "home", onStartCall = null, focusContact = null }) {
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("ALL");
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [centerTab, setCenterTab] = useState("CONVERSATIONS");
  const [rightTab, setRightTab] = useState("ALL FIELDS");
  const [rightOpen, setRightOpen] = usePersistedState("enrollgen_contacts_conversations_right_open_v1", true);
  const [openSections, setOpenSections] = usePersistedState("enrollgen_contacts_conversations_sections_v1", DEFAULT_SECTIONS);
  const [noteDraft, setNoteDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState({ dueAt: "", reason: "" });
  const [policyDraft, setPolicyDraft] = useState(DEFAULT_POLICY_DRAFT);
  const [callFlow, setCallFlow] = useState("ma");
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const { agentUuid } = useCurrentAgent();
  const { contacts, loading, error, refresh } = useContactsList(search, agentUuid);
  const { unreadByContact } = useUnreadMessages();
  const { bundle, loading: detailLoading, error: detailError, refresh: refreshDetail } = useContactDetail(selectedContactId);
  const { piiFields, revealed, revealing, reveal, hide, logCopy, patchField, updatePiiField, error: piiError } = useContactPii(selectedContactId, agentUuid);
  const {
    addNote,
    toggleNotePin,
    addFollowUp,
    updateContact,
    updateLeadIntel,
    addPolicy,
    updatePolicy,
  } = useContactMutations();
  const availability = useAvailability();

  useEffect(() => {
    if (focusContact?.id) {
      setSelectedContactId(focusContact.id);
      setCenterTab("CONVERSATIONS");
    }
  }, [focusContact?.id, focusContact?.ts]);

  const filteredContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      const left = new Date(latestTime(a) || 0).getTime();
      const right = new Date(latestTime(b) || 0).getTime();
      return right - left;
    });
    if (listFilter === "UNREAD") return sorted.filter((contact) => unreadByContact[contact.id]);
    return sorted;
  }, [contacts, listFilter, unreadByContact]);

  useEffect(() => {
    if (!selectedContactId && filteredContacts.length) {
      setSelectedContactId(filteredContacts[0].id);
    }
  }, [filteredContacts, selectedContactId]);

  useEffect(() => {
    setInlineError("");
    setNoteDraft("");
    setFollowUpDraft({ dueAt: "", reason: "" });
    setPolicyDraft(DEFAULT_POLICY_DRAFT);
  }, [selectedContactId]);

  const selectedListContact = contacts.find((contact) => contact.id === selectedContactId) || null;
  const baseSelectedContact = bundle?.contact || selectedListContact;
  const selectedContact = useMemo(
    () => (baseSelectedContact ? { ...baseSelectedContact, ...(revealed ? piiFields : null) } : null),
    [baseSelectedContact, revealed, piiFields]
  );

  const agentOptions = useMemo(() => {
    const agents = new Set();
    for (const contact of contacts) {
      if (contact.assigned_agent_id) agents.add(contact.assigned_agent_id);
    }
    if (selectedContact?.assigned_agent_id) agents.add(selectedContact.assigned_agent_id);
    return [
      { value: "", label: "UNASSIGNED" },
      ...Array.from(agents)
        .sort()
        .map((agent) => ({ value: agent, label: agent })),
    ];
  }, [contacts, selectedContact]);

  const toggleSection = useCallback((id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, [setOpenSections]);

  const refreshSelected = useCallback(async () => {
    await Promise.all([refresh(), selectedContactId ? refreshDetail() : Promise.resolve()]);
  }, [refresh, refreshDetail, selectedContactId]);

  const saveContactField = useCallback(
    async (field, value) => {
      if (!selectedContact) return;
      const next = normalizeContactValue(field, value);
      const current = normalizeContactValue(field, selectedContact[field]);
      if (valuesMatch(next, current)) return;
      setSaving(true);
      setInlineError("");
      try {
        await updateContact(selectedContact.id, { [field]: next });
        if (revealed && PII_FIELD_SET.has(field)) patchField(field, next);
        await refreshSelected();
      } catch (err) {
        console.error("[ContactsTab] contact save failed:", err);
        setInlineError(err.message || "Could not save contact.");
      } finally {
        setSaving(false);
      }
    },
    [selectedContact, updateContact, refreshSelected, revealed, patchField]
  );

  const saveMbiFull = useCallback(
    async (value) => {
      if (!selectedContact) return;
      const next = String(value ?? "").trim() || null;
      if (next === (selectedContact.mbi_full || null)) return;
      setSaving(true);
      setInlineError("");
      try {
        await updatePiiField("mbi_full", next);
        await refreshSelected();
      } catch (err) {
        console.error("[ContactsTab] mbi_full save failed:", err);
        setInlineError(err.message || "Could not save full MBI.");
      } finally {
        setSaving(false);
      }
    },
    [selectedContact, updatePiiField, refreshSelected]
  );

  const saveLeadIntelField = useCallback(
    async (field, value) => {
      const intel = bundle?.leadIntel?.[0];
      if (!intel) return;
      let next = value;
      if (field === "payload") {
        try {
          next = JSON.parse(value || "{}");
        } catch {
          setInlineError("Payload must be valid JSON.");
          return;
        }
      } else if (field === "lead_score") {
        next = cleanText(value) == null ? null : Number(value);
        if (next !== null && !Number.isFinite(next)) {
          setInlineError("Lead score must be a number.");
          return;
        }
      } else if (field === "received_at") {
        next = cleanText(value) ? new Date(value).toISOString() : null;
      } else {
        next = cleanText(value);
      }

      const current =
        field === "payload"
          ? safeJson(intel.payload)
          : field === "received_at"
            ? formatDateTimeInput(intel.received_at)
            : intel[field];
      if (field === "payload" && value === current) return;
      if (field === "received_at" && value === current) return;
      if (field !== "payload" && field !== "received_at" && valuesMatch(next, current)) return;

      setSaving(true);
      setInlineError("");
      try {
        await updateLeadIntel(intel.id, { [field]: next });
        await refreshSelected();
      } catch (err) {
        console.error("[ContactsTab] lead intel save failed:", err);
        setInlineError(err.message || "Could not save lead intel.");
      } finally {
        setSaving(false);
      }
    },
    [bundle, updateLeadIntel, refreshSelected]
  );

  const savePolicyField = useCallback(
    async (policy, field, value) => {
      const next = normalizePolicyValue(field, value);
      const current = normalizePolicyValue(field, policy[field]);
      if (valuesMatch(next, current)) return;
      setSaving(true);
      setInlineError("");
      try {
        await updatePolicy(policy.id, { [field]: next });
        await refreshSelected();
      } catch (err) {
        console.error("[ContactsTab] policy save failed:", err);
        setInlineError(err.message || "Could not save policy.");
      } finally {
        setSaving(false);
      }
    },
    [updatePolicy, refreshSelected]
  );

  const handleAddPolicy = useCallback(async () => {
    if (!selectedContact) return;
    const fields = {
      product_line: policyDraft.product_line || "MA",
      carrier: cleanText(policyDraft.carrier),
      plan_name: cleanText(policyDraft.plan_name),
      plan_id: cleanText(policyDraft.plan_id),
      effective_date: cleanText(policyDraft.effective_date),
      status: policyDraft.status || "pending",
    };
    if (!fields.carrier && !fields.plan_name && !fields.plan_id) return;
    setSaving(true);
    setInlineError("");
    try {
      await addPolicy({ contactId: selectedContact.id, fields });
      setPolicyDraft(DEFAULT_POLICY_DRAFT);
      await refreshSelected();
    } catch (err) {
      console.error("[ContactsTab] add policy failed:", err);
      setInlineError(err.message || "Could not add policy.");
    } finally {
      setSaving(false);
    }
  }, [selectedContact, policyDraft, addPolicy, refreshSelected]);

  const handleAddNote = useCallback(async () => {
    const body = noteDraft.trim();
    if (!body || !selectedContact) return;
    setSaving(true);
    setInlineError("");
    try {
      await addNote({ contactId: selectedContact.id, agentId: availability?.agentId || null, body });
      setNoteDraft("");
      await refreshSelected();
    } catch (err) {
      console.error("[ContactsTab] add note failed:", err);
      setInlineError(err.message || "Could not add note.");
    } finally {
      setSaving(false);
    }
  }, [noteDraft, selectedContact, addNote, availability?.agentId, refreshSelected]);

  const handleToggleNotePin = useCallback(
    async (noteId, pinned) => {
      setSaving(true);
      setInlineError("");
      try {
        await toggleNotePin(noteId, pinned);
        await refreshSelected();
      } catch (err) {
        console.error("[ContactsTab] note pin failed:", err);
        setInlineError(err.message || "Could not update note.");
      } finally {
        setSaving(false);
      }
    },
    [toggleNotePin, refreshSelected]
  );

  const handleAddFollowUp = useCallback(async () => {
    if (!followUpDraft.dueAt || !selectedContact) return;
    setSaving(true);
    setInlineError("");
    try {
      await addFollowUp({
        contactId: selectedContact.id,
        agentId: availability?.agentId || null,
        dueAt: new Date(followUpDraft.dueAt).toISOString(),
        reason: followUpDraft.reason.trim() || null,
      });
      setFollowUpDraft({ dueAt: "", reason: "" });
      await refreshSelected();
    } catch (err) {
      console.error("[ContactsTab] add follow-up failed:", err);
      setInlineError(err.message || "Could not add follow-up.");
    } finally {
      setSaving(false);
    }
  }, [followUpDraft, selectedContact, addFollowUp, availability?.agentId, refreshSelected]);

  const handleEmail = useCallback(async () => {
    if (!selectedContact?.email_set || typeof window === "undefined") return;
    const email = revealed ? selectedContact.email : (await reveal("view"))?.email;
    if (email) window.location.href = `mailto:${email}`;
  }, [selectedContact, revealed, reveal]);

  const shellClass = `contacts-tab contacts-conversations-tab${variant === "home" ? " contacts-tab--home" : ""}`;
  const timelineActivities = (bundle?.activities || []).filter((activity) => activity.type !== "call");

  return (
    <div className={shellClass} onCopy={() => revealed && logCopy()}>
      <div className="contacts-conv-shell">
        <ContactListPanel
          contacts={filteredContacts}
          selectedContactId={selectedContactId}
          unreadByContact={unreadByContact}
          loading={loading}
          search={search}
          setSearch={setSearch}
          filter={listFilter}
          setFilter={setListFilter}
          onSelectContact={(id) => {
            setSelectedContactId(id);
            setCenterTab("CONVERSATIONS");
          }}
        />

        <main className="contacts-conv-center">
          <CenterTopBar
            contact={selectedContact}
            onStartCall={onStartCall}
            onEmail={handleEmail}
            revealed={revealed}
            revealing={revealing}
            onRequestReveal={() => (revealed ? hide() : reveal("view"))}
            onCopy={logCopy}
          />
          <div className="contacts-workspace-tabs contacts-conv-center-tabs">
            {CENTER_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={centerTab === tab ? "is-active" : ""}
                onClick={() => setCenterTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {error ? <div className="ops-error">{error}</div> : null}
          {detailError ? <div className="ops-error">{detailError}</div> : null}
          {inlineError ? <div className="ops-error">{inlineError}</div> : null}
          {piiError ? <div className="ops-error">{piiError}</div> : null}
          <div className="contacts-conv-center-body">
            {!selectedContact ? <div className="contacts-muted">Select a conversation</div> : null}
            {selectedContact && detailLoading ? <div className="contacts-muted">Loading contact...</div> : null}
            {selectedContact && !detailLoading && centerTab === "CONVERSATIONS" ? (
              <MessagesThread
                contactId={selectedContact.id}
                agentId={availability?.agentId || null}
                activityItems={timelineActivities}
                callItems={bundle?.calls || []}
              />
            ) : null}
            {selectedContact && !detailLoading && centerTab === "ACTIVITY" ? <ActivityPanel bundle={bundle} /> : null}
            {selectedContact && !detailLoading && centerTab === "NOTES" ? (
              <NotesPanel
                notes={bundle?.notes || []}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                onAddNote={handleAddNote}
                onTogglePin={handleToggleNotePin}
                saving={saving}
              />
            ) : null}
          </div>
        </main>

        <RightPanel
          contact={selectedContact}
          bundle={bundle}
          rightOpen={rightOpen}
          setRightOpen={setRightOpen}
          rightTab={rightTab}
          setRightTab={setRightTab}
          openSections={openSections}
          toggleSection={toggleSection}
          assignmentOptions={agentOptions}
          onSaveContact={saveContactField}
          onSaveMbiFull={saveMbiFull}
          onSaveIntel={saveLeadIntelField}
          onSavePolicy={savePolicyField}
          onAddPolicy={handleAddPolicy}
          policyDraft={policyDraft}
          setPolicyDraft={setPolicyDraft}
          onStartCall={onStartCall}
          callFlow={callFlow}
          setCallFlow={setCallFlow}
          followUpDraft={followUpDraft}
          setFollowUpDraft={setFollowUpDraft}
          revealed={revealed}
          revealing={revealing}
          onRequestReveal={() => (revealed ? hide() : reveal("view"))}
          onAddFollowUp={handleAddFollowUp}
          saving={saving}
        />
      </div>
      {saving ? <span className="contacts-save-state">SAVING...</span> : null}
    </div>
  );
}
