import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  Search,
} from "lucide-react";
import { useTenantConfig } from "../hooks/useTenantConfig";
import { supabase } from "../lib/supabase";
import RTSIngestionPanel from "./RTSIngestionPanel";

const DEFAULT_AGENTS = [
  { name: "Michael Shiomos", short: "Mike S.", mobile: "Mike", npn: "20574678" },
  { name: "Mark Endres", short: "Mark E.", mobile: "Mark", npn: "20856361" },
  { name: "Dylan Maria", short: "Dylan M.", mobile: "Dylan", npn: "22167358" },
];
const CHANNELS = ["SMS/Medigap Life", "Savoy/RPS", "EnrollPrime / O'Neill"];
const STATUSES = [
  "",
  "Active",
  "RTS",
  "Complete",
  "Certified",
  "Contract Submitted",
  "Submitted",
  "Pending",
  "Available",
  "Needs Action",
  "Blackout",
  "Terminated",
];
const ACTIVE_STATUSES = new Set(["active", "rts", "complete"]);
const PROGRESS_STATUSES = new Set(["certified", "contract submitted", "submitted"]);
const PENDING_STATUSES = new Set(["pending", "available"]);
const ACTION_STATUSES = new Set(["needs action", "blackout", "terminated", "denied"]);

function normalizedStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function statusTone(status) {
  const normalized = normalizedStatus(status);
  if (ACTIVE_STATUSES.has(normalized)) return "active";
  if (PROGRESS_STATUSES.has(normalized)) return "progress";
  if (PENDING_STATUSES.has(normalized)) return "pending";
  if (ACTION_STATUSES.has(normalized)) return "action";
  return "empty";
}

function canEditRow(row, currentAgent) {
  return Boolean(
    row &&
      currentAgent &&
      (currentAgent.role === "admin" ||
        row.clerk_user_id === currentAgent.clerk_user_id)
  );
}

function pivotRows(rows) {
  const carriers = new Map();
  rows.forEach((row) => {
    const key = `${row.channel}\u0000${row.carrier}\u0000${row.product_line}`;
    if (!carriers.has(key)) {
      carriers.set(key, {
        key,
        channel: row.channel,
        carrier: row.carrier,
        productLine: row.product_line,
        agents: {},
      });
    }
    carriers.get(key).agents[row.agent_name] = row;
  });
  return [...carriers.values()];
}

function matchesStatus(row, filter, visibleAgents) {
  if (filter === "all") return true;
  return visibleAgents.some((agent) => {
    const status = row.agents[agent.name]?.status;
    const tone = statusTone(status);
    if (filter === "active") return tone === "active";
    if (filter === "pending") return tone === "pending" || tone === "progress";
    return tone === "action" || tone === "empty";
  });
}

function compareValue(row, sort) {
  if (sort.key === "carrier") return row.carrier.toLowerCase();
  const agentRow = row.agents[sort.agentName] || {};
  return String(agentRow[sort.key] || "").toLowerCase();
}

function StatusBadge({ value }) {
  return (
    <span className={`rts-status rts-status--${statusTone(value)}`}>
      {value || "-"}
    </span>
  );
}

