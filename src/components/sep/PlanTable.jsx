import React from "react";
import { Filter, X, ChevronRight } from "lucide-react";
import { CARRIERS } from "../../data/sepCarriers";
import { Stars } from "./SEPCard";

function CarrierLogo({ carrierKey, size = 20 }) {
  const c = CARRIERS[carrierKey] || {};
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {c.logo ? (
        <img
          src={c.logo}
          alt={c.abbr || carrierKey}
          style={{ width: size, height: size, objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
          onError={(e) => {
            e.target.style.display = "none";
            if (e.target.nextSibling) e.target.nextSibling.style.display = "";
          }}
        />
      ) : null}
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%",
          backgroundColor: c.color || "var(--text-muted)", flexShrink: 0,
          display: c.logo ? "none" : "inline-block",
        }}
      />
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
        {c.abbr || carrierKey}
      </span>
    </span>
  );
}

export function PlanTable({
  planFilterCarrier, setPlanFilterCarrier,
  planFilterType, setPlanFilterType,
  planFilterSnp, setPlanFilterSnp,
  planSearch, setPlanSearch,
  filteredPlans, planCarrierOpts, planTypeOpts,
  expandedPlans, setExpandedPlans,
}) {
  return (
    <>
      {/* Filters */}
      <div className="card sep-filter-bar">
        <span className="sep-filter-label">
          <Filter size={16} /> Filter
        </span>
        <select value={planFilterCarrier} onChange={(e) => setPlanFilterCarrier(e.target.value)}>
          <option value="all">All Carriers</option>
          {planCarrierOpts.map((c) => (
            <option key={c} value={c}>{CARRIERS[c]?.abbr || c}</option>
          ))}
        </select>
        <select value={planFilterType} onChange={(e) => setPlanFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {planTypeOpts.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={planFilterSnp} onChange={(e) => setPlanFilterSnp(e.target.value)}>
          <option value="all">All Plans</option>
          <option value="D-SNP">D-SNP Only</option>
          <option value="C-SNP">C-SNP Only</option>
          <option value="none">Non-SNP Only</option>
        </select>
        <input
          type="text"
          className="input-dark"
          value={planSearch}
          onChange={(e) => setPlanSearch(e.target.value)}
          placeholder="Search plans or contract ID..."
          style={{ flex: "1 1 160px", minWidth: 120 }}
        />
        {(planFilterCarrier !== "all" || planFilterType !== "all" || planFilterSnp !== "all" || planSearch) && (
          <button
            className="undo-btn"
            onClick={() => {
              setPlanFilterCarrier("all");
              setPlanFilterType("all");
              setPlanFilterSnp("all");
              setPlanSearch("");
            }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card sep-plan-table-wrap">
        <div className="sep-plan-table-scroll">
          <table className="sep-plan-table">
            <thead>
              <tr>
                {["Carrier", "Plan Name / ID", "Type", "Stars", "Premium", "MOOP", ""].map((h, i) => (
                  <th
                    key={h + i}
                    style={{
                      textAlign: ["Premium", "MOOP"].includes(h)
                        ? "right"
                        : ["Stars", ""].includes(h)
                        ? "center"
                        : "left",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPlans.length > 0 ? (
                filteredPlans.map((p, idx) => {
                  const c = CARRIERS[p.carrier] || {};
                  const pKey = `${p.cid}-${p.pbp}-${p.carrier}`;
                  const isOpen = !!expandedPlans[pKey];
                  return (
                    <React.Fragment key={pKey + idx}>
                      <tr
                        className={isOpen ? "expanded" : ""}
                        onClick={() => setExpandedPlans((prev) => ({ ...prev, [pKey]: !prev[pKey] }))}
                      >
                        <td className="nowrap">
                          <CarrierLogo carrierKey={p.carrier} />
                        </td>
                        <td>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                            {p.name}
                          </div>
                          <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                            {p.cid}-{p.pbp}
                          </div>
                        </td>
                        <td>
                          <span className="sep-type-badge">{p.type}</span>
                          {p.snp && <span className="sep-snp-badge">{p.snp}</span>}
                        </td>
                        <td className="text-center"><Stars count={p.stars} /></td>
                        <td className="text-right nowrap" style={{ fontWeight: 700, color: p.prem === 0 ? "var(--accent-green)" : "var(--text-primary)" }}>
                          {p.prem === 0 ? "$0" : `$${p.prem.toFixed(2)}`}
                        </td>
                        <td className="text-right nowrap" style={{ color: "var(--text-secondary)" }}>
                          {p.moop ? `$${p.moop.toLocaleString()}` : "-"}
                        </td>
                        <td style={{ color: "var(--text-muted)", transition: "transform 0.25s ease", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div className="sep-plan-detail">
                              <div className="sep-plan-benefits">
                                {p.dental && <span className="sep-benefit-pill"><span>Dental</span></span>}
                                {p.vision && <span className="sep-benefit-pill"><span>Vision</span></span>}
                                {p.hearing && <span className="sep-benefit-pill"><span>Hearing</span></span>}
                                {p.transport && <span className="sep-benefit-pill"><span>{p.transport}</span></span>}
                              </div>
                              <div className="sep-plan-ids">
                                <div className="sep-plan-id-box">
                                  <div className="sep-plan-id-label">Contract ID</div>
                                  <div className="sep-plan-id-value mono">{p.cid}</div>
                                </div>
                                <div className="sep-plan-id-box">
                                  <div className="sep-plan-id-label">PBP</div>
                                  <div className="sep-plan-id-value mono">{p.pbp}</div>
                                </div>
                                <div className="sep-plan-id-box">
                                  <div className="sep-plan-id-label">Carrier</div>
                                  <div className="sep-plan-id-value">{c.name || p.carrier}</div>
                                </div>
                                {p.orgName && (
                                  <div className="sep-plan-id-box">
                                    <div className="sep-plan-id-label">Organization</div>
                                    <div className="sep-plan-id-value">{p.orgName}</div>
                                  </div>
                                )}
                                {p.countyName && (
                                  <div className="sep-plan-id-box">
                                    <div className="sep-plan-id-label">County</div>
                                    <div className="sep-plan-id-value">{p.countyName}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center muted" style={{ padding: "48px 24px" }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No plans match current filters</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting filters above.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
