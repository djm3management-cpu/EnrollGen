/**
 * U65ProductMatrix.jsx — Side-by-side EnrollPrime vs PALIC comparison
 * Purple accent, dark theme, recommended product glow
 */

const ACCENT = "#a855f7";

const PRODUCTS = {
  enrollprime: {
    label: "EnrollPrime / AFI",
    subtitle: "Association PPO",
    color: "#38bdf8",
    rows: [
      { feature: "Plan Type", value: "Association Group PPO" },
      { feature: "Network", value: "Cigna PPO (national)" },
      { feature: "Structure", value: "Copays + deductible + coinsurance" },
      { feature: "Outpatient Deductible", value: "Varies by plan" },
      { feature: "UW Required", value: "Yes — verify with O'Neill" },
      { feature: "Pre-Ex Exclusion", value: "Varies" },
      { feature: "MEC Status", value: "Not MEC" },
      { feature: "Calendar Year Max", value: "Varies" },
      { feature: "Enrollment Portal", value: "enrollprime.com" },
      { feature: "Back Office", value: "1enrollment.com/manage" },
      { feature: "Best For", value: "PPO access, moderate+ budget" },
    ],
  },
  palic: {
    label: "PALIC HSP Gold",
    subtitle: "Fixed Indemnity",
    color: "#fbbf24",
    rows: [
      { feature: "Plan Type", value: "Fixed Indemnity" },
      { feature: "Network", value: "First Health PPO (926K+ providers)" },
      { feature: "Structure", value: "Fixed dollar payouts per service" },
      { feature: "Outpatient Deductible", value: "$0 (first-dollar)" },
      { feature: "UW Required", value: "Yes — full medical questions" },
      { feature: "Pre-Ex Exclusion", value: "12 months" },
      { feature: "MEC Status", value: "Not MEC" },
      { feature: "Calendar Year Max", value: "$250K / $500K / $1M (by tier)" },
      { feature: "Enrollment Portal", value: "apps.neweralife.com/site" },
      { feature: "Back Office", value: "New Era Life portal" },
      { feature: "Best For", value: "Healthy, budget-first" },
    ],
  },
};

const FEATURE_LABELS = PRODUCTS.enrollprime.rows.map((r) => r.feature);

export default function U65ProductMatrix({ selectedProducts = [], recommended }) {
  const active = selectedProducts.filter((p) => PRODUCTS[p]);

  if (active.length === 0) {
    return (
      <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(168,85,247,0.03)", border: "1px solid rgba(168,85,247,0.12)", borderRadius: 8, fontSize: 12, color: "#4a5568", textAlign: "center" }}>
        No products selected — check products in Gate 3 to populate comparison
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        Product Comparison
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "#4a5568", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, minWidth: 140 }}>
                Feature
              </th>
              {active.map((pk) => {
                const p = PRODUCTS[pk];
                const isRec = pk === recommended;
                return (
                  <th key={pk} style={{
                    textAlign: "left", padding: "8px 12px",
                    borderBottom: `2px solid ${isRec ? `${ACCENT}60` : `${p.color}40`}`,
                    minWidth: 160,
                    boxShadow: isRec ? `inset 0 -3px 8px rgba(168,85,247,0.08)` : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isRec ? ACCENT : p.color }}>{p.label}</span>
                      {isRec && <span style={{ fontSize: 8, fontWeight: 700, color: ACCENT, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>REC</span>}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 400, color: "#4a5568", marginTop: 1 }}>{p.subtitle}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {FEATURE_LABELS.map((feature, i) => {
              const isHighlight = feature === "MEC Status" || feature === "UW Required" || feature === "Pre-Ex Exclusion";
              return (
                <tr key={feature} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(255,255,255,0.008)" : "transparent" }}>
                  <td style={{ padding: "7px 12px", color: isHighlight ? "#c0d0e4" : "#6b7a8d", fontWeight: isHighlight ? 600 : 400, fontSize: 11 }}>
                    {feature}
                  </td>
                  {active.map((pk) => {
                    const p = PRODUCTS[pk];
                    const row = p.rows.find((r) => r.feature === feature);
                    const val = row?.value ?? "—";
                    const isMec = feature === "MEC Status";
                    return (
                      <td key={pk} style={{ padding: "7px 12px", color: isMec ? "#f87171" : "#c0d0e4", fontSize: 12, fontWeight: isMec ? 600 : 400 }}>
                        {isMec ? `❌ ${val}` : val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, padding: "7px 12px", background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, fontSize: 11, color: "#f87171" }}>
        All products: NOT minimum essential coverage — NOT a substitute for ACA-compliant major medical insurance
      </div>
    </div>
  );
}
