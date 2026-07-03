import { useState, useEffect } from "react";
import { useAppAuth } from "../context/AuthContext";
import { getAuthSupabase } from "../lib/supabase";

const FLOW_COLORS = {
  ma: "var(--eg-flow-ma)",
  medsup: "var(--eg-flow-ms)",
  aca: "var(--eg-flow-aca)",
  u65: "var(--eg-flow-u65)",
};

const FLOW_LABELS = {
  ma: "MA",
  medsup: "SUP",
  aca: "ACA",
  u65: "U65",
};

function formatDuration(seconds) {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CallHistory() {
  const { getToken } = useAppAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken({ template: "supabase" });
        if (!token) {
          setError("auth_disabled");
          setLoading(false);
          return;
        }
        const sb = getAuthSupabase(token);

        const { data, error: err } = await sb
          .from("sessions")
          .select(`
            id, flow, started_at, ended_at, final_section,
            completed, duration_seconds,
            compliance_flags(count),
            section_scores(count)
          `)
          .order("started_at", { ascending: false })
          .limit(50);

        if (err) throw err;
        if (!cancelled) setSessions(data || []);
      } catch (err) {
        console.error("CallHistory load error:", err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 14, padding: 24 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
          Loading…
        </span>
      </div>
    );
  }

  if (error === "auth_disabled") {
    return (
      <div className="card" style={{ marginTop: 14, padding: 24 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
          Sign in to view call history.
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ marginTop: 14, padding: 24 }}>
        <span style={{ color: "var(--danger)", fontSize: 13, fontFamily: "var(--font-body)" }}>
          Error loading calls: {error}
        </span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="card" style={{ marginTop: 14, padding: 24 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
          No calls recorded yet. Start an enrollment to see your history here.
        </span>
      </div>
    );
  }

  const thStyle = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 10,
    fontFamily: "var(--font-body)",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--text-label)",
    borderBottom: "1px solid var(--border-default)",
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "8px 12px",
    fontSize: 12,
    fontFamily: "var(--font-body)",
    fontWeight: 500,
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border-default)",
    whiteSpace: "nowrap",
  };

  return (
    <div className="card" style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "12px 16px 8px",
        borderBottom: "1px solid var(--border-default)",
      }}>
        <span style={{
          fontSize: 11,
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-label)",
        }}>
          My Calls
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Flow</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Sections</th>
              <th style={thStyle}>Flags</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const flowKey = (s.flow || "").toLowerCase();
              const dotColor = FLOW_COLORS[flowKey] || "var(--text-muted)";
              const flowLabel = FLOW_LABELS[flowKey] || s.flow || "-";
              const flagCount = s.compliance_flags?.[0]?.count || 0;
              const sectionCount = s.section_scores?.[0]?.count || 0;

              return (
                <tr key={s.id} style={{ transition: "background 0.15s" }}>
                  <td style={tdStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: dotColor,
                        display: "inline-block",
                        flexShrink: 0,
                      }} />
                      {flowLabel}
                    </span>
                  </td>
                  <td style={tdStyle}>{formatDate(s.started_at)}</td>
                  <td style={tdStyle}>{formatDuration(s.duration_seconds)}</td>
                  <td style={tdStyle}>{sectionCount > 0 ? `${sectionCount}/8` : "-"}</td>
                  <td style={{
                    ...tdStyle,
                    color: flagCount > 0 ? "var(--status-pending)" : "var(--text-muted)",
                  }}>
                    {flagCount > 0 ? flagCount : "-"}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 3,
                      background: s.completed
                        ? "var(--status-live-bg)"
                        : "var(--status-pending-bg)",
                      border: s.completed
                        ? "1px solid var(--status-live-border)"
                        : "1px solid var(--status-pending-border)",
                      color: s.completed ? "var(--status-live)" : "var(--status-pending)",
                    }}>
                      {s.completed ? "Done" : "Partial"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