function EditableCell({ row, field, allowed, saving, saved, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const value = row?.[field] || "";

  const beginEdit = () => {
    if (!allowed || saving) return;
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };

  if (!row) return <span className="rts-cell-empty">-</span>;

  if (editing && field === "status") {
    return (
      <select
        className="rts-inline-select"
        value={draft}
        autoFocus
        onChange={(event) => {
          setDraft(event.target.value);
          setEditing(false);
          if (event.target.value !== value) onSave(event.target.value);
        }}
        onBlur={() => setEditing(false)}
      >
        {STATUSES.map((status) => (
          <option key={status || "empty"} value={status}>
            {status || "Not contracted"}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        className={`rts-inline-input${field === "notes" ? " is-notes" : ""}`}
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`rts-cell-value${allowed ? " is-editable" : " is-locked"}${
        saving ? " is-saving" : ""
      }${saved ? " is-saved" : ""}`}
      onClick={beginEdit}
      disabled={!allowed || saving}
      title={allowed ? `Edit ${field.replace("_", " ")}` : "Only this agent can edit this cell"}
    >
      {field === "status" ? (
        <StatusBadge value={value} />
      ) : (
        <span className={value ? "" : "rts-cell-empty"}>{value || "-"}</span>
      )}
      {!allowed ? <LockKeyhole className="rts-lock" size={10} aria-hidden="true" /> : null}
      {saved ? <Check className="rts-saved-check" size={11} aria-hidden="true" /> : null}
    </button>
  );
}

function SortButton({ label, sortKey, agentName, sort, onSort }) {
  const active = sort.key === sortKey && sort.agentName === agentName;
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      onClick={() => onSort(sortKey, agentName)}
    >
      {label}
      {active ? <span aria-hidden="true">{sort.direction === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

export default function RTSTab() {
  const { user } = useUser();
  const { agents, supabaseClient } = useTenantConfig();
  const client = supabaseClient || supabase;
  const visibleAgents = useMemo(() => {
    if (!agents.length) return DEFAULT_AGENTS;
    return agents.map((agent) => {
      const parts = String(agent.name || "Agent").trim().split(/\s+/);
      const first = parts[0] || "Agent";
      const last = parts.at(-1) || "";
      return {
        ...agent,
        short: `${first}${last && last !== first ? ` ${last[0]}.` : ""}`,
        mobile: first,
      };
    });
  }, [agents]);
  const currentAgent = useMemo(
    () => agents.find((agent) => agent.clerk_user_id === user?.id) || null,
    [agents, user?.id]
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mobileAgent, setMobileAgent] = useState(DEFAULT_AGENTS[0].name);
  const [collapsed, setCollapsed] = useState({});
  const [sort, setSort] = useState({ key: "carrier", agentName: "", direction: "asc" });
  const [savingCells, setSavingCells] = useState({});
  const [savedCells, setSavedCells] = useState({});

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await client
      .from("carrier_rts")
      .select("*")
      .order("channel")
      .order("carrier");
    if (queryError) {
      setError(queryError.message || "Carrier matrix unavailable.");
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    const channel = client
      .channel("carrier-rts-matrix")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "carrier_rts" },
        (payload) => {
          setRows((current) => {
            if (payload.eventType === "DELETE") {
              return current.filter((row) => row.id !== payload.old.id);
            }
            const exists = current.some((row) => row.id === payload.new.id);
            return exists
              ? current.map((row) => (row.id === payload.new.id ? payload.new : row))
              : [...current, payload.new];
          });
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [client]);

  useEffect(() => {
    const rosterAgent = visibleAgents.find(
      (agent) => agent.id === currentAgent?.id || agent.npn === currentAgent?.npn
    );
    setMobileAgent(rosterAgent?.name || visibleAgents[0]?.name || "");
  }, [currentAgent?.id, currentAgent?.npn, visibleAgents]);

  const saveCell = async (row, field, value) => {
    const cellKey = `${row.id}:${field}`;
    const previous = row[field] || "";
    setSavingCells((current) => ({ ...current, [cellKey]: true }));
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, [field]: value } : item))
    );

    let updatedRow = null;
    let updateError = null;

    try {
      const { data, error: writeError } = await client
        .from("carrier_rts")
        .update({ [field]: value })
        .eq("id", row.id)
        .select("*");

      if (writeError) throw writeError;
      if (data.length === 0) {
        throw new Error(
          `RTS authorization/identity error: Clerk user ${user?.id || "(missing)"} cannot update this carrier row.`
        );
      }
      updatedRow = data[0];
    } catch (error) {
      updateError = error;
    }

    setSavingCells((current) => {
      const next = { ...current };
      delete next[cellKey];
      return next;
    });

    if (updateError) {
      setRows((current) =>
        current.map((item) => (item.id === row.id ? { ...item, [field]: previous } : item))
      );
      setError(updateError.message || "Unable to save RTS change.");
      return;
    }

    setRows((current) => current.map((item) => (item.id === row.id ? updatedRow : item)));
    setSavedCells((current) => ({ ...current, [cellKey]: true }));
    window.setTimeout(() => {
      setSavedCells((current) => {
        const next = { ...current };
        delete next[cellKey];
        return next;
      });
    }, 900);
  };

  const handleSort = (key, agentName = "") => {
    setSort((current) => ({
      key,
      agentName,
      direction:
        current.key === key && current.agentName === agentName && current.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const matrixRows = useMemo(() => pivotRows(rows), [rows]);
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const direction = sort.direction === "asc" ? 1 : -1;
    return matrixRows
      .filter((row) => channelFilter === "all" || row.channel === channelFilter)
      .filter((row) => !needle || row.carrier.toLowerCase().includes(needle))
      .filter((row) => matchesStatus(row, statusFilter, visibleAgents))
      .sort((a, b) => compareValue(a, sort).localeCompare(compareValue(b, sort)) * direction);
  }, [channelFilter, matrixRows, search, sort, statusFilter, visibleAgents]);
  const availableChannels = useMemo(() => {
    const channels = [...new Set(rows.map((row) => row.channel).filter(Boolean))];
    return channels.sort((a, b) => {
      const ai = CHANNELS.indexOf(a);
      const bi = CHANNELS.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [rows]);
  const groups = useMemo(() => {
    const result = new Map();
    filteredRows.forEach((row) => {
      if (!result.has(row.channel)) result.set(row.channel, []);
      result.get(row.channel).push(row);
    });
    return [...result.entries()].sort(([a], [b]) => {
      const ai = CHANNELS.indexOf(a);
      const bi = CHANNELS.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [filteredRows]);
  const summary = useMemo(() => {
    const carrierCount = new Set(rows.map((row) => `${row.channel}:${row.carrier}:${row.product_line}`)).size;
    return rows.reduce(
      (totals, row) => {
        const tone = statusTone(row.status);
        if (tone === "active") totals.active += 1;
        if (tone === "pending" || tone === "progress") totals.pending += 1;
        if (tone === "action" || tone === "empty") totals.action += 1;
        return totals;
      },
      { carriers: carrierCount, active: 0, pending: 0, action: 0 }
    );
  }, [rows]);

  const renderCell = (agentRow, field) => {
    const key = agentRow ? `${agentRow.id}:${field}` : "";
    return (
      <EditableCell
        row={agentRow}
        field={field}
        allowed={canEditRow(agentRow, currentAgent)}
        saving={Boolean(savingCells[key])}
        saved={Boolean(savedCells[key])}
        onSave={(value) => saveCell(agentRow, field, value)}
      />
    );
  };

  return (
    <section className="rts-tab">
      <header className="rts-header">
        <div>
          <span className="rts-eyebrow">READY TO SELL</span>
          <h2>Carrier Matrix / RTS Tracker</h2>
        </div>
        <div className="rts-controls">
          <RTSIngestionPanel
            currentAgent={currentAgent}
            tenantAgents={agents}
            onCommitted={loadRows}
          />
          <label className="rts-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Search carriers"
              aria-label="Search carriers"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            value={channelFilter}
            aria-label="Filter by channel"
            onChange={(event) => setChannelFilter(event.target.value)}
          >
            <option value="all">All channels</option>
            {availableChannels.map((channel) => (
              <option key={channel} value={channel}>
                {channel === "EnrollPrime / O'Neill" ? "EnrollPrime/O'Neill" : channel}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            aria-label="Filter by status"
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active / RTS</option>
            <option value="pending">Pending</option>
            <option value="action">Needs Action</option>
          </select>
        </div>
      </header>

      <div className="rts-summary" aria-label="RTS summary">
        <span><strong>{summary.carriers}</strong> carriers</span>
        <span className="is-active"><strong>{summary.active}</strong> Active</span>
        <span className="is-pending"><strong>{summary.pending}</strong> Pending</span>
        <span className="is-action"><strong>{summary.action}</strong> Needs Action</span>
      </div>

      <div className="rts-agent-switcher" role="tablist" aria-label="Agent columns">
        {visibleAgents.map((agent) => (
          <button
            key={agent.name}
            type="button"
            role="tab"
            aria-selected={mobileAgent === agent.name}
            className={mobileAgent === agent.name ? "is-active" : ""}
            onClick={() => setMobileAgent(agent.name)}
          >
            {agent.mobile}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rts-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadRows}>Retry</button>
        </div>
      ) : null}

      <div className="rts-table-wrap">
        <table
          className="rts-table"
          style={{ "--rts-agent-columns-width": `${visibleAgents.length * 432}px` }}
        >
          <colgroup>
            <col className="rts-col-carrier" />
            <col className="rts-col-product" />
            {visibleAgents.map((agent) => [
              <col key={`${agent.name}-status`} className={`rts-agent-col rts-agent-${agent.name === mobileAgent ? "visible" : "hidden"}`} />,
              <col key={`${agent.name}-states`} className={`rts-agent-col rts-agent-${agent.name === mobileAgent ? "visible" : "hidden"}`} />,
              <col key={`${agent.name}-date`} className={`rts-agent-col rts-agent-${agent.name === mobileAgent ? "visible" : "hidden"}`} />,
              <col key={`${agent.name}-notes`} className={`rts-agent-col rts-agent-${agent.name === mobileAgent ? "visible" : "hidden"}`} />,
            ])}
          </colgroup>
          <thead>
            <tr className="rts-agent-head-row">
              <th rowSpan="2">
                <SortButton label="Carrier" sortKey="carrier" agentName="" sort={sort} onSort={handleSort} />
              </th>
              <th rowSpan="2">Product Line</th>
              {visibleAgents.map((agent) => (
                <th
                  key={agent.name}
                  colSpan="4"
                  className={`rts-agent-heading${agent.name === mobileAgent ? " is-mobile-active" : ""}`}
                >
                  <span>{agent.short}</span>
                  <small>NPN {agent.npn}</small>
                </th>
              ))}
            </tr>
            <tr className="rts-field-head-row">
              {visibleAgents.map((agent) => (
                <Fragment key={agent.name}>
                  <th key={`${agent.name}-status`} className={agent.name === mobileAgent ? "is-mobile-active" : ""}>
                    <SortButton label="Status" sortKey="status" agentName={agent.name} sort={sort} onSort={handleSort} />
                  </th>
                  <th key={`${agent.name}-states`} className={agent.name === mobileAgent ? "is-mobile-active" : ""}>States</th>
                  <th key={`${agent.name}-date`} className={agent.name === mobileAgent ? "is-mobile-active" : ""}>
                    <SortButton label="Cert Date" sortKey="cert_date" agentName={agent.name} sort={sort} onSort={handleSort} />
                  </th>
                  <th key={`${agent.name}-notes`} className={agent.name === mobileAgent ? "is-mobile-active" : ""}>Notes</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {Array.from({ length: 7 }, (_, index) => (
                <tr key={index} className="rts-skeleton-row">
                  {Array.from({ length: 2 + visibleAgents.length * 4 }, (__, cell) => (
                    <td key={cell}><span /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : (
            groups.map(([channel, carrierRows]) => (
              <tbody key={channel}>
                <tr className="rts-channel-row">
                  <th colSpan={2 + visibleAgents.length * 4}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((current) => ({ ...current, [channel]: !current[channel] }))}
                    >
                      {collapsed[channel] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span>{channel}</span>
                      <small>{carrierRows.length}</small>
                    </button>
                  </th>
                </tr>
                {!collapsed[channel]
                  ? carrierRows.map((row) => (
                      <tr key={row.key} className="rts-carrier-row">
                        <td className="rts-carrier-name">{row.carrier}</td>
                        <td className="rts-product-line">{row.productLine}</td>
                        {visibleAgents.map((agent) => {
                          const agentRow = row.agents[agent.name];
                          const mobileClass = agent.name === mobileAgent ? "is-mobile-active" : "";
                          return (
                            <Fragment key={agent.name}>
                              <td className={mobileClass}>{renderCell(agentRow, "status")}</td>
                              <td className={mobileClass}>{renderCell(agentRow, "states")}</td>
                              <td className={mobileClass}>{renderCell(agentRow, "cert_date")}</td>
                              <td className={mobileClass}>{renderCell(agentRow, "notes")}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))
                  : null}
              </tbody>
            ))
          )}
        </table>
        {!loading && groups.length === 0 ? (
          <div className="rts-empty">No carriers match the current filters.</div>
        ) : null}
      </div>
    </section>
  );
}
