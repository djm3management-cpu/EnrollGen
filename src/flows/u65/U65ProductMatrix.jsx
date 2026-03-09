/**
 * U65ProductMatrix.jsx — Interactive product comparison
 * Shows EnrollPrime vs PALIC vs LIFE-X side by side
 */

const PRODUCTS = {
  enrollprime: {
    label: "EnrollPrime / AFI",
    subtitle: "Association PPO",
    color: "#38bdf8",
    rows: [
      { feature: "Plan Type", value: "Group PPO (Association)" },
      { feature: "Network", value: "Cigna PPO — national" },
      { feature: "ACA-Compliant", value: "No — NOT MEC" },
      { feature: "Guaranteed Issue", value: "Verify with O'Neill" },
      { feature: "Pre-Ex Waiting Period", value: "Verify with carrier" },
      { feature: "Rx Coverage", value: "Included in plan" },
      { feature: "Dental / Vision", value: "Not included" },
      { feature: "UW Required", value: "Varies — verify" },
      { feature: "Effective Date", value: "1st of following month" },
      { feature: "Enrollment Portal", value: "enrollprime.com" },
      { feature: "Back Office", value: "1enrollment.com/manage" },
      { feature: "Best For", value: "PPO access, moderate utilization" },
    ],
  },
  palic: {
    label: "PALIC HSP Gold",
    subtitle: "Fixed-Benefit Indemnity",
    color: "#fbbf24",
    rows: [
      { feature: "Plan Type", value: "Fixed-Benefit Indemnity" },
      { feature: "Network", value: "First Health PPO — 926K+ providers" },
      { feature: "ACA-Compliant", value: "No — NOT MEC" },
      { feature: "Guaranteed Issue", value: "No — full medical UW" },
      { feature: "Pre-Ex Waiting Period", value: "12 months" },
      { feature: "Rx Coverage", value: "Not included (fixed payouts only)" },
      { feature: "Dental / Vision", value: "Not included" },
      { feature: "UW Required", value: "Yes — full medical UW" },
      { feature: "Effective Date", value: "1st of following month (if approved)" },
      { feature: "Enrollment Portal", value: "apps.neweralife.com/site" },
      { feature: "Back Office", value: "New Era Life portal" },
      { feature: "Best For", value: "Healthy, budget-conscious, low utilization" },
    ],
  },
  lifex: {
    label: "LIFE-X / BHPI",
    subtitle: "Group Health",
    color: "#a855f7",
    rows: [
      { feature: "Plan Type", value: "Employer Group (Research Assoc.)" },
      { feature: "Network", value: "Anthem — national" },
      { feature: "ACA-Compliant", value: "No — NOT MEC (but 1095-B/C issued)" },
      { feature: "Guaranteed Issue", value: "Simplified / GI options available" },
      { feature: "Pre-Ex Waiting Period", value: "Varies by option" },
      { feature: "Rx Coverage", value: "Proact Rx — included" },
      { feature: "Dental / Vision", value: "Not included" },
      { feature: "UW Required", value: "Simplified or GI options" },
      { feature: "Effective Date", value: "1st of following month" },
      { feature: "Enrollment Portal", value: "LIFE-X enrollment portal" },
      { feature: "Back Office", value: "Agent support: (307) 452-5055" },
      { feature: "Best For", value: "Moderate-high UW risk, group-style benefits" },
    ],
  },
};

const FEATURE_LABELS = PRODUCTS.enrollprime.rows.map((r) => r.feature);

export default function U65ProductMatrix({ selectedProducts = [] }) {
  const active = selectedProducts.filter((p) => PRODUCTS[p]);

  if (active.length === 0) {
    return (
      <div
        style={{
          marginBottom: 14,
          padding: "12px 14px",
          background: "rgba(168,85,247,0.03)",
          border: "1px solid rgba(168,85,247,0.12)",
          borderRadius: 8,
          fontSize: 12,
          color: "#4a5568",
          textAlign: "center",
        }}
      >
        No products selected — check products in Gate 3 to populate comparison
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#4a5568",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Product Comparison
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "#4a5568",
                  fontWeight: 600,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 11,
                  minWidth: 140,
                }}
              >
                Feature
              </th>
              {active.map((pk) => {
                const p = PRODUCTS[pk];
                return (
                  <th
                    key={pk}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      borderBottom: `2px solid ${p.color}40`,
                      minWidth: 160,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: p.color }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 400, color: "#4a5568", marginTop: 1 }}>
                      {p.subtitle}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {FEATURE_LABELS.map((feature, i) => {
              const isHighlight = feature === "ACA-Compliant" || feature === "UW Required" || feature === "Pre-Ex Waiting Period";
              return (
                <tr
                  key={feature}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    background: i % 2 === 0 ? "rgba(255,255,255,0.008)" : "transparent",
                  }}
                >
                  <td
                    style={{
                      padding: "7px 12px",
                      color: isHighlight ? "#c0d0e4" : "#6b7a8d",
                      fontWeight: isHighlight ? 600 : 400,
                      fontSize: 11,
                    }}
                  >
                    {feature}
                  </td>
                  {active.map((pk) => {
                    const p = PRODUCTS[pk];
                    const row = p.rows.find((r) => r.feature === feature);
                    const val = row?.value ?? "—";
                    const isNo = val.startsWith("No");
                    const isYes = val.startsWith("Yes");
                    const isGI = val.includes("GI") || val.includes("Simplified");
                    return (
                      <td
                        key={pk}
                        style={{
                          padding: "7px 12px",
                          color: isNo && isHighlight
                            ? "#f87171"
                            : isYes && isHighlight
                            ? "#34d399"
                            : isGI
                            ? "#fbbf24"
                            : "#c0d0e4",
                          fontSize: 12,
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 8,
          padding: "7px 12px",
          background: "rgba(248,113,113,0.05)",
          border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 6,
          fontSize: 11,
          color: "#f87171",
        }}
      >
        ⚠ All products: NOT minimum essential coverage — NOT a substitute for ACA-compliant major medical insurance
      </div>
    </div>
  );
}
