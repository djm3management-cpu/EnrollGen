import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone } from "lucide-react";
import { useContactDetail, useContactMutations, useContactPii, contactDisplayName } from "../../hooks/useContacts";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import { useCurrentAgent } from "../../hooks/useCurrentAgent";
import { useAvailability } from "../../context/AvailabilityContext";
import { useInboundCall } from "../../context/InboundCallContext";
import CallDetailPanel from "../callDetail/CallDetailPanel";
import MessagesThread from "./MessagesThread";

const PII_FIELD_SET = new Set(["first_name", "last_name", "dob", "phone", "email", "address", "mbi_full"]);

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

function fmtDate(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toISOString().slice(0, 10);
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

function valuesMatch(left, right) {
  if (typeof left === "boolean" || typeof right === "boolean") return Boolean(left) === Boolean(right);
  return String(left ?? "") === String(right ?? "");
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
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

const ACTIVITY_LABELS = {
  call: "CALL",
  enrollment: "ENROLL",
  note: "NOTE",
  status_change: "STATUS",
  follow_up: "FOLLOW",
};

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

const WORKSPACE_TABS = [
  { id: "conversations", label: "CONVERSATIONS" },
  { id: "activity", label: "ACTIVITY LOG" },
  { id: "notes", label: "NOTES" },
  { id: "calls", label: "CALL HISTORY" },
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
  tags: true,
  followUps: true,
  appointments: true,
};

const DEFAULT_POLICY_DRAFT = {
  product_line: "MA",
  carrier: "",
  plan_name: "",
  plan_id: "",
  effective_date: "",
  status: "pending",
  writing_agent_id: "",
};

function LeadIntelChips({ intel }) {
  if (!intel) return <span className="contacts-muted">No lead intel received</span>;
  return (
    <div className="contacts-chip-row">
      {intel.lead_score != null ? (
        <span className="contacts-chip contacts-chip-score">SCORE {Math.round(Number(intel.lead_score))}</span>
      ) : null}
      {intel.churn_risk ? (
        <span className={`contacts-chip contacts-chip-risk risk-${String(intel.churn_risk).toLowerCase()}`}>
          CHURN {String(intel.churn_risk).toUpperCase()}
        </span>
      ) : null}
      {intel.vendor_source ? (
        <span className="contacts-chip">{String(intel.vendor_source).toUpperCase()}</span>
      ) : null}
    </div>
  );
}

function EditableField({ label, value, type = "text", onCommit, placeholder = "", className = "", autoComplete }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = useCallback(() => {
    onCommit(draft);
  }, [draft, onCommit]);

  return (
    <label className={`contacts-edit-field ${className}`.trim()}>
      <span>{label}</span>
      <input
        className="contacts-edit-input"
        type={type}
        value={draft}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
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

  const commit = useCallback(() => {
    onCommit(draft);
  }, [draft, onCommit]);

  return (
    <label className={`contacts-edit-field ${className}`.trim()}>
      <span>{label}</span>
      <select
        className="contacts-edit-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
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

  const commit = useCallback(() => {
    onCommit(draft);
  }, [draft, onCommit]);

  return (
    <label className="contacts-edit-field contacts-edit-field-wide">
      <span>{label}</span>
      <textarea
        className="contacts-edit-input contacts-edit-textarea"
        rows={rows}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
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

function ContactCard({
  contact,
  latestIntel,
  policies,
  callFlow,
  setCallFlow,
  onStartCall,
  onSaveField,
  onSendMessage,
}) {
  return (
    <section className="contacts-ghl-card">
      <div className="contacts-ghl-card-main">
        <div className="contacts-card-name">
          <EditableField
            label="FIRST NAME"
            value={contact.first_name || ""}
            onCommit={(value) => onSaveField("first_name", value)}
          />
          <EditableField
            label="LAST NAME"
            value={contact.last_name || ""}
            onCommit={(value) => onSaveField("last_name", value)}
          />
        </div>
        <div className="contacts-card-quick">
          <EditableField
            label="PHONE"
            value={contact.phone || ""}
            onCommit={(value) => onSaveField("phone", value)}
          />
          <EditableField
            label="EMAIL"
            type="email"
            value={contact.email || ""}
            onCommit={(value) => onSaveField("email", value)}
          />
          <EditableSelect
            label="STATUS"
            value={contact.status || "lead"}
            options={STATUS_OPTIONS}
            onCommit={(value) => onSaveField("status", value)}
          />
          <EditableField
            label="AGENT"
            value={contact.assigned_agent_id || ""}
            onCommit={(value) => onSaveField("assigned_agent_id", value)}
          />
          <ToggleField
            label="DND"
            checked={Boolean(contact.do_not_call)}
            onCommit={(value) => onSaveField("do_not_call", value)}
          />
        </div>
        <div className="contacts-card-intel">
          <LeadIntelChips intel={latestIntel} />
          {policies.length ? (
            <div className="contacts-chip-row">
              {policies.slice(0, 4).map((policy) => (
                <span key={policy.id} className={`contacts-chip policy-${policy.status}`}>
                  {[policy.product_line, (policy.status || "").toUpperCase()].filter(Boolean).join(" ")}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="contacts-ghl-actions">
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
              title={contact.do_not_call ? "Contact is flagged do not call" : "Open the call cockpit"}
            >
              START CALL
            </button>
          </div>
        ) : null}
        <button type="button" className="contacts-mini-btn contacts-message-btn" onClick={onSendMessage}>
          SEND MESSAGE
        </button>
      </div>
    </section>
  );
}

function ContactInfoPanel({ contact, onSaveField, onSaveMbiFull }) {
  return (
    <div className="contacts-edit-grid">
      <EditableField
        label="FIRST NAME"
        value={contact.first_name || ""}
        onCommit={(value) => onSaveField("first_name", value)}
      />
      <EditableField
        label="LAST NAME"
        value={contact.last_name || ""}
        onCommit={(value) => onSaveField("last_name", value)}
      />
      <EditableField
        label="PHONE"
        value={contact.phone || ""}
        onCommit={(value) => onSaveField("phone", value)}
      />
      <EditableField
        label="EMAIL"
        type="email"
        value={contact.email || ""}
        onCommit={(value) => onSaveField("email", value)}
      />
      <EditableField
        label="DOB"
        type="date"
        value={formatDateInput(contact.dob)}
        autoComplete="off"
        onCommit={(value) => onSaveField("dob", value)}
      />
      <EditableField label="COUNTY" value={contact.county || ""} onCommit={(value) => onSaveField("county", value)} />
      <EditableField label="STATE" value={contact.state || ""} onCommit={(value) => onSaveField("state", value)} />
      <EditableField label="ZIP" value={contact.zip || ""} onCommit={(value) => onSaveField("zip", value)} />
      <EditableField
        label="MBI LAST 4"
        value={contact.mbi_last4 || ""}
        autoComplete="off"
        onCommit={(value) => onSaveField("mbi_last4", value)}
      />
      <EditableField
        label="MBI (FULL)"
        value={contact.mbi_full || ""}
        placeholder={!contact.mbi_full ? "Not on file — enter full MBI" : ""}
        autoComplete="off"
        onCommit={(value) => onSaveMbiFull(value)}
      />
      <EditableSelect
        label="PARTS A/B"
        value={contact.medicare_parts || "none"}
        options={MEDICARE_PART_OPTIONS}
        onCommit={(value) => onSaveField("medicare_parts", value)}
      />
      <EditableField
        label="CURRENT CARRIER"
        value={contact.current_carrier || ""}
        onCommit={(value) => onSaveField("current_carrier", value)}
      />
      <EditableField
        label="CURRENT PLAN"
        value={contact.current_plan || ""}
        onCommit={(value) => onSaveField("current_plan", value)}
      />
      <EditableSelect
        label="SOURCE"
        value={contact.source || "manual"}
        options={SOURCE_OPTIONS}
        onCommit={(value) => onSaveField("source", value)}
      />
      <EditableSelect
        label="STATUS"
        value={contact.status || "lead"}
        options={STATUS_OPTIONS}
        onCommit={(value) => onSaveField("status", value)}
      />
      <EditableField
        label="AGENT"
        value={contact.assigned_agent_id || ""}
        onCommit={(value) => onSaveField("assigned_agent_id", value)}
      />
      <ToggleField
        label="DND"
        checked={Boolean(contact.do_not_call)}
        onCommit={(value) => onSaveField("do_not_call", value)}
      />
    </div>
  );
}

function LeadIntelPanel({ intel, onSaveField }) {
  if (!intel) return <div className="contacts-muted">No lead intel received</div>;

  return (
    <div className="contacts-edit-grid">
      <EditableField
        label="LEAD SCORE"
        type="number"
        value={intel.lead_score ?? ""}
        onCommit={(value) => onSaveField("lead_score", value)}
      />
      <EditableSelect
        label="CHURN RISK"
        value={intel.churn_risk || ""}
        options={CHURN_RISK_OPTIONS}
        onCommit={(value) => onSaveField("churn_risk", value)}
      />
      <EditableField
        label="VENDOR SOURCE"
        value={intel.vendor_source || ""}
        onCommit={(value) => onSaveField("vendor_source", value)}
      />
      <EditableField
        label="RECEIVED"
        type="datetime-local"
        value={formatDateTimeInput(intel.received_at)}
        onCommit={(value) => onSaveField("received_at", value)}
      />
      <EditableTextarea label="PAYLOAD" rows={8} value={safeJson(intel.payload)} onCommit={(value) => onSaveField("payload", value)} />
      <dl className="contacts-meta-list">
        <div>
          <dt>CREATED</dt>
          <dd className="mono">{fmtDateTime(intel.created_at)}</dd>
        </div>
        <div>
          <dt>UPDATED</dt>
          <dd className="mono">{fmtDateTime(intel.updated_at)}</dd>
        </div>
      </dl>
    </div>
  );
}

function PoliciesPanel({ policies, policyDraft, setPolicyDraft, onAddPolicy, saving }) {
  return (
    <div className="contacts-panel-stack">
      {policies.length === 0 ? (
        <div className="contacts-muted">No policies on record</div>
      ) : (
        policies.map((policy) => (
          <div key={policy.id} className="contacts-policy-row">
            <span>{policy.product_line || "--"}</span>
            <span>{[policy.carrier, policy.plan_name].filter(Boolean).join(" ") || "--"}</span>
            <span className="mono">{fmtDate(policy.effective_date)}</span>
            <span className={`contacts-chip policy-${policy.status}`}>{(policy.status || "").toUpperCase()}</span>
          </div>
        ))
      )}
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
          type="text"
          placeholder="Plan ID"
          value={policyDraft.plan_id}
          onChange={(event) => setPolicyDraft((prev) => ({ ...prev, plan_id: event.target.value }))}
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

function TagsPanel({ contact }) {
  const labels = useMemo(() => {
    const raw = contact?.tags || contact?.labels || [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) return raw.split(",").map((item) => item.trim()).filter(Boolean);
    return [];
  }, [contact]);

  if (!labels.length) return <div className="contacts-muted">No labels configured</div>;
  return (
    <div className="contacts-chip-row">
      {labels.map((label) => (
        <span key={label} className="contacts-chip">
          {String(label).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function ActivityLogPanel({ activities }) {
  if (activities.length === 0) return <div className="contacts-muted">No activity yet</div>;
  return (
    <div className="contacts-timeline contacts-timeline-workspace">
      {activities.map((activity) => (
        <div key={activity.id} className="contacts-timeline-row">
          <span className={`contacts-activity-tag tag-${activity.type}`}>
            {ACTIVITY_LABELS[activity.type] || String(activity.type).toUpperCase()}
          </span>
          <span className="mono">{fmtDateTime(activity.occurred_at)}</span>
          <span>{activity.summary || "--"}</span>
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

function FollowUpsPanel({ followUps, followUpDraft, setFollowUpDraft, onAddFollowUp, onSetStatus, saving }) {
  const openItems = followUps.filter((item) => item.status === "open");

  return (
    <div className="contacts-panel-stack">
      {openItems.length === 0 ? (
        <div className="contacts-muted">None open</div>
      ) : (
        openItems.map((item) => (
          <div key={item.id} className="contacts-followup-row">
            <span className="mono">{fmtDateTime(item.due_at)}</span>
            <span>{item.reason || "--"}</span>
            <button type="button" className="contacts-mini-btn" onClick={() => onSetStatus(item.id, "done")}>
              DONE
            </button>
          </div>
        ))
      )}
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
          ADD
        </button>
      </div>
    </div>
  );
}

function AppointmentsPanel() {
  return <div className="contacts-muted">Appointments not configured</div>;
}

function CallHistorySection({ calls, supabaseClient }) {
  const [expandedCallId, setExpandedCallId] = useState(null);
  const [details, setDetails] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const handleSelect = useCallback(
    async (callId) => {
      const next = expandedCallId === callId ? null : callId;
      setExpandedCallId(next);
      if (!next || details[callId]) return;
      setLoadingId(callId);
      try {
        const { data: callRecord, error } = await supabaseClient
          .from("call_records")
          .select("id, transcript_raw, transcript_diarized, dg_sentiment, dg_intents, dg_topics, dg_summary, call_analytics, agent_assessment, beneficiary_risk, call_duration_seconds, carrier_name, plan_name, effective_date, call_start, compliance_scorecard_id")
          .eq("id", callId)
          .single();
        if (error) throw error;
        const { data: scorecards } = await supabaseClient
          .from("compliance_scorecards")
          .select("id, overall_score, overall_grade, pass_fail, auto_fail_triggered, auto_fail_reasons, category_scores, risk_flags, coaching_notes, created_at")
          .eq("call_id", callId)
          .order("created_at", { ascending: false })
          .limit(1);
        setDetails((prev) => ({ ...prev, [callId]: { ...callRecord, scorecard: scorecards?.[0] || null } }));
      } catch (err) {
        console.error("[ContactDetail] call detail load failed:", err);
      } finally {
        setLoadingId(null);
      }
    },
    [expandedCallId, details, supabaseClient]
  );

  return (
    <div className="contacts-section contacts-call-history-section">
      <div className="contacts-section-head">CALL HISTORY</div>
      {calls.length === 0 ? (
        <div className="contacts-muted">No calls on record</div>
      ) : (
        calls.map((call) => (
          <div key={call.id} className="contacts-call-row-wrap">
            <button type="button" className="contacts-call-row" onClick={() => handleSelect(call.id)}>
              <span className="mono">{fmtDateTime(call.call_start)}</span>
              <span>{call.product_type || "--"}</span>
              <span>{call.carrier_name || "--"}</span>
              <span className="mono">{fmtDuration(call.call_duration_seconds)}</span>
              <span className={call.enrollment_completed ? "status-live" : "contacts-muted"}>
                {call.enrollment_completed ? "ENROLLED" : (call.call_outcome || "--").toUpperCase()}
              </span>
            </button>
            {expandedCallId === call.id ? (
              <CallDetailPanel detail={details[call.id]} loading={loadingId === call.id} />
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

export default function ContactDetail({
  contactId,
  onBack,
  onStartCall = null,
  initialTab = null,
  initialTabKey = null,
}) {
  const { supabaseClient } = useTenantConfig();
  const { bundle, loading, error, refresh } = useContactDetail(contactId);
  const { agentUuid } = useCurrentAgent();
  const { piiFields, reload: reloadPii, logCopy, patchField, updatePiiField, error: piiError } = useContactPii(contactId, agentUuid);
  const {
    addNote,
    toggleNotePin,
    addFollowUp,
    setFollowUpStatus,
    updateContact,
    updateLeadIntel,
    addPolicy,
  } = useContactMutations();
  const [noteDraft, setNoteDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState({ dueAt: "", reason: "" });
  const [policyDraft, setPolicyDraft] = useState(DEFAULT_POLICY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [callFlow, setCallFlow] = useState("ma");
  const [detailTab, setDetailTab] = useState(initialTab || "overview");
  const [workspaceTab, setWorkspaceTab] = useState("conversations");
  const [openSections, setOpenSections] = usePersistedState("enrollgen_contact_detail_sections_v1", DEFAULT_SECTIONS);
  const [rightPanelOpen, setRightPanelOpen] = usePersistedState("enrollgen_contact_detail_right_panel_v1", true);
  const availability = useAvailability();
  const inboundCall = useInboundCall();
  const [dialingContact, setDialingContact] = useState(false);

  useEffect(() => {
    if (initialTab) setDetailTab(initialTab);
  }, [initialTab, initialTabKey]);

  useEffect(() => {
    setInlineError("");
    setNoteDraft("");
    setFollowUpDraft({ dueAt: "", reason: "" });
    setPolicyDraft(DEFAULT_POLICY_DRAFT);
    setWorkspaceTab("conversations");
  }, [contactId]);

  const contact = useMemo(
    () => (bundle?.contact ? { ...bundle.contact, ...piiFields } : null),
    [bundle?.contact, piiFields]
  );
  const latestIntel = bundle?.leadIntel?.[0] || null;

  const toggleSection = useCallback((id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, [setOpenSections]);

  const saveContactField = useCallback(
    async (field, value) => {
      if (!contact) return;
      const next = normalizeContactValue(field, value);
      const current = normalizeContactValue(field, contact[field]);
      if (valuesMatch(next, current)) return;

      setSaving(true);
      setInlineError("");
      try {
        await updateContact(contact.id, { [field]: next });
        if (PII_FIELD_SET.has(field)) patchField(field, next);
        await refresh();
      } catch (err) {
        console.error("[ContactDetail] contact field save failed:", err);
        setInlineError(err.message || "Could not save contact field.");
      } finally {
        setSaving(false);
      }
    },
    [contact, updateContact, refresh, patchField]
  );

  const saveMbiFull = useCallback(
    async (value) => {
      if (!contact) return;
      const next = String(value ?? "").trim() || null;
      if (next === (contact.mbi_full || null)) return;

      setSaving(true);
      setInlineError("");
      try {
        await updatePiiField("mbi_full", next);
        await refresh();
      } catch (err) {
        console.error("[ContactDetail] mbi_full save failed:", err);
        setInlineError(err.message || "Could not save full MBI.");
      } finally {
        setSaving(false);
      }
    },
    [contact, updatePiiField, refresh]
  );

  const saveLeadIntelField = useCallback(
    async (field, value) => {
      if (!latestIntel) return;

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
          ? safeJson(latestIntel.payload)
          : field === "received_at"
            ? formatDateTimeInput(latestIntel.received_at)
            : latestIntel[field];
      if (field === "payload" && value === current) return;
      if (field === "received_at" && value === current) return;
      if (field !== "payload" && field !== "received_at" && valuesMatch(next, current)) return;

      setSaving(true);
      setInlineError("");
      try {
        await updateLeadIntel(latestIntel.id, { [field]: next });
        await refresh();
      } catch (err) {
        console.error("[ContactDetail] lead intel save failed:", err);
        setInlineError(err.message || "Could not save lead intel.");
      } finally {
        setSaving(false);
      }
    },
    [latestIntel, updateLeadIntel, refresh]
  );

  const handleAddNote = useCallback(async () => {
    const body = noteDraft.trim();
    if (!body || !contact) return;
    setSaving(true);
    setInlineError("");
    try {
      await addNote({ contactId: contact.id, agentId: availability?.agentId || null, body });
      setNoteDraft("");
      await refresh();
    } catch (err) {
      console.error("[ContactDetail] add note failed:", err);
      setInlineError(err.message || "Could not add note.");
    } finally {
      setSaving(false);
    }
  }, [noteDraft, contact, addNote, availability?.agentId, refresh]);

  const handleToggleNotePin = useCallback(
    async (noteId, pinned) => {
      setSaving(true);
      setInlineError("");
      try {
        await toggleNotePin(noteId, pinned);
        await refresh();
      } catch (err) {
        console.error("[ContactDetail] note pin failed:", err);
        setInlineError(err.message || "Could not update note.");
      } finally {
        setSaving(false);
      }
    },
    [toggleNotePin, refresh]
  );

  const handleAddFollowUp = useCallback(async () => {
    if (!followUpDraft.dueAt || !contact) return;
    setSaving(true);
    setInlineError("");
    try {
      await addFollowUp({
        contactId: contact.id,
        agentId: availability?.agentId || null,
        dueAt: new Date(followUpDraft.dueAt).toISOString(),
        reason: followUpDraft.reason.trim() || null,
      });
      setFollowUpDraft({ dueAt: "", reason: "" });
      await refresh();
    } catch (err) {
      console.error("[ContactDetail] add follow-up failed:", err);
      setInlineError(err.message || "Could not add follow-up.");
    } finally {
      setSaving(false);
    }
  }, [followUpDraft, contact, addFollowUp, availability?.agentId, refresh]);

  const handleFollowUpStatus = useCallback(
    async (followUpId, status) => {
      setSaving(true);
      setInlineError("");
      try {
        await setFollowUpStatus(followUpId, status);
        await refresh();
      } catch (err) {
        console.error("[ContactDetail] follow-up status failed:", err);
        setInlineError(err.message || "Could not update follow-up.");
      } finally {
        setSaving(false);
      }
    },
    [setFollowUpStatus, refresh]
  );

  const handleAddPolicy = useCallback(async () => {
    if (!contact) return;
    const fields = {
      product_line: policyDraft.product_line || "MA",
      carrier: cleanText(policyDraft.carrier),
      plan_name: cleanText(policyDraft.plan_name),
      plan_id: cleanText(policyDraft.plan_id),
      effective_date: cleanText(policyDraft.effective_date),
      status: policyDraft.status || "pending",
      writing_agent_id: cleanText(policyDraft.writing_agent_id),
    };
    if (!fields.carrier && !fields.plan_name && !fields.plan_id) return;

    setSaving(true);
    setInlineError("");
    try {
      await addPolicy({ contactId: contact.id, fields });
      setPolicyDraft(DEFAULT_POLICY_DRAFT);
      await refresh();
    } catch (err) {
      console.error("[ContactDetail] add policy failed:", err);
      setInlineError(err.message || "Could not add policy.");
    } finally {
      setSaving(false);
    }
  }, [contact, policyDraft, addPolicy, refresh]);

  const handleClickToCall = useCallback(async () => {
    if (!contact?.phone_last4 || dialingContact) return;
    setDialingContact(true);
    try {
      const phone = contact.phone || (await reloadPii())?.phone;
      if (!phone) throw new Error("Could not resolve phone number.");
      await inboundCall?.makeCall({
        phoneNumber: phone,
        contactId: contact.id,
        contactName: contactDisplayName(contact),
      });
    } catch (err) {
      console.error("[ContactDetail] click-to-call failed:", err);
      setInlineError(err.message || "Could not place call.");
    } finally {
      setDialingContact(false);
    }
  }, [contact, dialingContact, inboundCall, reloadPii]);

  if (loading) return <div className="contacts-muted">Loading contact...</div>;
  if (error || !contact) return <div className="ops-error">{error || "Contact not found"}</div>;

  return (
    <div className="contacts-detail contacts-detail-ghl" onCopy={() => logCopy()}>
      <div className="contacts-detail-head">
        <button type="button" className="contacts-back" onClick={onBack}>
          BACK TO CONTACTS
        </button>
        <div className="contacts-detail-title">
          <h2>{contactDisplayName(contact).toUpperCase()}</h2>
          <span className={`contacts-chip status-${contact.status}`}>{String(contact.status || "lead").toUpperCase()}</span>
          {saving ? <span className="contacts-muted">Saving...</span> : null}
          {inboundCall && contact.phone_last4 ? (
            <button
              type="button"
              className="contacts-detail-call-btn"
              onClick={handleClickToCall}
              disabled={dialingContact || contact.do_not_call}
              title={contact.do_not_call ? "Contact is flagged do not call" : `Call ${contact.phone || contact.phone_last4}`}
              aria-label={`Call ${contactDisplayName(contact)}`}
            >
              <Phone size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="contacts-detail-tabs">
        {["overview", "messages"].map((tab) => (
          <button
            key={tab}
            type="button"
            className={detailTab === tab ? "is-active" : ""}
            onClick={() => setDetailTab(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {detailTab === "messages" ? (
        <MessagesThread contactId={contact.id} agentId={availability?.agentId || null} />
      ) : (
        <>
          <ContactCard
            contact={contact}
            latestIntel={latestIntel}
            policies={bundle.policies}
            callFlow={callFlow}
            setCallFlow={setCallFlow}
            onStartCall={onStartCall}
            onSaveField={saveContactField}
            onSendMessage={() => {
              setDetailTab("overview");
              setWorkspaceTab("conversations");
            }}
          />
          {inlineError ? <div className="ops-error">{inlineError}</div> : null}
          {piiError ? <div className="ops-error">{piiError}</div> : null}

          <div className={`contacts-ghl-layout${rightPanelOpen ? "" : " is-right-collapsed"}`}>
            <aside className="contacts-ghl-panel contacts-ghl-left contacts-ghl-panel-scroll">
              <AccordionSection
                id="contactInfo"
                title="CONTACT INFO"
                open={Boolean(openSections.contactInfo)}
                onToggle={toggleSection}
              >
                <ContactInfoPanel
                  contact={contact}
                  onSaveField={saveContactField}
                  onSaveMbiFull={saveMbiFull}
                />
              </AccordionSection>
              <AccordionSection
                id="leadIntel"
                title="LEAD INTEL"
                open={Boolean(openSections.leadIntel)}
                onToggle={toggleSection}
              >
                <LeadIntelPanel intel={latestIntel} onSaveField={saveLeadIntelField} />
              </AccordionSection>
              <AccordionSection
                id="policies"
                title="POLICIES"
                meta={String(bundle.policies.length)}
                open={Boolean(openSections.policies)}
                onToggle={toggleSection}
              >
                <PoliciesPanel
                  policies={bundle.policies}
                  policyDraft={policyDraft}
                  setPolicyDraft={setPolicyDraft}
                  onAddPolicy={handleAddPolicy}
                  saving={saving}
                />
              </AccordionSection>
              <AccordionSection
                id="tags"
                title="TAGS/LABELS"
                open={Boolean(openSections.tags)}
                onToggle={toggleSection}
              >
                <TagsPanel contact={contact} />
              </AccordionSection>
            </aside>

            <main className="contacts-ghl-center">
              <div className="contacts-workspace-tabs">
                {WORKSPACE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={workspaceTab === tab.id ? "is-active" : ""}
                    onClick={() => setWorkspaceTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="contacts-workspace-body">
                {workspaceTab === "conversations" ? (
                  <MessagesThread contactId={contact.id} agentId={availability?.agentId || null} />
                ) : null}
                {workspaceTab === "activity" ? <ActivityLogPanel activities={bundle.activities} /> : null}
                {workspaceTab === "notes" ? (
                  <NotesPanel
                    notes={bundle.notes}
                    noteDraft={noteDraft}
                    setNoteDraft={setNoteDraft}
                    onAddNote={handleAddNote}
                    onTogglePin={handleToggleNotePin}
                    saving={saving}
                  />
                ) : null}
                {workspaceTab === "calls" ? (
                  <CallHistorySection calls={bundle.calls} supabaseClient={supabaseClient} />
                ) : null}
              </div>
            </main>

            {rightPanelOpen ? (
              <aside className="contacts-ghl-panel contacts-ghl-right contacts-ghl-panel-scroll">
                <div className="contacts-right-panel-head">
                  <span>RIGHT PANEL</span>
                  <button type="button" className="contacts-mini-btn" onClick={() => setRightPanelOpen(false)}>
                    COLLAPSE
                  </button>
                </div>
                <AccordionSection
                  id="followUps"
                  title="FOLLOW-UPS"
                  meta={String(bundle.followUps.filter((item) => item.status === "open").length)}
                  open={Boolean(openSections.followUps)}
                  onToggle={toggleSection}
                >
                  <FollowUpsPanel
                    followUps={bundle.followUps}
                    followUpDraft={followUpDraft}
                    setFollowUpDraft={setFollowUpDraft}
                    onAddFollowUp={handleAddFollowUp}
                    onSetStatus={handleFollowUpStatus}
                    saving={saving}
                  />
                </AccordionSection>
                <AccordionSection
                  id="appointments"
                  title="APPOINTMENTS"
                  open={Boolean(openSections.appointments)}
                  onToggle={toggleSection}
                >
                  <AppointmentsPanel />
                </AccordionSection>
              </aside>
            ) : (
              <aside className="contacts-ghl-right-collapsed">
                <button type="button" className="contacts-mini-btn" onClick={() => setRightPanelOpen(true)}>
                  OPEN FOLLOW-UPS
                </button>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
