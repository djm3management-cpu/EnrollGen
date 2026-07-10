import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import { redactSensitiveText } from "../../lib/redaction";
import CallDetailPanel from "../callDetail/CallDetailPanel";

const PAGE_SIZE = 50;
const DISPOSITION_FILTERS = ["ALL", "CONNECTED", "VOICEMAIL", "MISSED", "DECLINED"];
const DIRECTION_FILTERS = ["ALL", "INBOUND", "OUTBOUND"];

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

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "--";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function DispositionChip({ disposition }) {
  const value = (disposition || "unknown").toLowerCase();
  return <span className={`call-log-chip disposition-${value}`}>{value.toUpperCase()}</span>;
}

function ComplianceChip({ score }) {
  if (score === null || score === undefined) return <span className="contacts-muted">--</span>;
  const value = Math.round(Number(score));
  const band = value >= 90 ? "high" : value >= 70 ? "mid" : "low";
  return <span className={`call-log-chip compliance-${band}`}>{value}%</span>;
}

function RecordingCell({ row, supabaseClient }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasRecording = Boolean(row.recording_storage_path || row.recording_url);

  const handlePlay = useCallback(async () => {
    if (audioUrl) {
      setAudioUrl(null);
      return;
    }
    setLoading(true);
    try {
      if (row.recording_storage_path && supabaseClient) {
        const { data } = await supabaseClient.storage
          .from("call-recordings")
          .createSignedUrl(row.recording_storage_path, 3600);
        if (data?.signedUrl) {
          setAudioUrl(data.signedUrl);
          return;
        }
      }
      if (row.recording_url) setAudioUrl(row.recording_url);
    } finally {
      setLoading(false);
    }
  }, [audioUrl, row.recording_storage_path, row.recording_url, supabaseClient]);

  if (!hasRecording) return <span className="contacts-muted">--</span>;

  return (
    <span className="call-log-recording" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="contacts-mini-btn" onClick={handlePlay} disabled={loading}>
        {loading ? "..." : audioUrl ? "HIDE" : "▶ PLAY"}
      </button>
      {audioUrl ? <audio controls autoPlay preload="none" src={audioUrl} /> : null}
    </span>
  );
}

