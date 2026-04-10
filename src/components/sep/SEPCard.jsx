import { ChevronRight, Clock, Shield, MapPin, Star as StarIcon } from "lucide-react";
import { CARRIERS } from "../../data/sepCarriers";

export function Stars({ count }) {
  if (count == null) return <span className="muted">—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon
          key={i}
          size={11}
          fill={i <= Math.floor(count) ? "#fbbf24" : "none"}
          stroke="#fbbf24"
          strokeWidth={1.5}
        />
      ))}
      {count % 1 !== 0 && <span style={{ fontSize: "10px", color: "#fbbf24" }}>.5</span>}
    </span>
  );
}

export function ProductBadge({ product }) {
  const cls = { MA: "ma", MAPD: "mapd", PDP: "pdp", Medigap: "medigap", "D-SNP": "dsnp", "I-SNP": "isnp", "C-SNP": "csnp" }[product] || "ma";
  return <span className={`sep-product-badge ${cls}`}>{product}</span>;
}

function CarrierDot({ carrierKey, size = 6 }) {
  const c = CARRIERS[carrierKey] || {};
  if (c.logo) {
    return (
      <img
        src={c.logo}
        alt={c.abbr}
        style={{ width: size * 2.5, height: size * 2.5, objectFit: "contain", borderRadius: 2, flexShrink: 0 }}
        onError={(e) => {
          e.target.style.display = "none";
          e.target.nextSibling && (e.target.nextSibling.style.display = "");
        }}
      />
    );
  }
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", backgroundColor: c.color || "#666", flexShrink: 0, display: "inline-block" }} />
  );
}

export function SEPCard({ sep, isExpanded, onToggle }) {
  const catCls = sep.category === "FEMA Disaster" ? "fema" : "medicare";
  const urgCls = sep.urgency || "info";
  const daysCls = sep.daysLeft != null
    ? sep.daysLeft <= 14 ? "critical" : sep.daysLeft <= 30 ? "warning" : "normal"
    : null;

  return (
    <div className={`sep-sep-card ${catCls} ${isExpanded ? "expanded" : ""}`}>
      <div className="sep-sep-header" onClick={onToggle}>
        <span style={{ color: "var(--text-muted)", transition: "transform 0.25s ease", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", display: "flex" }}>
          <ChevronRight size={18} strokeWidth={2.5} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <span className={`sep-urgency-pill ${urgCls}`}>
              {{ high: "URGENT", medium: "ACTIVE", low: "OPEN", info: "ONGOING" }[urgCls]}
            </span>
            <span className={`sep-category-pill ${catCls}`}>{sep.category}</span>
            {sep.code === "5-STAR" && <StarIcon size={14} fill="#fbbf24" stroke="#fbbf24" strokeWidth={1} />}
            {daysCls && <span className={`sep-days-pill ${daysCls}`}>{sep.daysLeft}d left</span>}
          </div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {sep.type}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {sep.event}
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "200px" }}>
          {sep.eligibleProducts.slice(0, 4).map((p) => (
            <ProductBadge key={p} product={p} />
          ))}
          {sep.eligibleProducts.length > 4 && (
            <span className="muted" style={{ padding: "2px 4px" }}>+{sep.eligibleProducts.length - 4}</span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="sep-sep-body">
          <p>{sep.description}</p>
          <div className="sep-info-grid">
            <div className="sep-info-box">
              <div className="sep-info-box-label">
                <Clock size={14} /> Enrollment Window
              </div>
              <div className="sep-info-box-main">{sep.duration}</div>
              {sep.startDate !== "Year-round" && sep.startDate !== "Varies by individual" && (
                <div className="sep-info-box-sub">{sep.startDate} → {sep.endDate}</div>
              )}
            </div>
            <div className="sep-info-box">
              <div className="sep-info-box-label">
                <Shield size={16} /> Eligible Products
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "4px" }}>
                {sep.eligibleProducts.map((p) => <ProductBadge key={p} product={p} />)}
              </div>
            </div>
            <div className="sep-info-box">
              <div className="sep-info-box-label">Source</div>
              <div className="sep-info-box-main">{sep.source}</div>
              <div className="sep-info-box-sub">Code: {sep.code}</div>
            </div>
          </div>

          {sep.counties && (
            <div className="sep-info-box" style={{ marginBottom: "18px" }}>
              <div className="sep-info-box-label">
                <MapPin size={14} /> Affected Counties
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {sep.counties.join("  •  ")}
              </div>
            </div>
          )}

          {sep.matchingPlans && sep.matchingPlans.length > 0 && (
            <div className="sep-info-box">
              <div className="sep-info-box-label">
                Eligible Plans Under This SEP ({sep.matchingPlans.length})
              </div>
              <div style={{ overflowX: "auto", marginTop: "8px" }}>
                <table className="sep-sub-table">
                  <thead>
                    <tr>
                      {["Carrier", "Plan", "ID", "Type", "Stars", "Premium", "MOOP"].map((h) => (
                        <th key={h} style={{ textAlign: h === "Premium" || h === "MOOP" ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sep.matchingPlans.map((p, i) => {
                      const cr = CARRIERS[p.carrier] || {};
                      return (
                        <tr key={`${p.cid}-${p.pbp}-${i}`}>
                          <td className="nowrap">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <CarrierDot carrierKey={p.carrier} size={6} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{cr.abbr}</span>
                            </span>
                          </td>
                          <td style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", maxWidth: 200 }}>{p.name}</td>
                          <td className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.cid}-{p.pbp}</td>
                          <td>
                            <span className="sep-type-badge">{p.type}</span>
                            {p.snp && <span className="sep-snp-badge">{p.snp}</span>}
                          </td>
                          <td><Stars count={p.stars} /></td>
                          <td className="text-right" style={{ fontWeight: 700, color: p.prem === 0 ? "var(--accent-green)" : "var(--text-primary)", fontSize: 11 }}>
                            {p.prem === 0 ? "$0" : `$${p.prem.toFixed(2)}`}
                          </td>
                          <td className="text-right" style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>
                            {p.moop ? `$${p.moop.toLocaleString()}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sep.matchingPlans && sep.matchingPlans.length === 0 && (
            <div className="sep-info-box" style={{ color: "var(--text-muted)", fontSize: 13 }}>
              No matching plans found in this zip for this SEP type.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
