import { useCallback, useEffect, useState } from "react";
import { useContactDetail, useContactMutations, contactDisplayName } from "../../hooks/useContacts";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import { useAvailability } from "../../context/AvailabilityContext";
import CallDetailPanel from "../callDetail/CallDetailPanel";
import MessagesThread from "./MessagesThread";

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

const ACTIVITY_LABELS = {
  call: "CALL",
  enrollment: "ENROLL",
  note: "NOTE",
  status_change: "STATUS",
  follow_up: "FOLLOW",
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
    <div className="contacts-section">
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

const CALL_FLOWS = [
  { id: "ma", label: "MA" },
  { id: "aca", label: "ACA" },
  { id: "medsup", label: "MS" },
  { id: "u65", label: "U65" },
  { id: "ancillary", label: "ANC" },
];

export default function ContactDetail({
  contactId,
  onBack,
  onStartCall = null,
  initialTab = null,
  initialTabKey = null,
}) {
  const { supabaseClient } = useTenantConfig();
  const { bundle, loading, error, refresh } = useContactDetail(contactId);
  const { addNote, toggleNotePin, addFollowUp, setFollowUpStatus, updateContact } = useContactMutations();
  const [noteDraft, setNoteDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState({ dueAt: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [callFlow, setCallFlow] = useState("ma");
  const [detailTab, setDetailTab] = useState(initialTab || "overview");
  const availability = useAvailability();

  // Deep links (e.g. clicking an SMS toast) can retarget the tab after
  // mount; initialTabKey changes per request.
  useEffect(() => {
    if (initialTab) setDetailTab(initialTab);
  }, [initialTab, initialTabKey]);

  const contact = bundle?.contact;

  const handleAddNote = useCallback(async () => {
    const body = noteDraft.trim();
    if (!body || !contact) return;
    setSaving(true);
    try {
      await addNote({ contactId: contact.id, body });
      setNoteDraft("");
      await refresh();
    } catch (err) {
      console.error("[ContactDetail] add note failed:", err);
    } finally {
      setSaving(false);
    }
  }, [noteDraft, contact, addNote, refresh]);

  const handleAddFollowUp = useCallback(async () => {
    if (!followUpDraft.dueAt || !contact) return;
    setSaving(true);
    try {
      await addFollowUp({
        contactId: contact.id,
        dueAt: new Date(followUpDraft.dueAt).toISOString(),
        reason: followUpDraft.reason.trim() || null,
      });
      setFollowUpDraft({ dueAt: "", reason: "" });
      await refresh();
    } catch (err) {
      console.error("[ContactDetail] add follow-up failed:", err);
    } finally {
      setSaving(false);
    }
  }, [followUpDraft, contact, addFollowUp, refresh]);

  const handleStatusChange = useCallback(
    async (nextStatus) => {
      if (!contact || nextStatus === contact.status) return;
      try {
        await updateContact(contact.id, { status: nextStatus });
        await refresh();
      } catch (err) {
        console.error("[ContactDetail] status change failed:", err);
      }
    },
    [contact, updateContact, refresh]
  );

  if (loading) return <div className="contacts-muted">Loading contact...</div>;
  if (error || !contact) return <div className="ops-error">⚠ {error || "Contact not found"}</div>;

  const latestIntel = bundle.leadIntel[0] || null;

  return (
    <div className="contacts-detail">
      <div className="contacts-detail-head">
        <button type="button" className="contacts-back" onClick={onBack}>
          ← CONTACTS
        </button>
        <div className="contacts-detail-title">
          <h2>{contactDisplayName(contact).toUpperCase()}</h2>
          <LeadIntelChips intel={latestIntel} />
          {bundle.policies.length ? (
            <div className="contacts-chip-row">
              {bundle.policies.slice(0, 4).map((policy) => (
                <span key={policy.id} className={`contacts-chip policy-${policy.status}`}>
                  {[policy.product_line, (policy.status || "").toUpperCase()]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              ))}
            </div>
          ) : null}
        </div>
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
              title={
                contact.do_not_call
                  ? "Contact is flagged do not call"
                  : "Open the call cockpit with this contact loaded"
              }
            >
              START CALL
            </button>
          </div>
        ) : null}
        <select
          className="contacts-status-select"
          value={contact.status}
          onChange={(event) => handleStatusChange(event.target.value)}
        >
          <option value="lead">LEAD</option>
          <option value="client">CLIENT</option>
          <option value="former">FORMER</option>
        </select>
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
      <div className="contacts-detail-grid">
        <div className="contacts-col">
          <div className="contacts-section">
            <div className="contacts-section-head">PROFILE</div>
            <dl className="contacts-profile">
              <div><dt>PHONE</dt><dd className="mono">{contact.phone || "--"}</dd></div>
              <div><dt>EMAIL</dt><dd>{contact.email || "--"}</dd></div>
              <div><dt>DOB</dt><dd className="mono">{fmtDate(contact.dob)}</dd></div>
              <div><dt>COUNTY</dt><dd>{[contact.county, contact.state].filter(Boolean).join(", ") || "--"}</dd></div>
              <div><dt>ZIP</dt><dd className="mono">{contact.zip || "--"}</dd></div>
              <div><dt>MBI</dt><dd className="mono">{contact.mbi_last4 ? `****${contact.mbi_last4}` : "--"}</dd></div>
              <div><dt>PARTS A/B</dt><dd>{(contact.medicare_parts || "--").toUpperCase()}</dd></div>
              <div><dt>CURRENT</dt><dd>{[contact.current_carrier, contact.current_plan].filter(Boolean).join(" / ") || "--"}</dd></div>
              <div><dt>SOURCE</dt><dd>{(contact.source || "--").toUpperCase()}</dd></div>
              <div><dt>AGENT</dt><dd>{contact.assigned_agent_id || "--"}</dd></div>
              {contact.do_not_call ? (
                <div><dt>DNC</dt><dd className="status-offline">DO NOT CALL</dd></div>
              ) : null}
            </dl>
          </div>

          <div className="contacts-section">
            <div className="contacts-section-head">POLICIES</div>
            {bundle.policies.length === 0 ? (
              <div className="contacts-muted">No policies on record</div>
            ) : (
              bundle.policies.map((policy) => (
                <div key={policy.id} className="contacts-policy-row">
                  <span>{policy.product_line || "--"}</span>
                  <span>{[policy.carrier, policy.plan_name].filter(Boolean).join(" ") || "--"}</span>
                  <span className="mono">{fmtDate(policy.effective_date)}</span>
                  <span className={`contacts-chip policy-${policy.status}`}>{(policy.status || "").toUpperCase()}</span>
                </div>
              ))
            )}
          </div>

          <div className="contacts-section">
            <div className="contacts-section-head">FOLLOW-UPS</div>
            {bundle.followUps.filter((item) => item.status === "open").length === 0 ? (
              <div className="contacts-muted">None open</div>
            ) : (
              bundle.followUps
                .filter((item) => item.status === "open")
                .map((item) => (
                  <div key={item.id} className="contacts-followup-row">
                    <span className="mono">{fmtDateTime(item.due_at)}</span>
                    <span>{item.reason || "--"}</span>
                    <button
                      type="button"
                      className="contacts-mini-btn"
                      onClick={() => setFollowUpStatus(item.id, "done").then(refresh)}
                    >
                      DONE
                    </button>
                  </div>
                ))
            )}
            <div className="contacts-inline-form">
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
              <button type="button" className="contacts-mini-btn" disabled={saving} onClick={handleAddFollowUp}>
                ADD
              </button>
            </div>
          </div>

          <div className="contacts-section">
            <div className="contacts-section-head">NOTES</div>
            {bundle.notes.map((note) => (
              <div key={note.id} className={`contacts-note${note.pinned ? " is-pinned" : ""}`}>
                <div className="contacts-note-meta">
                  <span className="mono">{fmtDateTime(note.created_at)}</span>
                  <button
                    type="button"
                    className="contacts-mini-btn"
                    onClick={() => toggleNotePin(note.id, !note.pinned).then(refresh)}
                  >
                    {note.pinned ? "UNPIN" : "PIN"}
                  </button>
                </div>
                <p>{note.body}</p>
              </div>
            ))}
            <div className="contacts-inline-form">
              <textarea
                rows={2}
                placeholder="Add note"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
              <button type="button" className="contacts-mini-btn" disabled={saving} onClick={handleAddNote}>
                SAVE
              </button>
            </div>
          </div>
        </div>

        <div className="contacts-col contacts-col-wide">
          <div className="contacts-section">
            <div className="contacts-section-head">TIMELINE</div>
            {bundle.activities.length === 0 ? (
              <div className="contacts-muted">No activity yet</div>
            ) : (
              <div className="contacts-timeline">
                {bundle.activities.map((activity) => (
                  <div key={activity.id} className="contacts-timeline-row">
                    <span className={`contacts-activity-tag tag-${activity.type}`}>
                      {ACTIVITY_LABELS[activity.type] || activity.type.toUpperCase()}
                    </span>
                    <span className="mono">{fmtDateTime(activity.occurred_at)}</span>
                    <span>{activity.summary || "--"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CallHistorySection calls={bundle.calls} supabaseClient={supabaseClient} />
        </div>
      </div>
      )}
    </div>
  );
}
