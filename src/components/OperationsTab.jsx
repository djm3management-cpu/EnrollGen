import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, HeartPulse, PhoneCall, ShieldAlert, UserRound } from "lucide-react";
import { useAgentCoaching } from "../hooks/useAgentCoaching";
import { useCallInsights } from "../hooks/useCallInsights";
import { useFollowUps } from "../hooks/useFollowUps";
import { useTenantConfig } from "../hooks/useTenantConfig";
import CallDetailPanel, { RiskBadge } from "./callDetail/CallDetailPanel";

const EMPTY_STATE = {
  dailyActivity: [],
  agentPerformance: [],
  pipelineStatus: [],
  enrollmentSummary: [],
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
const DATE_RANGE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "custom", label: "Custom" },
];
const AGENT_AVATAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-positive)",
  "var(--chart-negative)",
];
const FOLLOWUP_FILTERS = ["All", "Overdue", "High Risk", "This Week"];

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
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "-";
  const total = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDateMD(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateISO(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
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

function LiveOperationsClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return <span className="clock">{fmtClock(now)} EST</span>;
}

function normalizeTrackerStatus(value) {
  return TRACKER_STATUSES.includes(value) ? value : DEFAULT_TRACKER_STATUS;
}

function dateValueForRow(row) {
  return row.call_start || row.activity_date || row.created_at || "";
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function avgNumbers(values) {
  const valid = values.map((value) => Number(value)).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function sentenceCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(value) {
  return sentenceCase(value || "pending");
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

function looksLikeId(value) {
  if (!value) return true;
  if (typeof value !== "string") return true;
  if (/^\d+$/.test(value.trim())) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(value)) return true;
  return false;
}

function normalizeLookup(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function resolveAgentName(row) {
  if (row.writing_agent && !looksLikeId(row.writing_agent)) return row.writing_agent;
  if (row.agent_name && !looksLikeId(row.agent_name)) return row.agent_name;
  if (row.writing_agent) return row.writing_agent;
  if (row.agent_name) return row.agent_name;
  if (row.agent_id) return `Agent ${row.agent_id}`;
  return "-";
}

function customerName(row) {
  const full = [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ");
  if (full) return full;
  if (row.customer_phone) return row.customer_phone;
  return "Unknown";
}

function carrierName(row) {
  const c = row.carrier_name;
  if (!c || /^\d+$/.test(String(c).trim())) return "-";
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

function coopFor(row, coopRates = {}) {
  if (!isEnrolled(row)) return 0;
  const key = String(row.carrier_name || "").toLowerCase().trim();
  return Number(coopRates[key] ?? 0);
}

function sortValue(row, key) {
  if (key === "agent") return resolveAgentName(row).toLowerCase();
  if (key === "datetime") {
    const d = new Date(dateValueForRow(row));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (key === "duration") return Number(row.call_duration_seconds || 0);
  if (key === "carrier") return carrierName(row).toLowerCase();
  if (key === "outcome") return outcomeLabel(row).label.toLowerCase();
  if (key === "compliance") {
    return row.overall_score !== null && row.overall_score !== undefined
      ? Number(row.overall_score)
      : -1;
  }
  return "";
}

function sortRows(rows, sortConfig) {
  const direction = sortConfig.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sortConfig.key);
    const bv = sortValue(b, sortConfig.key);
    if (typeof av === "number" && typeof bv === "number") {
      return av === bv ? 0 : (av > bv ? 1 : -1) * direction;
    }
    return String(av).localeCompare(String(bv)) * direction;
  });
}

function csvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadCallsCsv(rows, coopRates) {
  const headers = [
    "date",
    "time",
    "agent",
    "customer name",
    "carrier",
    "plan",
    "outcome",
    "compliance score",
    "duration",
    "co-op amount",
  ];
  const lines = rows.map((row) => {
    const oc = outcomeLabel(row);
    const d = dateValueForRow(row);
    return [
      fmtDateISO(d),
      fmtTimeHM(d),
      resolveAgentName(row),
      customerName(row),
      carrierName(row),
      row.plan_name || "",
      oc.label,
      row.overall_score !== null && row.overall_score !== undefined
        ? Math.round(Number(row.overall_score))
        : "",
      fmtDuration(row.call_duration_seconds),
      coopFor(row, coopRates),
    ].map(csvCell).join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `enrollgen-calls-${fmtDateISO(new Date().toISOString())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function rangeLabel(rangeKey, customStart, customEnd) {
  if (rangeKey === "custom") {
    if (customStart && customEnd) return `${customStart} - ${customEnd}`;
    if (customStart) return `${customStart}+`;
    if (customEnd) return `Through ${customEnd}`;
    return "Custom";
  }
  return DATE_RANGE_OPTIONS.find((option) => option.key === rangeKey)?.label || "30d";
}

function dateRangeBounds(rangeKey, customStart, customEnd) {
  const now = new Date();
  let start = null;
  let end = null;

  if (rangeKey === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (rangeKey === "7d" || rangeKey === "30d") {
    start = new Date(now);
    start.setDate(start.getDate() - (rangeKey === "7d" ? 6 : 29));
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (rangeKey === "custom") {
    if (customStart) start = new Date(`${customStart}T00:00:00`);
    if (customEnd) end = new Date(`${customEnd}T23:59:59.999`);
  }

  return { start, end };
}

function filterByDateRange(rows, rangeKey, customStart, customEnd) {
  const { start, end } = dateRangeBounds(rangeKey, customStart, customEnd);
  if (!start && !end) return rows;
  return rows.filter((r) => {
    const d = new Date(dateValueForRow(r));
    if (Number.isNaN(d.getTime())) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
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
    const d = new Date(dateValueForRow(r));
    return !Number.isNaN(d.getTime()) && d >= start;
  });
}

function filterByAgent(rows, selectedAgent) {
  if (!selectedAgent) return rows;
  return rows.filter((row) => resolveAgentName(row) === selectedAgent);
}

function hashAgentName(name) {
  let hash = 0;
  const raw = name || "Unknown Agent";
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function agentInitials(name) {
  const parts = String(name || "Unknown Agent")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "UA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function agentAvatarColor(name) {
  return AGENT_AVATAR_COLORS[hashAgentName(name) % AGENT_AVATAR_COLORS.length];
}

function buildLeaderboards(rows, coopRates = {}) {
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
      a.coop += coopFor(r, coopRates);
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

function buildAgentDetail(rows, coopRates = {}) {
  if (!rows.length) {
    return {
      calls: 0,
      enrollments: 0,
      conversion: 0,
      compliance: null,
      duration: null,
      coop: 0,
      carrier: "-",
    };
  }

  const enrollments = rows.filter(isEnrolled).length;
  const scored = rows.filter(
    (r) => r.overall_score !== null && r.overall_score !== undefined && !Number.isNaN(Number(r.overall_score))
  );
  const timed = rows.filter(
    (r) => r.call_duration_seconds !== null && r.call_duration_seconds !== undefined && !Number.isNaN(Number(r.call_duration_seconds))
  );
  const carrierCounts = new Map();

  for (const row of rows) {
    const carrier = carrierName(row);
    if (carrier !== "-") {
      carrierCounts.set(carrier, (carrierCounts.get(carrier) || 0) + 1);
    }
  }

  const carrier = Array.from(carrierCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "-";

  return {
    calls: rows.length,
    enrollments,
    conversion: rows.length ? (enrollments / rows.length) * 100 : 0,
    compliance: scored.length
      ? scored.reduce((sum, row) => sum + Number(row.overall_score), 0) / scored.length
      : null,
    duration: timed.length
      ? timed.reduce((sum, row) => sum + Number(row.call_duration_seconds), 0) / timed.length
      : null,
    coop: rows.reduce((sum, row) => sum + coopFor(row, coopRates), 0),
    carrier,
  };
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

function buildPipelineCounts(rows) {
  return rows.reduce(
    (acc, row) => {
      const key = row.pipeline_status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      if (row.webhook_sent === false && row.webhook_error) acc.webhook_fail += 1;
      return acc;
    },
    {
      pending_wrap_up: 0,
      callback_scheduled: 0,
      recent_enrollment: 0,
      needs_review: 0,
      closed: 0,
      unknown: 0,
      webhook_fail: 0,
    }
  );
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

function EmptyLine({ children = "--" }) {
  return <div className="ops-inline-empty">{children}</div>;
}

function TerminalNav({ windowKey, agentOptions, selectedAgent, onAgentChange }) {
  return (
    <>
      <div className="ops-command-line">
        <span>CALL RECORDS</span>
        <span className="ops-command-market">ENROLLGEN OPS</span>
      </div>
      <div className="ops-terminal-tabs">
        <span className="ops-tab-amber">CALLS</span>
        <span className="ops-tab-red">ENROLLMENTS</span>
        <span className="ops-tab-red">WEBHOOKS</span>
        <span className="ops-tab-blue">FOLLOW-UP</span>
        <span className="ops-tab-fill">Live Call Monitor</span>
      </div>
      <div className="ops-filter-strip">
        <span className="ops-filter-label">Agent</span>
        <select
          className="ops-filter-select"
          value={selectedAgent}
          onChange={(event) => onAgentChange(event.target.value)}
        >
          <option value="">All Agents</option>
          {agentOptions.map((agent) => (
            <option key={agent} value={agent}>
              {agent}
            </option>
          ))}
        </select>
        <span className="ops-filter-label">Outcome</span>
        <span className="ops-filter-box">All Outcomes</span>
        <span className="ops-filter-label">Window</span>
        <span className="ops-filter-box is-blue">{windowKey}</span>
        <span className="ops-filter-title">Call Records Search</span>
      </div>
    </>
  );
}

function OpsFilters({
  agentOptions,
  selectedAgent,
  onAgentChange,
  dateRange,
  onDateRangeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}) {
  return (
    <div className="ops-controls">
      <label className="ops-control">
        <span>Agent</span>
        <select
          value={selectedAgent}
          onChange={(event) => onAgentChange(event.target.value)}
        >
          <option value="">All Agents</option>
          {agentOptions.map((agent) => (
            <option key={agent} value={agent}>
              {agent}
            </option>
          ))}
        </select>
      </label>
      <div className="ops-date-control">
        <span>Date</span>
        <div className="ops-date-buttons">
          {DATE_RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={dateRange === option.key ? "is-active" : ""}
              onClick={() => onDateRangeChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {dateRange === "custom" ? (
        <div className="ops-custom-range">
          <input
            type="date"
            value={customStart}
            onChange={(event) => onCustomStartChange(event.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(event) => onCustomEndChange(event.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
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
        text: `${time} ENROLLED ${name}${carrier !== "-" ? ", " + carrier : ""}`,
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
  return { glyph: "-", cls: "ops-ghl-na" };
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
        <EmptyLine>--</EmptyLine>
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

function AgentDetailSection({ open, selectedAgent, detail, onToggle }) {
  return (
    <div className="ops-agent-detail">
      <button type="button" className="ops-agent-detail-toggle" onClick={onToggle}>
        <span>{open ? "▼" : "▶"} Agent Detail</span>
        <span>{selectedAgent || "Select Agent"}</span>
      </button>
      {open ? (
        selectedAgent ? (
          <div className="ops-agent-detail-grid">
            <div>
              <span>Total Calls</span>
              <strong>{fmtNumber(detail.calls)}</strong>
            </div>
            <div>
              <span>Enrollments</span>
              <strong>{fmtNumber(detail.enrollments)}</strong>
            </div>
            <div>
              <span>Conversion</span>
              <strong>{fmtPercent(detail.conversion)}</strong>
            </div>
            <div>
              <span>Avg Compliance</span>
              <strong>{detail.compliance !== null ? `${Math.round(detail.compliance)}%` : "-"}</strong>
            </div>
            <div>
              <span>Avg Duration</span>
              <strong>{detail.duration !== null ? fmtDuration(detail.duration) : "-"}</strong>
            </div>
            <div>
              <span>Co-op Earnings</span>
              <strong>{fmtMoney(detail.coop)}</strong>
            </div>
            <div className="wide">
              <span>Most Common Carrier</span>
              <strong>{detail.carrier}</strong>
            </div>
          </div>
        ) : (
          <div className="ops-agent-detail-empty">Select an agent to inspect current-window performance.</div>
        )
      ) : null}
    </div>
  );
}

function SortableTh({ column, sortConfig, onSort, children, className = "" }) {
  const active = sortConfig.key === column;
  return (
    <th className={`${className} ops-sort-th${active ? " is-active" : ""}`}>
      <button type="button" onClick={() => onSort(column)}>
        <span>{children}</span>
        <span className="ops-sort-indicator">
          {active ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function CallsTable({
  rows,
  loading,
  sortConfig,
  onSort,
  tenantAgentsByName,
  coopRates,
  selectedCallId,
  callDetails,
  detailLoading,
  onSelectCall,
}) {
  return (
    <div className="ops-calls-panel">
      <div className="ops-section-head">
        <span>Recent Calls</span>
        <span className="ops-section-meta">
          {loading ? "LOADING…" : `${rows.length} RECORDS`}
          <button
            type="button"
            className="ops-export-btn"
            onClick={() => downloadCallsCsv(rows, coopRates)}
            disabled={rows.length === 0}
          >
            EXPORT
          </button>
        </span>
      </div>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th className="row-n">#</th>
              <SortableTh column="datetime" sortConfig={sortConfig} onSort={onSort}>Date/Time</SortableTh>
              <th>Customer</th>
              <SortableTh column="agent" sortConfig={sortConfig} onSort={onSort}>Agent</SortableTh>
              <SortableTh column="carrier" sortConfig={sortConfig} onSort={onSort}>Carrier</SortableTh>
              <SortableTh column="outcome" sortConfig={sortConfig} onSort={onSort}>Outcome</SortableTh>
              <SortableTh column="duration" sortConfig={sortConfig} onSort={onSort} className="num">Dur</SortableTh>
              <SortableTh column="compliance" sortConfig={sortConfig} onSort={onSort} className="num">Compl</SortableTh>
              <th title="Webhook">WH</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="empty" colSpan={9}>
                  Awaiting call rows
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const oc = outcomeLabel(r);
                const ghl = ghlBadge(r);
                const agentName = resolveAgentName(r);
                const tenantAgent = tenantAgentsByName.get(normalizeLookup(agentName));
                const tooltip = tenantAgent?.npn
                  ? `${agentName} | NPN ${tenantAgent.npn}`
                  : agentName;
                const selected = selectedCallId === r.call_record_id;
                return [
                  <tr
                    key={r.call_record_id}
                    className={selected ? "is-selected" : ""}
                    onClick={() => onSelectCall(r.call_record_id)}
                  >
                    <td className="row-n">{i + 1}</td>
                    <td>
                      <span className="ops-date-cell">{fmtDateMD(dateValueForRow(r))}</span>
                      <span className="ops-time-cell">{fmtTimeHM(dateValueForRow(r)) || fmtDateMD(r.activity_date)}</span>
                    </td>
                    <td>{customerName(r)}</td>
                    <td>
                      <span className="ops-agent-cell" title={tooltip}>
                        <span
                          className="ops-agent-avatar"
                          style={{ backgroundColor: agentAvatarColor(agentName) }}
                        >
                          {agentInitials(agentName)}
                        </span>
                        <span>{agentName}</span>
                      </span>
                    </td>
                    <td>{carrierName(r)}</td>
                    <td className={oc.cls}>{oc.label}</td>
                    <td className="num">{fmtDuration(r.call_duration_seconds)}</td>
                    <td className="num">
                      {r.overall_score !== null && r.overall_score !== undefined
                        ? `${Math.round(Number(r.overall_score))}%`
                        : "-"}
                    </td>
                    <td className={ghl.cls}>{ghl.glyph}</td>
                  </tr>,
                  selected ? (
                    <tr key={`${r.call_record_id}-detail`} className="ops-detail-row">
                      <td colSpan={9}>
                        <CallDetailPanel
                          detail={callDetails[r.call_record_id]}
                          loading={detailLoading === r.call_record_id}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CarrierMixPanel({ mix }) {
  const max = mix.entries.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div className="ops-carrier-panel">
      <div className="ops-section-head">
        <span>Carrier Mix</span>
        <span className="ops-section-meta">{mix.total} ENROLLED</span>
      </div>
      {mix.entries.length === 0 ? (
        <EmptyLine>0 enrolled rows</EmptyLine>
      ) : (
        mix.entries.map((row, i) => {
          const pct = max > 0 ? Math.max(2, (row.count / max) * 100) : 0;
          return (
            <div key={row.carrier} className="ops-carrier-row">
              <span className="rank">{i + 1}</span>
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
    <div className="ops-compliance-panel">
      <div className="ops-section-head">
        <span>Compliance</span>
        <span className="ops-section-meta">
          {data ? `${data.total} SCORED` : "-"}
        </span>
      </div>
      {!data ? (
        <div className="ops-compliance-body">
          <div className="ops-compliance-score">
            --<span className="ops-compliance-score-suffix">%</span>
          </div>
          <div className="ops-compliance-row">
            <span className="label">Pass</span>
            <span className="val">--</span>
          </div>
          <div className="ops-compliance-row">
            <span className="label">Fail</span>
            <span className="val">--</span>
          </div>
        </div>
      ) : (
        <div className="ops-compliance-body">
          <div className="ops-compliance-score">
            {Math.round(data.avg)}
            <span className="ops-compliance-score-suffix">
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
                : "-"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function latestInsights(insights, type) {
  const rows = insights
    .filter((insight) => insight.insight_type === type)
    .sort((a, b) => new Date(b.computed_at || 0) - new Date(a.computed_at || 0));
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.insight_key)) byKey.set(row.insight_key, row);
  }
  return Array.from(byKey.values());
}

function TrendValue({ value }) {
  if (value === null || value === undefined) return <span className="ops-trend flat">0</span>;
  const numeric = Number(value);
  const cls = numeric > 0 ? "up" : numeric < 0 ? "down" : "flat";
  const glyph = numeric > 0 ? "▲" : numeric < 0 ? "▼" : "■";
  return <span className={`ops-trend ${cls}`}>{glyph} {Math.abs(numeric).toFixed(1)}</span>;
}

function AgentIntelligencePanel({ insights, selectedAgent, agentOptions }) {
  const [collapsed, setCollapsed] = useState(false);
  const { coaching, loading: coachingLoading } = useAgentCoaching(selectedAgent);
  const rows = latestInsights(insights, "agent_30d")
    .map((row) => row.insight_data || {})
    .sort((a, b) => asNumber(b.conversion_rate, 0) - asNumber(a.conversion_rate, 0));
  const selectedStats = rows.find((row) => row.agent_name === selectedAgent);

  return (
    <div className="ops-agent-intel">
      <button type="button" className="ops-collapsible-head" onClick={() => setCollapsed((value) => !value)}>
        <span>Agent Intelligence</span>
        <strong>{collapsed ? "+" : "-"}</strong>
      </button>
      {collapsed ? null : (
        selectedAgent && selectedStats ? (
          <div className="ops-agent-intel-body">
            <div className="ops-agent-name">{selectedAgent}</div>
            <div className="ops-agent-stat-grid">
              <div><span>Calls</span><strong>{fmtNumber(selectedStats.total_calls)}</strong></div>
              <div><span>Enroll</span><strong>{fmtNumber(selectedStats.enrollments)}</strong></div>
              <div><span>Rate</span><strong>{fmtPercent(selectedStats.conversion_rate, 1)}</strong></div>
              <div><span>Dur</span><strong>{selectedStats.avg_duration_min ?? "--"}m</strong></div>
              <div><span>Talk</span><strong>{selectedStats.avg_talk_pct ?? "--"}%</strong></div>
              <div><span>WPM</span><strong>{selectedStats.avg_wpm ?? "--"}</strong></div>
              <div><span>Ints</span><strong>{selectedStats.avg_interruptions ?? "--"}</strong></div>
              <div><span>Sent</span><strong>{selectedStats.avg_sentiment ?? "--"}</strong></div>
              <div><span>Rapport</span><strong>{selectedStats.avg_rapport ?? "--"}</strong></div>
              <div><span>Listen</span><strong>{selectedStats.avg_listening ?? "--"}</strong></div>
            </div>
            <div className="ops-agent-trends">
              <span>Rate <TrendValue value={selectedStats.trend?.conversion_rate_delta} /></span>
              <span>Sent <TrendValue value={selectedStats.trend?.avg_sentiment_delta} /></span>
              <span>Rapport <TrendValue value={selectedStats.trend?.avg_rapport_delta} /></span>
            </div>
            <div className="ops-coaching-summary">
              <span className="ops-mini-label">Latest Coaching</span>
              <p>{coachingLoading ? "Loading..." : coaching?.coaching_summary || "No weekly coaching summary stored."}</p>
            </div>
          </div>
        ) : (
          <div className="ops-agent-intel-body">
            {rows.length === 0 ? (
              <EmptyLine>{agentOptions.length ? "No agent insights yet" : "No agents found"}</EmptyLine>
            ) : (
              rows.slice(0, 5).map((agent, index) => (
                <div key={agent.agent_name || index} className="ops-agent-rank">
                  <span className="rank">{index + 1}</span>
                  <span className="name">{agent.agent_name}</span>
                  <strong>{fmtPercent(agent.conversion_rate, 1)}</strong>
                  <TrendValue value={agent.trend?.conversion_rate_delta} />
                </div>
              ))
            )}
          </div>
        )
      )}
    </div>
  );
}

function buildBriefingCards(insights) {
  const cards = [];
  const time = latestInsights(insights, "time_patterns")[0]?.insight_data?.best_pattern;
  if (time) {
    cards.push({
      key: "time",
      icon: Clock,
      stat: `${Math.round(asNumber(time.conversion_rate, 0))}%`,
      text: `${time.day_name} ${time.hour_of_day}:00 converts best this quarter`,
      updated: "Updated recently",
    });
  }

  const duration = latestInsights(insights, "duration_patterns")[0]?.insight_data?.best_pattern;
  if (duration) {
    cards.push({
      key: "duration",
      icon: PhoneCall,
      stat: `${Math.round(asNumber(duration.conversion_rate, 0))}%`,
      text: `${sentenceCase(duration.duration_bucket)} has the strongest conversion`,
      updated: "Updated recently",
    });
  }

  const agents = latestInsights(insights, "agent_30d").map((row) => row.insight_data || {});
  const spotlight = [...agents].sort((a, b) => asNumber(b.trend?.avg_rapport_delta, -999) - asNumber(a.trend?.avg_rapport_delta, -999))[0];
  if (spotlight?.agent_name && spotlight.trend?.avg_rapport_delta !== null && spotlight.trend?.avg_rapport_delta !== undefined) {
    cards.push({
      key: "agent",
      icon: UserRound,
      stat: `${spotlight.trend.avg_rapport_delta > 0 ? "+" : ""}${spotlight.trend.avg_rapport_delta}`,
      text: `${spotlight.agent_name}'s rapport trend leads the team`,
      updated: "Updated recently",
    });
  }

  const carrier = latestInsights(insights, "carrier_30d")
    .map((row) => row.insight_data || {})
    .sort((a, b) => asNumber(b.high_risk_count, 0) - asNumber(a.high_risk_count, 0))[0];
  if (carrier?.carrier_name && asNumber(carrier.high_risk_count, 0) > 0) {
    cards.push({
      key: "carrier",
      icon: ShieldAlert,
      stat: fmtNumber(carrier.high_risk_count),
      text: `${carrier.carrier_name} enrollments have high-risk flags`,
      updated: "Updated recently",
    });
  }

  const currentSentiment = avgNumbers(agents.map((row) => row.avg_sentiment));
  const previousSentiment = avgNumbers(agents.map((row) => row.previous_30d?.avg_sentiment));
  if (currentSentiment !== null && previousSentiment !== null) {
    const delta = currentSentiment - previousSentiment;
    cards.push({
      key: "sentiment",
      icon: HeartPulse,
      stat: `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`,
      text: "Average beneficiary sentiment trend",
      updated: "Updated recently",
    });
  }

  return cards.slice(0, 5);
}

function IntelligenceBriefing({ insights, loading }) {
  const cards = useMemo(() => buildBriefingCards(insights), [insights]);
  return (
    <div className="ops-briefing">
      <div className="ops-section-head">
        <span>Intelligence Briefing</span>
        <span className="ops-section-meta">{loading ? "LOADING" : `${cards.length} ALERTS`}</span>
      </div>
      {cards.length === 0 ? (
        <div className="ops-briefing-empty">Intelligence briefing will appear after your first few calls are analyzed.</div>
      ) : (
        <div className="ops-briefing-row">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="ops-briefing-card">
                <Icon size={14} />
                <strong>{card.stat}</strong>
                <span>{card.text}</span>
                <small>{card.updated}</small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function followupIsOverdue(row) {
  if (row.followup_status !== "pending" || !row.recommended_followup_date) return false;
  const due = new Date(row.recommended_followup_date);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(due.getTime()) && due < today;
}

function followupThisWeek(row) {
  if (!row.recommended_followup_date) return false;
  const due = new Date(row.recommended_followup_date);
  const today = new Date();
  const week = new Date(today);
  today.setHours(0, 0, 0, 0);
  week.setDate(today.getDate() + 7);
  week.setHours(23, 59, 59, 999);
  return !Number.isNaN(due.getTime()) && due >= today && due <= week;
}

function FollowUpsPanel() {
  const { followups, overdue, loading, updateStatus } = useFollowUps();
  const [filter, setFilter] = useState("All");
  const visible = useMemo(() => {
    if (filter === "Overdue") return followups.filter(followupIsOverdue);
    if (filter === "High Risk") return followups.filter((row) => row.risk_level === "high");
    if (filter === "This Week") return followups.filter(followupThisWeek);
    return followups;
  }, [filter, followups]);

  return (
    <div className="ops-followups">
      <div className="ops-section-head">
        <span>Follow-Ups</span>
        <span className="ops-section-meta">
          {loading ? "LOADING" : `${overdue.length} OVERDUE`}
        </span>
      </div>
      <div className="ops-followup-filters">
        {FOLLOWUP_FILTERS.map((item) => (
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
      {visible.length === 0 ? (
        <EmptyLine>0 follow-ups</EmptyLine>
      ) : (
        <div className="ops-followup-table">
          {visible.map((row) => (
            <div key={row.id} className={`ops-followup-row${followupIsOverdue(row) ? " is-overdue" : ""}`}>
              <span className="customer">{row.customer_name || "Unknown"}</span>
              <span className="carrier">{[row.carrier_name, row.plan_name].filter(Boolean).join(" / ") || "-"}</span>
              <RiskBadge level={row.risk_level} />
              <span className="date">{fmtDateISO(row.recommended_followup_date)}</span>
              <select
                value={row.followup_status || "pending"}
                onChange={(event) => updateStatus(row.id, event.target.value)}
              >
                {["pending", "contacted", "cleared", "at_risk", "disenrolled"].map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              <span className="agent">{row.agent_name || "-"}</span>
              {row.notes ? <span className="notes">{row.notes}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function heatCell(value, values, reverse = false, suffix = "") {
  const numeric = asNumber(value, 0);
  const valid = values.map((item) => asNumber(item, 0));
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const ratio = max === min ? 0.5 : (numeric - min) / (max - min);
  const score = reverse ? 1 - ratio : ratio;
  const color = score >= 0.5
    ? `color-mix(in srgb, var(--status-live) ${15 + score * 35}%, transparent)`
    : `color-mix(in srgb, var(--status-offline) ${15 + (1 - score) * 35}%, transparent)`;
  return { value: `${numeric}${suffix}`, style: { backgroundColor: color } };
}

function CarrierHeatmapPanel({ insights }) {
  const rows = latestInsights(insights, "carrier_30d").map((row) => row.insight_data || {});
  const enrollments = rows.map((row) => row.total_enrollments);
  const compliance = rows.map((row) => row.avg_compliance_score);
  const sentiment = rows.map((row) => row.avg_sentiment);
  const risk = rows.map((row) => row.high_risk_count);
  const duration = rows.map((row) => row.avg_call_duration);

  return (
    <div className="ops-carrier-heatmap">
      <div className="ops-section-head">
        <span>Carrier Heatmap</span>
        <span className="ops-section-meta">{rows.length} CARRIERS</span>
      </div>
      {rows.length === 0 ? (
        <EmptyLine>No carrier insights yet</EmptyLine>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Carrier</th>
              <th>Enrl</th>
              <th>Compl</th>
              <th>Sent</th>
              <th>Risk</th>
              <th>Dur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const enrollCell = heatCell(row.total_enrollments, enrollments);
              const compCell = heatCell(row.avg_compliance_score, compliance, false, "%");
              const sentCell = heatCell(row.avg_sentiment, sentiment);
              const riskCell = heatCell(row.high_risk_count, risk, true);
              const durCell = heatCell(row.avg_call_duration, duration, true, "m");
              return (
                <tr key={row.carrier_name}>
                  <td>{row.carrier_name}</td>
                  <td style={enrollCell.style}>{enrollCell.value}</td>
                  <td style={compCell.style}>{compCell.value}</td>
                  <td style={sentCell.style}>{sentCell.value}</td>
                  <td style={riskCell.style}>{riskCell.value}</td>
                  <td style={durCell.style}>{durCell.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PipelinePanel({ rows }) {
  const counts = buildPipelineCounts(rows);
  const items = [
    ["Pending", counts.pending_wrap_up, "is-muted"],
    ["Callback", counts.callback_scheduled, "is-amber"],
    ["Enroll", counts.recent_enrollment, "is-green"],
    ["Review", counts.needs_review, "is-red"],
    ["Closed", counts.closed, "is-cyan"],
    ["WH Err", counts.webhook_fail, "is-red"],
  ];

  return (
    <div className="ops-pipeline-panel">
      <div className="ops-section-head">
        <span>Pipeline</span>
        <span className="ops-section-meta">{rows.length} ROWS</span>
      </div>
      <div className="ops-pipeline-grid">
        {items.map(([label, value, cls]) => (
          <div key={label} className="ops-pipeline-cell">
            <span className="label">{label}</span>
            <span className={`val ${cls}`}>{fmtNumber(value)}</span>
          </div>
        ))}
      </div>
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
  const carrierLine = [carrier, plan].filter((v) => v && v !== "-").join("  ");

  return (
    <div className={`ops-tracker-row ${entry.bucket}`}>
      <span className="dot">{entry.dot}</span>
      <div className="ops-tracker-body">
        <span className="date">{label}</span>
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
    </div>
  );
}

export default function OperationsTab() {
  const {
    agencyDisplayName,
    agents,
    coopRates,
    error: tenantError,
    loading: tenantLoading,
    supabaseClient,
  } = useTenantConfig();
  const { insights, loading: insightsLoading } = useCallInsights();
  const [state, setState] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [windowKey, setWindowKey] = useState("MTD");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [dateRange, setDateRange] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "datetime", direction: "desc" });
  const [agentDetailOpen, setAgentDetailOpen] = useState(true);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [callDetails, setCallDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);
  const [trackerPending, setTrackerPending] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadOperations() {
      if (tenantLoading) return;
      setLoading(true);
      setError(tenantError || "");

      try {
        const sb = supabaseClient;
        const [daily, agents, pipeline, summary] = await Promise.all([
          sb
            .from("v_daily_activity")
            .select("*")
            .order("call_start", { ascending: false })
            .limit(25),
          sb
            .from("v_agent_performance")
            .select("*")
            .order("calls_completed", { ascending: false })
            .limit(12),
          sb
            .from("v_pipeline_status")
            .select("*")
            .order("call_start", { ascending: false })
            .limit(25),
          sb
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
  }, [supabaseClient, tenantError, tenantLoading]);

  const tenantAgentsByName = useMemo(() => {
    const map = new Map();
    for (const agent of agents || []) {
      const key = normalizeLookup(agent.name);
      if (key) map.set(key, agent);
    }
    return map;
  }, [agents]);

  const agentOptions = useMemo(() => {
    const names = new Set((agents || []).map((agent) => agent.name).filter(Boolean));
    state.dailyActivity.forEach((row) => names.add(resolveAgentName(row)));
    return Array.from(names).filter((name) => name && name !== "-").sort((a, b) => a.localeCompare(b));
  }, [agents, state.dailyActivity]);

  useEffect(() => {
    if (selectedAgent && !agentOptions.includes(selectedAgent)) {
      setSelectedAgent("");
    }
  }, [agentOptions, selectedAgent]);

  const dateFilteredDaily = useMemo(
    () => filterByDateRange(filterByWindow(state.dailyActivity, windowKey), dateRange, customStart, customEnd),
    [customEnd, customStart, dateRange, state.dailyActivity, windowKey]
  );

  const dateFilteredPipeline = useMemo(
    () => filterByDateRange(filterByWindow(state.pipelineStatus, windowKey), dateRange, customStart, customEnd),
    [customEnd, customStart, dateRange, state.pipelineStatus, windowKey]
  );

  const filteredDaily = useMemo(
    () => filterByAgent(dateFilteredDaily, selectedAgent),
    [dateFilteredDaily, selectedAgent]
  );

  const filteredPipeline = useMemo(
    () => filterByAgent(dateFilteredPipeline, selectedAgent),
    [dateFilteredPipeline, selectedAgent]
  );

  const sortedDaily = useMemo(
    () => sortRows(filteredDaily, sortConfig),
    [filteredDaily, sortConfig]
  );

  const leaderboards = useMemo(() => buildLeaderboards(filteredDaily, coopRates), [coopRates, filteredDaily]);
  const carrierMix = useMemo(() => buildCarrierMix(filteredDaily), [filteredDaily]);
  const compliance = useMemo(() => buildCompliance(filteredDaily), [filteredDaily]);
  const tickerEvents = useMemo(() => buildTicker(sortedDaily), [sortedDaily]);
  const trackerEntries = useMemo(() => build60Day(filteredPipeline), [filteredPipeline]);
  const agentDetail = useMemo(() => buildAgentDetail(filteredDaily, coopRates), [coopRates, filteredDaily]);
  const dateLabel = useMemo(
    () => rangeLabel(dateRange, customStart, customEnd),
    [customEnd, customStart, dateRange]
  );

  const trackerStats = useMemo(() => {
    const overdue = trackerEntries.filter((t) => t.bucket === "overdue").length;
    const due = trackerEntries.filter((t) => t.bucket === "due").length;
    return { overdue, due, total: trackerEntries.length };
  }, [trackerEntries]);

  const metrics = useMemo(() => {
    const calls = filteredDaily.length;
    const enrollments = filteredDaily.filter(isEnrolled).length;
    const callbacks = filteredPipeline.filter(
      (record) => record.call_outcome === "callback_scheduled"
    ).length;
    const coopTotal = filteredDaily.reduce((sum, r) => sum + coopFor(r, coopRates), 0);
    const complianceAvg = compliance ? compliance.avg : null;
    return {
      calls,
      enrollments,
      conversion: calls ? (enrollments / calls) * 100 : 0,
      callbacks,
      coopTotal,
      complianceAvg,
    };
  }, [compliance, coopRates, filteredDaily, filteredPipeline]);

  const handleSort = useCallback((column) => {
    setSortConfig((current) => {
      if (current.key === column) {
        return {
          key: column,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key: column,
        direction: column === "datetime" || column === "duration" || column === "compliance" ? "desc" : "asc",
      };
    });
  }, []);

  const handleSelectCall = useCallback(async (callId) => {
    if (!callId) return;
    const nextSelected = selectedCallId === callId ? null : callId;
    setSelectedCallId(nextSelected);
    if (!nextSelected || callDetails[callId]) return;

    setDetailLoading(callId);
    try {
      const { data: callRecord, error: callError } = await supabaseClient
        .from("call_records")
        .select("id, transcript_raw, transcript_diarized, dg_sentiment, dg_intents, dg_topics, dg_summary, call_analytics, agent_assessment, beneficiary_risk, call_duration_seconds, carrier_name, plan_name, effective_date, call_start, compliance_scorecard_id")
        .eq("id", callId)
        .single();

      if (callError) throw callError;

      const { data: scorecards, error: scoreError } = await supabaseClient
        .from("compliance_scorecards")
        .select("id, overall_score, overall_grade, pass_fail, auto_fail_triggered, auto_fail_reasons, category_scores, risk_flags, coaching_notes, created_at")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (scoreError) throw scoreError;

      setCallDetails((prev) => ({
        ...prev,
        [callId]: {
          ...callRecord,
          scorecard: scorecards?.[0] || null,
        },
      }));
    } catch (err) {
      console.error("[OperationsTab] Call detail load failed:", err);
      setError(err.message || "Call detail unavailable.");
    } finally {
      setDetailLoading(null);
    }
  }, [callDetails, selectedCallId, supabaseClient]);

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
        const sb = supabaseClient;
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
    [supabaseClient]
  );

  return (
    <section className="operations-tab">
      {error ? <div className="ops-error">⚠ {error}</div> : null}

      <TerminalNav
        windowKey={`${windowKey} · ${dateLabel}`}
        agentOptions={agentOptions}
        selectedAgent={selectedAgent}
        onAgentChange={setSelectedAgent}
      />

      <div className="ops-ticker">
        {tickerEvents.length === 0 ? (
          <span className="ops-ticker-empty">
            Awaiting first call event
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
          <AgentIntelligencePanel
            insights={insights}
            selectedAgent={selectedAgent}
            agentOptions={agentOptions}
          />
          <AgentDetailSection
            open={agentDetailOpen}
            selectedAgent={selectedAgent}
            detail={agentDetail}
            onToggle={() => setAgentDetailOpen((value) => !value)}
          />
        </aside>

        <main className="ops-main">
          <IntelligenceBriefing insights={insights} loading={insightsLoading} />
          <OpsFilters
            agentOptions={agentOptions}
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={(value) => {
              setCustomStart(value);
              setDateRange("custom");
            }}
            onCustomEndChange={(value) => {
              setCustomEnd(value);
              setDateRange("custom");
            }}
          />

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
                  : "-"}
              </span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric-label">Co-op</span>
              <span className="ops-metric-value">{fmtMoney(metrics.coopTotal)}</span>
            </div>
          </div>

          <CallsTable
            rows={sortedDaily}
            loading={loading}
            sortConfig={sortConfig}
            onSort={handleSort}
            tenantAgentsByName={tenantAgentsByName}
            coopRates={coopRates}
            selectedCallId={selectedCallId}
            callDetails={callDetails}
            detailLoading={detailLoading}
            onSelectCall={handleSelectCall}
          />

          <div className="ops-bottom-row">
            <CarrierMixPanel mix={carrierMix} />
            <CompliancePanel data={compliance} />
          </div>
          <CarrierHeatmapPanel insights={insights} />
          <PipelinePanel rows={filteredPipeline} />
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
            <EmptyLine>0 follow-ups scheduled</EmptyLine>
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
          <FollowUpsPanel />
        </aside>
      </div>

      <div className="ops-status-bar">
        <span className="left">
          <span className="ops-cursor" aria-hidden="true" />
          <span>{agencyDisplayName ? `${agencyDisplayName} OPS v1.0` : "OPS v1.0"}</span>
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
          <LiveOperationsClock />
          <span className="live">
            <span className="pulse" aria-hidden="true" />
            LIVE
          </span>
        </span>
      </div>
    </section>
  );
}
