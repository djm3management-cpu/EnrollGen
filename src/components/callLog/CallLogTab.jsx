import CallTranscriptPlayer from "./CallTranscriptPlayer";
import CallNotesEditor from "./CallNotesEditor";
import CallDateRangePicker from "./CallDateRangePicker";
import CallLogIconSelect from "./CallLogIconSelect";
import { debugLog } from "../../lib/debugLog.js";
import { useAppAuth } from "../../context/AuthContext";
import { loadCallLogPages } from "../../lib/callLogApi";
import RecordingPanel from "../callDetail/RecordingPanel";
import CallRecordings from "./CallRecordings";
import { ArrowLeftRight, Download, FileAudio, PhoneCall, RefreshCw, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import { CALL_OUTCOME_OPTIONS } from "../../lib/postCallPipeline";
import { ANCILLARY_PRODUCT_OPTIONS, buildCallOutcomePatch } from "../../lib/ancillarySale.js";
import CallDetailPanel from "../callDetail/CallDetailPanel";
import ComplianceReviewModal from "../callDetail/ComplianceReviewModal";
import { CreateOpportunityButton } from "../opportunities/ContactOpportunities";

import { useCallLogRows } from "../../hooks/useCallLogRows";
import { formatCallDateTime as fmtDateTime, formatTalk as fmtDuration } from "../../lib/callPresentation";
import { crmPath } from "../../lib/crmRoutes";
import { CallDirection, ComplianceChip, CallStatusOutcome, RecordingCell } from "./CallRowParts";
import { callsCsv, downloadCsv } from "../../lib/csv";

const ENROLLED_OUTCOMES = new Set(["enrolled", "enrolled_pending_verification"]);
const PAGE_SIZE = 50;
const DISPOSITION_FILTERS = ["ALL", "CONNECTED", "VOICEMAIL", "MISSED", "DECLINED"];
const DIRECTION_FILTERS = ["ALL", "INBOUND", "OUTBOUND"];

function CallOutcomeEditor({ callRecordId, outcome, productType, supabaseClient, onChanged, disabled = false }) {
  const [saving, setSaving] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState(outcome || "");
  const [selectedProduct, setSelectedProduct] = useState(productType || "");
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedOutcome(outcome || "");
    setSelectedProduct(productType || "");
  }, [outcome, productType]);

  const saveOutcome = useCallback(
    async (value, product) => {
      setError("");
      setSaving(true);
      try {
        const patch = buildCallOutcomePatch(value, product);
        const { error } = await supabaseClient
          .from("call_records")
          .update(patch)
          .eq("id", callRecordId)
          .select("id")
          .single();
        if (error) throw error;
        onChanged(value, patch.ancillary_product_type);
        window.dispatchEvent(new Event('crm-calls-updated'));
      } catch (error) {
        if (value !== "sale_ancillary") {
          setSelectedOutcome(outcome || "");
          setSelectedProduct(productType || "");
        }
        setError(error?.message || "Unable to save call outcome.");
        debugLog("[CallLog] call_outcome update failed");
      } finally {
        setSaving(false);
      }
    },
    [callRecordId, supabaseClient, onChanged, outcome, productType]
  );

  return (
    <>
    <select
      className="contacts-status-select"
      value={selectedOutcome}
      disabled={saving || disabled}
      onChange={(event) => {
        const value = event.target.value;
        setSelectedOutcome(value);
        setError("");
        void saveOutcome(value, value === "sale_ancillary" ? selectedProduct : null);
      }}
      aria-label="Call outcome"
    >
      <option value="" disabled>Select outcome...</option>
      {CALL_OUTCOME_OPTIONS.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
    {selectedOutcome === "sale_ancillary" && (
      <div className="grid post-call-wrap-grid">
        <label>
          Ancillary Product Type
          <select
            className="contacts-status-select"
            value={selectedProduct}
            disabled={saving || disabled}
            onChange={(event) => setSelectedProduct(event.target.value)}
          >
            <option value="">Select product type</option>
            {ANCILLARY_PRODUCT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="contacts-mini-btn"
          disabled={saving || disabled}
          onClick={() => void saveOutcome(selectedOutcome, selectedProduct)}
        >{saving ? "SAVING..." : "SAVE OUTCOME"}</button>
      </div>
    )}
    {error && <div className="ops-error" role="alert">{error}</div>}
    </>
  );
}

function ExpandedRow({ row, supabaseClient, playRequest }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(Boolean(row.call_record_id));
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [showComplianceReview, setShowComplianceReview] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailGeneration = useRef(0);

  const loadDetail = useCallback(async () => {
    const generation = ++detailGeneration.current;
    setDetailError("");
    if (!row.call_record_id || !supabaseClient) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: callRecord, error } = await supabaseClient
        .from("call_records")
        .select("id, transcript_raw, transcript_diarized, dg_sentiment, dg_intents, dg_topics, dg_summary, call_analytics, agent_assessment, beneficiary_risk, call_duration_seconds, carrier_name, plan_name, effective_date, call_start, agent_notes, compliance_scorecard_id, call_outcome, ancillary_product_type")
        .eq("id", row.call_record_id)
        .single();
      if (error) throw error;
      const { data: scorecards } = await supabaseClient
        .from("compliance_scorecards")
        .select("id, overall_score, overall_grade, pass_fail, auto_fail_triggered, auto_fail_reasons, category_scores, risk_flags, coaching_notes, created_at")
        .eq("call_id", row.call_record_id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (generation === detailGeneration.current) setDetail({ ...callRecord, scorecard: scorecards?.[0] || null });
    } catch {
      if (generation === detailGeneration.current) setDetailError("Unable to load call details.");
      debugLog("[CallLog] detail load failed");
    } finally {
      if (generation === detailGeneration.current) setLoading(false);
    }
  }, [row.call_record_id, supabaseClient]);

  useEffect(() => {
    void loadDetail();
    return () => { detailGeneration.current += 1; };
  }, [loadDetail]);

  const handleOutcomeChanged = useCallback(
    (value, productType) => {
      setDetail((current) => (current ? { ...current, call_outcome: value, ancillary_product_type: productType } : current));
      if (ENROLLED_OUTCOMES.has(value)) setShowComplianceReview(true);
    },
    []
  );

  return (
    <div className="call-log-expand">
      <div className="call-log-expand-actions">
        <CreateOpportunityButton contactId={row.contact_id} callId={row.call_record_id} contactName={row.contact_name} label="+ OPPORTUNITY" />
        <button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} aria-expanded={showFullDetail} onClick={() => setShowFullDetail(current => !current)}>{showFullDetail ? "HIDE FULL DETAIL" : "FULL DETAIL"}</button>
        <details className="call-actions-menu">
          <summary className="contacts-mini-btn" aria-label="More call actions">⋯</summary>
          <div className="call-actions-menu-items">
            <button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} onClick={event => {
              event.currentTarget.closest('details').open = false;
              setShowComplianceReview(true);
            }}>Compliance Review</button>
          </div>
        </details>
      </div>
      {detailError && <div className="ops-error" role="alert">{detailError} <button type="button" className="contacts-mini-btn" onClick={() => void loadDetail()}>RETRY</button></div>}
      <div className="call-log-workspace">
        <CallTranscriptPlayer row={row} detail={detail} loading={loading} playRequest={playRequest} />
        <aside className="call-log-sidebar" aria-label="Call information">
          <section className="contacts-section">
            <div className="contacts-section-head">OUTCOME</div>
            {row.call_record_id ? <CallOutcomeEditor
              disabled={loading || Boolean(detailError)}
              callRecordId={row.call_record_id}
              outcome={detail?.call_outcome ?? row.call_outcome}
              productType={detail?.ancillary_product_type ?? row.ancillary_product_type}
              supabaseClient={supabaseClient}
              onChanged={handleOutcomeChanged}
            /> : <span className="contacts-muted">No call record linked</span>}
          </section>
          <section className="contacts-section">
            <div className="contacts-section-head">COMPLIANCE</div>
            <div className="call-sidebar-compliance">
              <ComplianceChip score={row.compliance_score} status={row.compliance_status} grade={row.compliance_grade} passFail={row.compliance_pass_fail} duration={row.duration_seconds} />
              {row.call_record_id && <button type="button" className="call-review-link" onClick={() => setShowComplianceReview(true)}>REVIEW →</button>}
            </div>
          </section>
          <section className="contacts-section">
            <div className="contacts-section-head">NOTES</div>
            <CallNotesEditor callRecordId={row.call_record_id} notes={detail?.agent_notes ?? row.agent_notes} loading={loading || Boolean(detailError)} onSaved={value => setDetail(current => current ? { ...current, agent_notes: value } : current)} />
          </section>
        </aside>
      </div>

      {showComplianceReview ? (
        <ComplianceReviewModal
          callRecordId={row.call_record_id}
          displayDurationSeconds={row.duration_seconds}
          supabaseClient={supabaseClient}
          onClose={() => {
            setShowComplianceReview(false);
            loadDetail();
          }}
        />
      ) : null}

      {!row.call_record_id && (row.inbound_call_id || row.attempt_id) ? <RecordingPanel row={row} inboundCallId={row.inbound_call_id} attemptId={row.attempt_id} /> : null}
      {showFullDetail ? <CallDetailPanel detail={detail ? { ...detail, call_duration_seconds: row.duration_seconds } : detail} recordingRow={row} loading={loading} attemptId={row.attempt_id} /> : null}
    </div>
  );
}

