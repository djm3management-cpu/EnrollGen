import React from "react";
import { AlertTriangle } from "lucide-react";

export function StatsBar({
  searchedZip, state, selectedCounty,
  filtered, plans, femaActive, carriers,
  filteredPlans, activeTab, setActiveTab,
}) {
  const stats = [
    { l: "SEPs", v: filtered?.length || 0, c: "var(--accent-cyan)" },
    { l: "Plans", v: plans?.length || 0, c: "var(--accent-teal)" },
    {
      l: "FEMA",
      v: femaActive.length > 0 ? femaActive.length : "—",
      c: femaActive.length > 0 ? "var(--accent-red)" : "var(--text-muted)",
      a: femaActive.length > 0,
    },
    { l: "Carriers", v: carriers.length, c: "var(--accent-gold)" },
  ];

  return (
    <>
      <div className="sep-stats-grid">
        <div className="sep-stat-box">
          <div className="sep-stat-label">Zip Code</div>
          <div className="sep-stat-value" style={{ color: "var(--text-primary)" }}>
            {searchedZip}{" "}
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
              ({state}){selectedCounty ? ` — ${selectedCounty} Co.` : ""}
            </span>
          </div>
        </div>
        {stats.map((s, i) => (
          <div key={i} className={`sep-stat-box${s.a ? " alert" : ""}`} style={{ textAlign: "center", minWidth: 80 }}>
            <div className="sep-stat-label">
              {s.a && <AlertTriangle size={12} />} {s.l}
            </div>
            <div className="sep-stat-value" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        {[
          ["plans", `Plans & Codes (${filteredPlans.length})`],
          ["seps", `SEPs (${filtered?.length || 0})`],
        ].map(([k, l]) => (
          <button key={k} className={`tab${activeTab === k ? " active" : ""}`} onClick={() => setActiveTab(k)}>
            {l}
          </button>
        ))}
      </div>
    </>
  );
}
