import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppAuth } from "../context/AuthContext";
import { getAuthSupabase, supabase } from "../lib/supabase";

const EMPTY_STATE = {
  dailyActivity: [],
  agentPerformance: [],
  pipelineStatus: [],
  enrollmentSummary: [],
};

const COOP_RATES = {
  aetna: 150,
  cigna: 225,
  "cigna / healthspring": 225,
  elevance: 125,
  "elevance / anthem": 125,
  zing: 200,
  "zing health": 200,
};

const TRACKER_STATUSES = [
  "NOT CONTACTED",
  "CONTACTED - ACTIVE",
  "CONTACTED - AT RISK",
  "DISENROLLED",
  "CLEARED",
];
const DEFAULT_TRACKER_STATUS = TRACKER_STATUSES[0];

const WINDOWS = ["MTD", "QTD", "YTD"];

function fmtNumber(value) {
  return Number(value || 0).toLocaleString();
}

function fmtPercent(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "0%";
  return `${Number(value).toFixed(decimals)}%`;
}

function fmtMoney(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString()}`;
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "—";
  const total = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDateMD(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTimeHM(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtClock(d) {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function normalizeTrackerStatus(value) {
  return TRACKER_STATUSES.includes(value) ? value : DEFAULT_TRACKER_STATUS;
}

function contactedAtForStatus(status, currentValue) {
  if (status === DEFAULT_TRACKER_STATUS) return null;
  return currentValue || new Date().toISOString();
}

function patchPipelineTrackerRows(rows, callRecordId, patch) {
  return rows.map((row) =>
    row.call_record_id === callRecordId ? { ...row, ...patch } : row
  );
}

async function getSupabaseAuthClient(getToken) {
  try {
    const token = await getToken({ template: "supabase" });
    return token ? getAuthSupabase(token) : supabase;
  } catch {
    return supabase;
  }
}

function looksLikeId(value) {
  if (!value) return true;
  if (typeof value !== "string") return true;
  if (/^\d+$/.test(value.trim())) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(value)) return true;
  return false;
}

function resolveAgentName(row) {
  if (row.writing_agent && !looksLikeId(row.writing_agent)) return row.writing_agent;
  if (row.agent_name && !looksLikeId(row.agent_name)) return row.agent_name;
  if (row.writing_agent) return row.writing_agent;
  if (row.agent_name) return row.agent_name;
  if (row.agent_id) return `Agent ${row.agent_id}`;
  return "—";
}

function customerName(row) {
  const full = [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ");
  if (full) return full;
  if (row.customer_phone) return row.customer_phone;
  return "Unknown";
}

function carrierName(row) {
  const c = row.carrier_name;
  if (!c || /^\d+$/.test(String(c).trim())) return "—";
  return c;
}

function dayDiff(target) {
  if (!target) return null;
  const t = new Date(target);
  if (Number.isNaN(t.getTime())) return null;
  const now = new Date();
  t.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 86400000);
}

function isEnrolled(row) {
  return row.call_outcome === "enrolled" || row.enrollment_completed === true;
}

function coopFor(row) {
  if (!isEnrolled(row)) return 0;
  const key = String(row.carrier_name || "").toLowerCase().trim();
  return COOP_RATES[key] ?? 0;
}

function filterByWindow(rows, window) {
  if (!window || !rows.length) return rows;
  const now = new Date();
  const start = new Date(now);
  if (window === "MTD") {
    start.setDate(1);
  } else if (window === "QTD") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    start.setMonth(q, 1);
  } else if (window === "YTD") {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return rows.filter((r) => {
    const d = new Date(r.call_start);
    return !Number.isNaN(d.getTime()) && d >= start;
  });
}

function buildLeaderboards(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = resolveAgentName(r);
    if (!map.has(key)) {
      map.set(key, {
        name: key,
        calls: 0,
        enrolled: 0,
        scoreSum: 0,
        scoreCount: 0,
        coop: 0,
      });
    }
    const a = map.get(key);
    a.calls += 1;
    if (isEnrolled(r)) {
      a.enrolled += 1;
      a.coop += coopFor(r);
    }
    if (r.overall_score !== null && r.overall_score !== undefined && !Number.isNaN(Number(r.overall_score))) {
      a.scoreSum += Number(r.overall_score);
      a.scoreCount += 1;
    }
  }
  const agents = Array.from(map.values()).map((a) => ({
    ...a,
    compliance: a.scoreCount ? a.scoreSum / a.scoreCount : null,
  }));
  return {
    enrolled: agents
      .filter((a) => a.enrolled > 0)
      .sort((a, b) => b.enrolled - a.enrolled)
      .slice(0, 5),
    compliance: agents
      .filter((a) => a.compliance !== null)
      .sort((a, b) => b.compliance - a.compliance)
      .slice(0, 5),
    calls: [...agents].sort((a, b) => b.calls - a.calls).slice(0, 5),
    coop: agents
      .filter((a) => a.coop > 0)
      .sort((a, b) => b.coop - a.coop)
      .slice(0, 5),
  };
}

function buildCarrierMix(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!isEnrolled(r)) continue;
    const c = r.carrier_name || "Unknown";
    map.set(c, (map.get(c) || 0) + 1);
  }
  const total = Array.from(map.values()).reduce((s, n) => s + n, 0);
  const entries = Array.from(map.entries())
    .map(([carrier, count]) => ({
      carrier,
      count,
      pct: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
  return { total, entries };
}

function buildCompliance(rows) {
  const scored = rows.filter(
    (r) => r.overall_score !== null && r.overall_score !== undefined && !Number.isNaN(Number(r.overall_score))
  );
  if (scored.length === 0) return null;
  const avg = scored.reduce((s, r) => s + Number(r.overall_score), 0) / scored.length;
  const passes = scored.filter((r) => r.pass_fail === "pass").length;
  const fails = scored.filter((r) => r.pass_fail === "fail").length;
  return { avg, passes, fails, total: scored.length };
}

function build60Day(rows) {
  return rows
    .filter((r) => r.sixty_day_date)
    .map((r) => {
      const status = normalizeTrackerStatus(r.sixty_day_status);
      const days = dayDiff(r.sixty_day_date);
      let bucket = "upcoming";
      let dot = "○";
      if (days !== null && days < 0) {
        bucket = "overdue";
        dot = "●";
      } else if (days !== null && days <= 3) {
        bucket = "due";
        dot = "◆";
      }
      if (status === "CLEARED") bucket = "cleared";
      return { ...r, sixty_day_status: status, days, bucket, dot };
    })
    .sort((a, b) => {
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });
}

function buildTicker(rows) {
  return rows.slice(0, 8).map((r, idx) => {
    const time = fmtTimeHM(r.call_start);
    const name = customerName(r);
    const carrier = carrierName(r);
    if (isEnrolled(r)) {
      return {
        key: r.call_record_id || idx,
        cls: "is-enrolled",
        icon: "▲",
        text: `${time} ENROLLED ${name}${carrier !== "—" ? " — " + carrier : ""}`,
      };
    }
    if (r.call_outcome === "callback_scheduled") {
      return {
        key: r.call_record_id || idx,
        cls: "is-callback",
        icon: "◆",
        text: `${time} CALLBACK ${name}`,
      };
    }
    if (r.call_outcome === "incomplete" || r.call_outcome === "no_answer") {
      return {
        key: r.call_record_id || idx,
        cls: "is-fail",
        icon: "▼",
        text: `${time} ${(r.call_outcome || "").toUpperCase().replace("_", " ")} ${name}`,
      };
    }
    return {
      key: r.call_record_id || idx,
      cls: "is-call",
      icon: "●",
      text: `${time} CALL ${fmtDuration(r.call_duration_seconds)}`,
    };
  });
}

function outcomeLabel(row) {
  if (isEnrolled(row)) return { label: "ENROLLED", cls: "ops-out-enrolled" };
  if (row.call_outcome === "callback_scheduled")
    return { label: "CALLBACK", cls: "ops-out-callback" };
  if (row.call_outcome === "incomplete")
    return { label: "INCOMPLETE", cls: "ops-out-incomplete" };
  if (row.call_outcome === "no_answer")
    return { label: "NO ANSWER", cls: "ops-out-incomplete" };
  if (row.call_outcome === "not_enrolled")
    return { label: "NOT ENROLLED", cls: "ops-out-not_enrolled" };
  if (row.call_outcome === "transferred")
    return { label: "TRANSFERRED", cls: "ops-out-pending" };
  if (!row.call_outcome) return { label: "PENDING", cls: "ops-out-pending" };
  return { label: row.call_outcome.toUpperCase().replace(/_/g, " "), cls: "ops-out-pending" };
}

function ghlBadge(row) {
  if (row.webhook_sent === true) return { glyph: "✓", cls: "ops-ghl-ok" };
  if (row.webhook_sent === false && row.webhook_error)
    return { glyph: "✗", cls: "ops-ghl-fail" };
  if (isEnrolled(row) && !row.webhook_sent)
    return { glyph: "◷", cls: "ops-ghl-fail" };
  return { glyph: "—", cls: "ops-ghl-na" };
}

function LbSection({ title, rows, valueKey, color, format }) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r[valueKey] || 0)), 0);
  return (
    <div className="ops-lb-section">
      <div className="ops-section-head">
        <span>{title}</span>
        <span className="ops-section-meta">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="ops-lb-empty">NO DATA</div>
      ) : (
        rows.map((r, i) => {
          const value = Number(r[valueKey] || 0);
          const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
          return (
            <div
              key={`${r.name}-${i}`}
              className={`ops-lb-row${i === 0 ? " is-rank-1" : ""}`}
            >
              <span className="rank">{i + 1}</span>
              <span className="name">{r.name}</span>
              <span className="value">{format(value)}</span>
              <div className="bar-wrap">
                <div className={`bar ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function CallsTable({ rows }) {
  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Customer</th>
            <th>Agent</th>
            <th>Carrier</th>
            <th>Outcome</th>
            <th className="num">Dur</th>
            <th className="num">Compl</th>
            <th title="Webhook">WH</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="empty" colSpan={8}>
                No calls recorded
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const oc = outcomeLabel(r);
              const ghl = ghlBadge(r);
              return (
                <tr key={r.call_record_id}>
                  <td>{fmtTimeHM(r.call_start) || fmtDateMD(r.activity_date)}</td>
                  <td>{customerName(r)}</td>
                  <td>{resolveAgentName(r)}</td>
                  <td>{carrierName(r)}</td>
                  <td className={oc.cls}>{oc.label}</td>
                  <td className="num">{fmtDuration(r.call_duration_seconds)}</td>
                  <td className="num">
                    {r.overall_score !== null && r.overall_score !== undefined
                      ? `${Math.round(Number(r.overall_score))}%`
                      : "—"}
                  </td>
                  <td className={ghl.cls}>{ghl.glyph}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function CarrierMixPanel({ mix }) {
  const max = mix.entries.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div>
      <div className="ops-section-head">
        <span>Carrier Mix</span>
        <span className="ops-section-meta">{mix.total} ENROLLED</span>
      </div>
      {mix.entries.length === 0 ? (
        <div className="ops-empty">No enrollments recorded</div>
      ) : (
        mix.entries.map((row) => {
          const pct = max > 0 ? Math.max(2, (row.count / max) * 100) : 0;
          return (
            <div key={row.carrier} className="ops-carrier-row">
              <span className="name">{row.carrier}</span>
              <div className="bar-wrap">
                <div className="bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="pct">{Math.round(row.pct)}%</span>
              <span className="count">{row.count}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function CompliancePanel({ data }) {
  return (
    <div>
      <div className="ops-section-head">
        <span>Compliance</span>
        <span className="ops-section-meta">
          {data ? `${data.total} SCORED` : "—"}
        </span>
      </div>
      {!data ? (
        <div className="ops-empty">Awaiting compliance data</div>
      ) : (
        <div className="ops-compliance-body">
          <div className="ops-compliance-score">
            {Math.round(data.avg)}
            <span style={{ fontSize: "13px", color: "var(--ops-muted)", marginLeft: 4 }}>
              %
            </span>
          </div>
          <div className="ops-compliance-passfail">
            {data.passes + data.fails > 0 ? (
              <>
                <div
                  className="pass"
                  style={{
                    flex: data.passes,
                  }}
                />
                <div
                  className="fail"
                  style={{
                    flex: data.fails,
                  }}
                />
              </>
            ) : null}
          </div>
          <div className="ops-compliance-row">
            <span className="label">Pass</span>
            <span className="val" style={{ color: "var(--ops-green)" }}>
              {data.passes}
            </span>
          </div>
          <div className="ops-compliance-row">
            <span className="label">Fail</span>
            <span className="val" style={{ color: "var(--ops-red)" }}>
              {data.fails}
            </span>
          </div>
          <div className="ops-compliance-row">
            <span className="label">Pass Rate</span>
            <span className="val">
              {data.passes + data.fails > 0
                ? `${Math.round((data.passes / (data.passes + data.fails)) * 100)}%`
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackerRow({ entry, status, saving, onStatusChange }) {
  const dateStr = fmtDateMD(entry.sixty_day_date);
  let label;
  if (entry.days === null) label = dateStr;
  else if (entry.days < 0) label = `OVERDUE  ${dateStr}`;
  else if (entry.days === 0) label = `DUE TODAY  ${dateStr}`;
  else if (entry.days <= 3) label = `DUE  ${dateStr}  (${entry.days}d)`;
  else label = `${dateStr}  (${entry.days}d)`;

  const carrier = carrierName(entry);
  const plan = entry.plan_name || entry.enrollment_code || "";
  const carrierLine = [carrier, plan].filter((v) => v && v !== "—").join("  ");

  return (
    <div className={`ops-tracker-row ${entry.bucket}`}>
      <div className="head">
        <span className="dot">{entry.dot}</span>
        <span className="date">{label}</span>
      </div>
      <span className="customer">{customerName(entry)}</span>
      {carrierLine ? <span className="meta">{carrierLine}</span> : null}
      <span className="agent">{resolveAgentName(entry)}</span>
      <select
        className="ops-tracker-status"
        value={status}
        disabled={saving}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        {TRACKER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function OperationsTab() {
  const { getToken } = useAppAuth();
  const [state, setState] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [windowKey, setWindowKey] = useState("MTD");
  const [now, setNow] = useState(new Date());
  const [trackerPending, setTrackerPending] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadOperations() {
      setLoading(true);
      setError("");

      try {
        const [daily, agents, pipeline, summary] = await Promise.all([
          supabase
            .from("v_daily_activity")
            .select("*")
            .order("call_start", { ascending: false })
            .limit(25),
          supabase
            .from("v_agent_performance")
            .select("*")
            .order("calls_completed", { ascending: false })
            .limit(12),
          supabase
            .from("v_pipeline_status")
            .select("*")
            .order("call_start", { ascending: false })
            .limit(25),
          supabase
            .from("v_enrollment_summary")
            .select("*")
            .order("activity_date", { ascending: false })
            .limit(25),
        ]);

        if (cancelled) return;

        const firstError = [daily, agents, pipeline, summary].find((result) => result.error)?.error;
        if (firstError) {
          setError(firstError.message || "Operations data unavailable.");
          setState(EMPTY_STATE);
        } else {
          setState({
            dailyActivity: daily.data || [],
            agentPerformance: agents.data || [],
            pipelineStatus: pipeline.data || [],
            enrollmentSummary: summary.data || [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Operations data unavailable.");
          setState(EMPTY_STATE);
        }
      }

      if (!cancelled) setLoading(false);
    }

    loadOperations();

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const filteredDaily = useMemo(
    () => filterByWindow(state.dailyActivity, windowKey),
    [state.dailyActivity, windowKey]
  );

  const leaderboards = useMemo(() => buildLeaderboards(filteredDaily), [filteredDaily]);
  const carrierMix = useMemo(() => buildCarrierMix(state.dailyActivity), [state.dailyActivity]);
  const compliance = useMemo(() => buildCompliance(state.dailyActivity), [state.dailyActivity]);
  const tickerEvents = useMemo(() => buildTicker(state.dailyActivity), [state.dailyActivity]);
  const trackerEntries = useMemo(() => build60Day(state.pipelineStatus), [state.pipelineStatus]);

  const trackerStats = useMemo(() => {
    const overdue = trackerEntries.filter((t) => t.bucket === "overdue").length;
    const due = trackerEntries.filter((t) => t.bucket === "due").length;
    return { overdue, due, total: trackerEntries.length };
  }, [trackerEntries]);

  const metrics = useMemo(() => {
    const calls = state.dailyActivity.length;
    const enrollments = state.dailyActivity.filter(isEnrolled).length;
    const callbacks = state.pipelineStatus.filter(
      (record) => record.call_outcome === "callback_scheduled"
    ).length;
    const coopTotal = state.dailyActivity.reduce((sum, r) => sum + coopFor(r), 0);
    const complianceAvg = compliance ? compliance.avg : null;
    return {
      calls,
      enrollments,
      conversion: calls ? (enrollments / calls) * 100 : 0,
      callbacks,
      coopTotal,
      complianceAvg,
    };
  }, [state.dailyActivity, state.pipelineStatus, compliance]);

  const handleTrackerStatusChange = useCallback(
    async (entry, nextValue) => {
      const id = entry.call_record_id;
      if (!id) return;

      const nextStatus = normalizeTrackerStatus(nextValue);
      const nextContactedAt = contactedAtForStatus(
        nextStatus,
        entry.sixty_day_contacted_at
      );
      const previous = {
        sixty_day_status: entry.sixty_day_status,
        sixty_day_contacted_at: entry.sixty_day_contacted_at,
      };
      const optimistic = {
        sixty_day_status: nextStatus,
        sixty_day_contacted_at: nextContactedAt,
      };

      setTrackerPending((prev) => ({ ...prev, [id]: true }));
      setState((prev) => ({
        ...prev,
        pipelineStatus: patchPipelineTrackerRows(prev.pipelineStatus, id, optimistic),
      }));

      try {
        const sb = await getSupabaseAuthClient(getToken);
        const { data, error: updateError } = await sb
          .from("call_records")
          .update(optimistic)
          .eq("id", id)
          .select("id, sixty_day_status, sixty_day_contacted_at")
          .single();

        if (updateError) throw updateError;

        if (data) {
          setState((prev) => ({
            ...prev,
            pipelineStatus: patchPipelineTrackerRows(prev.pipelineStatus, id, {
              sixty_day_status: data.sixty_day_status,
              sixty_day_contacted_at: data.sixty_day_contacted_at,
            }),
          }));
        }
      } catch (err) {
        console.error("[OperationsTab] 60-day tracker update failed:", err);
        setError(err.message || "60-day tracker update failed.");
        setState((prev) => ({
          ...prev,
          pipelineStatus: patchPipelineTrackerRows(prev.pipelineStatus, id, previous),
        }));
      } finally {
        setTrackerPending((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [getToken]
  );

  return (
    <section className="operations-tab">
      {error ? <div className="ops-error">⚠ {error}</div> : null}

      <div className="ops-ticker">
        {tickerEvents.length === 0 ? (
          <span className="ops-ticker-empty">
            NO ACTIVITY RECORDED — AWAITING FIRST CALL
          </span>
        ) : (
          tickerEvents.map((ev) => (
            <span key={ev.key} className={`ops-ticker-item ${ev.cls}`}>
              <span className="icon">{ev.icon}</span>
              <span>{ev.text}</span>
            </span>
          ))
        )}
      </div>

      <div className="ops-grid">
        <aside className="ops-leaderboard">
          <div className="ops-window-toggle">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={windowKey === w ? "is-active" : ""}
                onClick={() => setWindowKey(w)}
              >
                {w}
              </button>
            ))}
          </div>
          <LbSection
            title="Enrollments"
            rows={leaderboards.enrolled}
            valueKey="enrolled"
            color="green"
            format={(v) => fmtNumber(v)}
          />
          <LbSection
            title="Compliance"
            rows={leaderboards.compliance}
            valueKey="compliance"
            color="cyan"
            format={(v) => `${Math.round(v)}%`}
          />
          <LbSection
            title="Calls"
            rows={leaderboards.calls}
            valueKey="calls"
            color="cyan"
            format={(v) => fmtNumber(v)}
          />
          <LbSection
            title="Co-op Earnings"
            rows={leaderboards.coop}
            valueKey="coop"
            color="amber"
            format={(v) => fmtMoney(v)}
          />
        </aside>

        <main className="ops-main">
          <div className="ops-metric-row">
            <div className="ops-metric">
              <span className="ops-metric-label">Calls</span>
              <span className="ops-metric-value">{fmtNumber(metrics.calls)}</span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric-label">Enrolled</span>
              <span className="ops-metric-value">{fmtNumber(metrics.enrollments)}</span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric-label">Rate</span>
              <span className="ops-metric-value">{fmtPercent(metrics.conversion)}</span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric-label">Compl</span>
              <span className="ops-metric-value">
                {metrics.complianceAvg !== null
                  ? `${Math.round(metrics.complianceAvg)}%`
                  : "—"}
              </span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric-label">Co-op</span>
              <span className="ops-metric-value">{fmtMoney(metrics.coopTotal)}</span>
            </div>
          </div>

          <div className="ops-section-head">
            <span>Recent Calls</span>
            <span className="ops-section-meta">
              {loading ? "LOADING…" : `${state.dailyActivity.length} RECORDS`}
            </span>
          </div>
          <CallsTable rows={state.dailyActivity} />

          <div className="ops-bottom-row">
            <CarrierMixPanel mix={carrierMix} />
            <CompliancePanel data={compliance} />
          </div>
        </main>

        <aside className="ops-tracker">
          <div className="ops-section-head">
            <span>60-Day Tracker</span>
            <span className="ops-section-meta">
              {trackerStats.overdue > 0 || trackerStats.due > 0
                ? `${trackerStats.overdue} OVERDUE · ${trackerStats.due} DUE`
                : `${trackerStats.total} OPEN`}
            </span>
          </div>
          {trackerEntries.length === 0 ? (
            <div className="ops-empty">No follow-ups scheduled</div>
          ) : (
            trackerEntries.map((entry) => {
              const id = entry.call_record_id;
              return (
                <TrackerRow
                  key={id}
                  entry={entry}
                  status={normalizeTrackerStatus(entry.sixty_day_status)}
                  saving={Boolean(trackerPending[id])}
                  onStatusChange={(value) => handleTrackerStatusChange(entry, value)}
                />
              );
            })
          )}
        </aside>
      </div>

      <div className="ops-status-bar">
        <span className="left">
          <span className="ops-cursor" aria-hidden="true" />
          <span>NGHS OPS v1.0</span>
        </span>
        <span className="center">
          <span>
            <small>CALLS</small>
            {fmtNumber(metrics.calls)}
          </span>
          <span>
            <small>ENRL</small>
            {fmtNumber(metrics.enrollments)}
          </span>
          <span>
            <small>CO-OP</small>
            {fmtMoney(metrics.coopTotal)}
          </span>
          <span>
            <small>CB</small>
            {fmtNumber(metrics.callbacks)}
          </span>
        </span>
        <span className="right">
          <span className="clock">{fmtClock(now)} EST</span>
          <span className="live">
            <span className="pulse" aria-hidden="true" />
            LIVE
          </span>
        </span>
      </div>
    </section>
  );
}