export default function CallLogTab({ onOpenContact = null }) {
  const { supabaseClient } = useTenantConfig();
  const { getToken } = useAppAuth();
  const [exporting, setExporting] = useState(false);
  const exportGeneration = useRef(0);
  const [showRecordings, setShowRecordings] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [playRequest, setPlayRequest] = useState({ id: null, sequence: 0 });

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agentFilter, setAgentFilter] = useState("ALL");
  const [dispositionFilter, setDispositionFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [agentOptions, setAgentOptions] = useState(["ALL"]);

  const to = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
  if (to) to.setDate(to.getDate() + 1);
  const { rows, count: totalCount, loading, error: loadError, refresh: load } = useCallLogRows({
    offset: page * PAGE_SIZE, limit: PAGE_SIZE,
    from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
    to: to?.toISOString(),
    direction: directionFilter === "ALL" ? null : directionFilter.toLowerCase(),
    disposition: dispositionFilter === "ALL" ? null : dispositionFilter.toLowerCase(),
    outcome: outcomeFilter === "ALL" ? null : outcomeFilter,
    agent: agentFilter === "ALL" ? null : agentFilter,
    search: search.trim(),
  });
  useEffect(() => {
    setAgentOptions(previous => [...new Set([...previous, ...rows.map(row => row.agent).filter(Boolean)])].sort((a, b) => a === "ALL" ? -1 : b === "ALL" ? 1 : a.localeCompare(b)));
  }, [rows]);

  useEffect(() => {
    exportGeneration.current += 1;
    setExporting(false);
    return () => { exportGeneration.current += 1; };
  }, [getToken, search, dateFrom, dateTo, agentFilter, dispositionFilter, directionFilter, outcomeFilter]);

  const exportCalls = async () => {
    const request = ++exportGeneration.current;
    setExporting(true); setError(null);
    try {
      const to = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
      if (to) to.setDate(to.getDate() + 1);
      const exportRows = await loadCallLogPages(getToken, {
        from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
        to: to?.toISOString(),
        direction: directionFilter === "ALL" ? null : directionFilter.toLowerCase(),
        disposition: dispositionFilter === "ALL" ? null : dispositionFilter.toLowerCase(),
        outcome: outcomeFilter === "ALL" ? null : outcomeFilter,
        agent: agentFilter === "ALL" ? null : agentFilter,
        search: search.trim(),
      }, () => request !== exportGeneration.current);
      if (request === exportGeneration.current) downloadCsv(callsCsv(exportRows), `enrollgen-calls-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      if (request === exportGeneration.current) setError(err.message || "Calls export failed.");
    } finally { if (request === exportGeneration.current) setExporting(false); }
  };

  // Filters reset pagination.
  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, agentFilter, dispositionFilter, directionFilter, outcomeFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageLabel = useMemo(
    () => `PAGE ${page + 1} / ${totalPages} (${totalCount} CALLS)`,
    [page, totalPages, totalCount]
  );

  return (
    <div className="call-log-tab">
      <div className="ops-command-line">
        <span className="call-log-title-group">
          <span>CALL LOG</span>
          <span className="ops-section-meta">{pageLabel}</span>
        </span>
      </div>

      <div className="call-log-filters">
        <input
          type="search"
          className="contacts-search call-log-search"
          placeholder="Search"
          aria-label="Search calls by contact name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="call-log-outcome-filter" value={outcomeFilter} onChange={event => setOutcomeFilter(event.target.value)} aria-label="Outcome filter">
          <option value="ALL">ALL OUTCOMES</option>
          {CALL_OUTCOME_OPTIONS.map(group => <optgroup key={group.group} label={group.group}>
            {group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </optgroup>)}
        </select>
        <div className="call-log-toolbar-actions" role="group" aria-label="Call log filters and actions">
          <CallLogIconSelect icon={UsersRound} label="Agent filter" title={`Agent: ${agentFilter === 'ALL' ? 'All agents' : agentFilter}`} value={agentFilter} onChange={event => setAgentFilter(event.target.value)}>
            {agentOptions.map(agent => <option key={agent} value={agent}>{agent === 'ALL' ? 'ALL AGENTS' : agent}</option>)}
          </CallLogIconSelect>
          <CallLogIconSelect icon={PhoneCall} label="Disposition filter" title={`Call status: ${dispositionFilter === 'ALL' ? 'All statuses' : dispositionFilter.charAt(0) + dispositionFilter.slice(1).toLowerCase()}`} value={dispositionFilter} onChange={event => setDispositionFilter(event.target.value)}>
            {DISPOSITION_FILTERS.map(value => <option key={value} value={value}>{value === 'ALL' ? 'ALL STATUSES' : value}</option>)}
          </CallLogIconSelect>
          <CallLogIconSelect icon={ArrowLeftRight} label="Direction filter" title={`Call direction: ${directionFilter === 'ALL' ? 'Inbound and outbound' : directionFilter.charAt(0) + directionFilter.slice(1).toLowerCase()}`} value={directionFilter} onChange={event => setDirectionFilter(event.target.value)}>
            {DIRECTION_FILTERS.map(value => <option key={value} value={value}>{value === 'ALL' ? 'INBOUND + OUTBOUND' : value}</option>)}
          </CallLogIconSelect>
          <CallDateRangePicker from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
          <button type="button" className={`contacts-mini-btn call-log-toolbar-icon${showRecordings ? ' is-active' : ''}`} aria-label="Recordings" title="Recordings" aria-expanded={showRecordings} onClick={() => setShowRecordings(value => !value)}><FileAudio size={16} aria-hidden="true" /></button>
          <button type="button" className="contacts-mini-btn call-log-toolbar-icon" aria-label="Refresh calls" title="Refresh calls" onClick={load}><RefreshCw size={16} aria-hidden="true" /></button>
          <button type="button" className="contacts-mini-btn call-log-toolbar-icon" aria-label={exporting ? "Exporting calls" : "Export calls (CSV)"} title={exporting ? "Exporting calls…" : "Export calls (CSV)"} aria-busy={exporting} disabled={loading || exporting} onClick={() => void exportCalls()}><Download size={16} aria-hidden="true" /></button>
        </div>
      </div>

      {showRecordings && <CallRecordings />}
      {error || loadError ? <div className="ops-error" role="alert">⚠ {error || loadError}</div> : null}

      <div className="contacts-table-wrap">
        <table className="contacts-table call-log-table">
          <thead>
            <tr>
              <th>DATE/TIME</th>
              <th>DIR</th>
              <th>CONTACT</th>
              <th>TALK</th>
              <th>AGENT</th>
              <th>STATUS · OUTCOME</th>
              <th>RECORDING</th>
              <th>COMPLIANCE</th>
              <th aria-label="Expand" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="contacts-muted">Loading call log...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="contacts-muted">No calls match the current filters</td></tr>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedId === row.log_id;
                const isAlert = row.disposition === "missed" || row.disposition === "voicemail";
                return (
                  <FragmentRow
                    key={row.log_id}
                    row={row}
                    isExpanded={isExpanded}
                    isAlert={isAlert}
                    onToggle={() => { setExpandedId(isExpanded ? null : row.log_id); setPlayRequest(current => ({ ...current, id: null })); }}
                    onPlay={() => { setExpandedId(row.log_id); setPlayRequest(current => ({ id: row.log_id, sequence: current.sequence + 1 })); }}
                    playRequest={playRequest.id === row.log_id ? playRequest.sequence : 0}
                    onOpenContact={onOpenContact}
                    supabaseClient={supabaseClient}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="call-log-pagination">
        <button
          type="button"
          className="contacts-mini-btn"
          disabled={page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
        >
          ← PREV
        </button>
        <span className="mono">{pageLabel}</span>
        <button
          type="button"
          className="contacts-mini-btn"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((current) => current + 1)}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}

function FragmentRow({ row, isExpanded, isAlert, onToggle, onPlay, playRequest, onOpenContact, supabaseClient }) {
  return (
    <>
      <tr className={`call-log-row${isAlert ? " is-alert" : ""}${isExpanded ? " is-expanded" : ""}`} onClick={onToggle}>
        <td className="mono">{fmtDateTime(row.occurred_at)}</td>
        <td>
          <CallDirection direction={row.direction} />
        </td>
        <td>
          {row.contact_id && onOpenContact ? (
            <a
              href={crmPath('contacts', row.contact_id)}
              className="call-log-contact-link"
              onClick={(event) => {
                event.stopPropagation();
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenContact(row.contact_id);
              }}
            >
              {row.contact_name || row.contact_phone || "Unknown"}
            </a>
          ) : (
            <span>{row.contact_name || row.contact_phone || "Unknown"}</span>
          )}
          {row.contact_name && row.contact_phone ? (
            row.contact_id && onOpenContact ? <a href={crmPath('contacts', row.contact_id)} className="call-log-contact-link mono call-log-subphone" onClick={event => {
              event.stopPropagation();
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); onOpenContact(row.contact_id);
            }}>{row.contact_phone}</a> : <span className="contacts-muted mono call-log-subphone"> {row.contact_phone}</span>
          ) : null}
        </td>
        <td className="mono">{fmtDuration(row.duration_seconds)}</td>
        <td>{row.agent || "--"}</td>
        <td><CallStatusOutcome disposition={row.disposition} outcome={row.call_outcome} /></td>
        <td><RecordingCell row={row} onPlay={onPlay} /></td>
        <td><ComplianceChip score={row.compliance_score} status={row.compliance_status} grade={row.compliance_grade} passFail={row.compliance_pass_fail} duration={row.duration_seconds} /></td>
        <td className="call-log-caret"><button type="button" className="call-expand-toggle" aria-label={isExpanded ? "Collapse call" : "Expand call"} aria-expanded={isExpanded} onClick={event => { event.stopPropagation(); onToggle(); }}>{isExpanded ? "⌄" : "›"}</button></td>
      </tr>
      {isExpanded ? (
        <tr className="call-log-expand-row">
          <td colSpan={9}>
            <ExpandedRow row={row} supabaseClient={supabaseClient} playRequest={playRequest} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