function ExpandedRow({ row, supabaseClient }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(Boolean(row.call_record_id));
  const [showFullDetail, setShowFullDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!row.call_record_id || !supabaseClient) {
      setLoading(false);
      return undefined;
    }
    (async () => {
      try {
        const { data: callRecord, error } = await supabaseClient
          .from("call_records")
          .select("id, transcript_raw, transcript_diarized, dg_sentiment, dg_intents, dg_topics, dg_summary, call_analytics, agent_assessment, beneficiary_risk, call_duration_seconds, carrier_name, plan_name, effective_date, call_start, agent_notes, compliance_scorecard_id")
          .eq("id", row.call_record_id)
          .single();
        if (error) throw error;
        const { data: scorecards } = await supabaseClient
          .from("compliance_scorecards")
          .select("id, overall_score, overall_grade, pass_fail, auto_fail_triggered, auto_fail_reasons, category_scores, risk_flags, coaching_notes, created_at")
          .eq("call_id", row.call_record_id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!cancelled) {
          setDetail({ ...callRecord, scorecard: scorecards?.[0] || null });
        }
      } catch (err) {
        console.error("[CallLog] detail load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.call_record_id, supabaseClient]);

  const preview = redactSensitiveText(
    (detail?.transcript_raw || row.transcript_preview || "").slice(0, 200)
  );
  const scorecard = detail?.scorecard;

  return (
    <div className="call-log-expand">
      <div className="call-log-expand-grid">
        <div className="contacts-section">
          <div className="contacts-section-head">TRANSCRIPT PREVIEW</div>
          {preview ? <p className="call-log-preview">{preview}...</p> : (
            <div className="contacts-muted">No transcript stored</div>
          )}
        </div>
        <div className="contacts-section">
          <div className="contacts-section-head">COMPLIANCE</div>
          {scorecard ? (
            <dl className="contacts-profile">
              <div><dt>SCORE</dt><dd><ComplianceChip score={scorecard.overall_score} /></dd></div>
              <div><dt>GRADE</dt><dd className="mono">{scorecard.overall_grade || "--"}</dd></div>
              <div><dt>PASS/FAIL</dt><dd className="mono">{String(scorecard.pass_fail || "--").toUpperCase()}</dd></div>
              {scorecard.auto_fail_triggered ? (
                <div><dt>AUTO-FAIL</dt><dd className="status-offline">{(scorecard.auto_fail_reasons || []).join("; ") || "YES"}</dd></div>
              ) : null}
            </dl>
          ) : (
            <div className="contacts-muted">No scorecard</div>
          )}
        </div>
        <div className="contacts-section">
          <div className="contacts-section-head">NOTES</div>
          <p className="call-log-preview">{detail?.agent_notes || row.agent_notes || "No notes"}</p>
        </div>
      </div>

      {row.call_record_id ? (
        <button
          type="button"
          className="contacts-mini-btn"
          onClick={() => setShowFullDetail((current) => !current)}
        >
          {showFullDetail ? "HIDE FULL DETAIL" : "VIEW FULL DETAIL (TRANSCRIPT / ANALYTICS / ASSESSMENT)"}
        </button>
      ) : (
        <div className="contacts-muted">No call record linked (voicemail or missed call)</div>
      )}

      {showFullDetail ? <CallDetailPanel detail={detail} loading={loading} /> : null}
    </div>
  );
}

export default function CallLogTab({ onOpenContact = null, onOpenComplianceHub = null }) {
  const { supabaseClient, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agentFilter, setAgentFilter] = useState("ALL");
  const [dispositionFilter, setDispositionFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [agentOptions, setAgentOptions] = useState(["ALL"]);

  const load = useCallback(async () => {
    if (!supabaseClient) {
      if (!tenantLoading) {
        setLoading(false);
        setError(tenantError || "Workspace connection not ready. Reload the page.");
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabaseClient
        .from("v_call_log")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (dateFrom) query = query.gte("occurred_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("occurred_at", `${dateTo}T23:59:59`);
      if (directionFilter !== "ALL") query = query.eq("direction", directionFilter.toLowerCase());
      if (dispositionFilter !== "ALL") query = query.eq("disposition", dispositionFilter.toLowerCase());
      if (agentFilter !== "ALL") query = query.eq("agent", agentFilter);
      const term = search.trim();
      if (term) {
        const like = `%${term}%`;
        query = query.or(`contact_name.ilike.${like},contact_phone.ilike.${like}`);
      }

      const { data, count, error: queryError } = await query;
      if (queryError) throw queryError;
      setRows(data || []);
      setTotalCount(count || 0);
      setAgentOptions((prev) => {
        const agents = new Set(prev.filter((value) => value !== "ALL"));
        for (const row of data || []) {
          if (row.agent) agents.add(row.agent);
        }
        return ["ALL", ...Array.from(agents).sort()];
      });
    } catch (err) {
      console.error("[CallLog] load failed:", err);
      setError(err.message || "Call log unavailable. Has migration 020 been run?");
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, tenantLoading, tenantError, page, dateFrom, dateTo, directionFilter, dispositionFilter, agentFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Filters reset pagination.
  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, agentFilter, dispositionFilter, directionFilter]);

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
        {onOpenComplianceHub ? (
          <button
            type="button"
            className="contacts-mini-btn call-log-compliance-btn"
            onClick={onOpenComplianceHub}
          >
            COMPLIANCE HUB
          </button>
        ) : null}
      </div>

      <div className="call-log-filters">
        <input
          type="search"
          className="contacts-search"
          placeholder="Search contact name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="call-log-date">
          FROM
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="call-log-date">
          TO
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} aria-label="Agent filter">
          {agentOptions.map((agent) => (
            <option key={agent} value={agent}>{agent === "ALL" ? "ALL AGENTS" : agent}</option>
          ))}
        </select>
        <select value={dispositionFilter} onChange={(event) => setDispositionFilter(event.target.value)} aria-label="Disposition filter">
          {DISPOSITION_FILTERS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} aria-label="Direction filter">
          {DIRECTION_FILTERS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <button type="button" className="contacts-mini-btn" onClick={load}>REFRESH</button>
      </div>

      {error ? <div className="ops-error">⚠ {error}</div> : null}

      <div className="contacts-table-wrap">
        <table className="contacts-table call-log-table">
          <thead>
            <tr>
              <th>DATE/TIME</th>
              <th>DIR</th>
              <th>CONTACT</th>
              <th>DURATION</th>
              <th>AGENT</th>
              <th>DISPOSITION</th>
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
                    onToggle={() => setExpandedId(isExpanded ? null : row.log_id)}
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

function FragmentRow({ row, isExpanded, isAlert, onToggle, onOpenContact, supabaseClient }) {
  return (
    <>
      <tr className={`call-log-row${isAlert ? " is-alert" : ""}${isExpanded ? " is-expanded" : ""}`} onClick={onToggle}>
        <td className="mono">{fmtDateTime(row.occurred_at)}</td>
        <td>
          <span className={`call-log-direction is-${row.direction}`}>
            {row.direction === "inbound" ? "↓ IN" : "↑ OUT"}
          </span>
        </td>
        <td>
          {row.contact_id && onOpenContact ? (
            <button
              type="button"
              className="call-log-contact-link"
              onClick={(event) => {
                event.stopPropagation();
                onOpenContact(row.contact_id);
              }}
            >
              {row.contact_name || row.contact_phone || "Unknown"}
            </button>
          ) : (
            <span>{row.contact_name || row.contact_phone || "Unknown"}</span>
          )}
          {row.contact_name && row.contact_phone ? (
            <span className="contacts-muted mono call-log-subphone"> {row.contact_phone}</span>
          ) : null}
        </td>
        <td className="mono">{fmtDuration(row.duration_seconds)}</td>
        <td>{row.agent || "--"}</td>
        <td><DispositionChip disposition={row.disposition} /></td>
        <td><RecordingCell row={row} supabaseClient={supabaseClient} /></td>
        <td><ComplianceChip score={row.compliance_score} /></td>
        <td className="call-log-caret">{isExpanded ? "▼" : "▶"}</td>
      </tr>
      {isExpanded ? (
        <tr className="call-log-expand-row">
          <td colSpan={9}>
            <ExpandedRow row={row} supabaseClient={supabaseClient} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
