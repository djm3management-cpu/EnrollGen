import { useState, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getStateFromZip } from "../lib/sepGeo";
import { getCountyFromZip } from "../data/sepPlanDb";

const SBE_STATES = { NJ: "sbe_plans_nj_2025", PA: "sbe_plans_pa_2025", VA: "sbe_plans_va_2025" };

const METAL_ORDER = ["Catastrophic", "Expanded Bronze", "Bronze", "Silver", "Gold", "Platinum"];
const METAL_COLORS = {
  Catastrophic: "#9CA3AF", "Expanded Bronze": "#D97706", Bronze: "#CD7F32",
  Silver: "#C0C0C0", Gold: "#FFD700", Platinum: "#E5E4E2",
};

function parseDollar(v) {
  if (!v || typeof v !== "string") return null;
  const n = parseFloat(v.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

function fmt(n) { return n == null ? "—" : `$${n.toLocaleString()}`; }
function fmtRange(lo, hi) { return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`; }

/* ── Styles ─── */
const card = {
  background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
  borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)",
  padding: "18px 22px",
};
const label = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
  fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8E99A7",
};
const mono = { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 };

export default function ACAIntelligence() {
  const [zip, setZip] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [county, setCounty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [source, setSource] = useState("");

  const handleSearch = useCallback(async () => {
    const z = zip.trim();
    if (!z || z.length < 5) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const st = getStateFromZip(z);
      if (!st || st === "Unknown") { setError("Invalid zip code"); setLoading(false); return; }
      setStateCode(st);
      const co = getCountyFromZip(z);
      setCounty(co || "");

      let rows;
      if (SBE_STATES[st]) {
        const { data: d, error: e } = await supabase
          .from(SBE_STATES[st])
          .select("metal_level, plan_marketing_name, plan_type, issuer_id, standard_component_id, tehb_ded_inn_tier_1_individual, tehb_inn_tier_1_individual_moop")
          .eq("market_coverage", "Individual")
          .not("metal_level", "eq", "");
        if (e) throw e;
        rows = (d || []).map((r) => ({
          metal: r.metal_level, name: r.plan_marketing_name, type: r.plan_type,
          issuer: r.issuer_id, planId: r.standard_component_id,
          premium: null, deductible: parseDollar(r.tehb_ded_inn_tier_1_individual),
          moop: parseDollar(r.tehb_inn_tier_1_individual_moop),
        }));
        setSource(`SBE — ${st}`);
      } else {
        let q = supabase
          .from("qhp_landscape_2026")
          .select("metal_level, plan_marketing_name, plan_type, issuer_name, plan_id_standard_component, premium_adult_individual_age_27, medical_deductible_individual_standard, medical_maximum_out_of_pocket_individual_standard");
        q = q.eq("state_code", st);
        if (co) q = q.ilike("county_name", co);

        const { data: d, error: e } = await q;
        if (e) throw e;
        rows = (d || []).map((r) => ({
          metal: r.metal_level, name: r.plan_marketing_name, type: r.plan_type,
          issuer: r.issuer_name, planId: r.plan_id_standard_component,
          premium: parseDollar(r.premium_adult_individual_age_27),
          deductible: parseDollar(r.medical_deductible_individual_standard),
          moop: parseDollar(r.medical_maximum_out_of_pocket_individual_standard),
        }));
        setSource(co ? `FFE — ${st}, ${co} County` : `FFE — ${st} (all counties)`);
      }

      if (!rows.length) { setError(`No plans found for ${st}${co ? `, ${co} County` : ""}`); setLoading(false); return; }
      setData(rows);
    } catch (err) {
      console.error("[ACAIntelligence]", err);
      setError(err.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, [zip]);

  /* ── Derived stats ── */
  const stats = useMemo(() => {
    if (!data) return null;

    // Metal tiers
    const tiers = {};
    const issuersSet = new Set();
    const typeCount = {};

    for (const r of data) {
      const m = r.metal || "Unknown";
      if (!tiers[m]) tiers[m] = { count: 0, premiums: [], deductibles: [], moops: [] };
      tiers[m].count++;
      if (r.premium) tiers[m].premiums.push(r.premium);
      if (r.deductible != null) tiers[m].deductibles.push(r.deductible);
      if (r.moop != null) tiers[m].moops.push(r.moop);
      if (r.issuer) issuersSet.add(r.issuer);
      const t = r.type || "Other";
      typeCount[t] = (typeCount[t] || 0) + 1;
    }

    const tierList = Object.entries(tiers)
      .sort(([a], [b]) => {
        const ai = METAL_ORDER.indexOf(a); const bi = METAL_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(([metal, d]) => ({
        metal, count: d.count,
        premLo: d.premiums.length ? Math.min(...d.premiums) : null,
        premHi: d.premiums.length ? Math.max(...d.premiums) : null,
        dedLo: d.deductibles.length ? Math.min(...d.deductibles) : null,
        dedHi: d.deductibles.length ? Math.max(...d.deductibles) : null,
        moopLo: d.moops.length ? Math.min(...d.moops) : null,
        moopHi: d.moops.length ? Math.max(...d.moops) : null,
      }));

    return {
      total: data.length,
      tiers: tierList,
      issuers: [...issuersSet].sort(),
      types: Object.entries(typeCount).sort((a, b) => b[1] - a[1]),
    };
  }, [data]);

  const hasPremiums = stats?.tiers.some((t) => t.premLo != null);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Search bar */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ ...label, color: "#FFE45C", fontSize: "0.82rem" }}>ACA INTELLIGENCE</span>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#3A3A4A", fontSize: 14, pointerEvents: "none" }}>⌕</span>
          <input
            type="text" value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter zip code"
            style={{ width: "100%", paddingLeft: 34 }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || zip.length < 5}
          style={{
            background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)",
            borderRadius: 999, padding: "7px 20px", cursor: loading ? "wait" : "pointer",
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
            fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: "#FFE45C", transition: "all 0.15s ease",
          }}
        >
          {loading ? "LOADING..." : "SEARCH"}
        </button>
        {source && (
          <span style={{ ...mono, fontSize: "0.65rem", color: "#5A5A6A" }}>{source}</span>
        )}
      </div>

      {error && (
        <div style={{ ...card, borderColor: "rgba(255,90,90,0.2)", color: "#FF5A5A", fontSize: "0.8rem" }}>{error}</div>
      )}

      {stats && (
        <>
          {/* Summary stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <StatBox label="TOTAL PLANS" value={stats.total} color="#FFE45C" />
            <StatBox label="ISSUERS" value={stats.issuers.length} color="#22D3EE" />
            <StatBox label="METAL TIERS" value={stats.tiers.length} color="#39FF88" />
            <StatBox label="PLAN TYPES" value={stats.types.length} color="#C084FC" />
          </div>

          {/* Metal tier breakdown */}
          <section style={card}>
            <h3 style={{ ...label, margin: "0 0 14px" }}>Plans by Metal Tier</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th style={th}>Tier</th>
                    <th style={th}>Plans</th>
                    {hasPremiums && <th style={th}>Premium (Age 27)</th>}
                    <th style={th}>Deductible</th>
                    <th style={th}>Max OOP</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.tiers.map((t) => (
                    <tr key={t.metal} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ ...td, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: METAL_COLORS[t.metal] || "#666", flexShrink: 0 }} />
                        {t.metal}
                      </td>
                      <td style={{ ...td, ...mono, color: "#FFE45C" }}>{t.count}</td>
                      {hasPremiums && (
                        <td style={{ ...td, ...mono, color: "#D6DFE9" }}>
                          {t.premLo != null ? fmtRange(t.premLo, t.premHi) : "—"}
                        </td>
                      )}
                      <td style={{ ...td, ...mono, color: "#D6DFE9" }}>
                        {t.dedLo != null ? fmtRange(t.dedLo, t.dedHi) : "—"}
                      </td>
                      <td style={{ ...td, ...mono, color: "#D6DFE9" }}>
                        {t.moopLo != null ? fmtRange(t.moopLo, t.moopHi) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Issuers + Plan types side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <section style={card}>
              <h3 style={{ ...label, margin: "0 0 10px" }}>Issuers in Area</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {stats.issuers.map((iss) => (
                  <span key={iss} style={{
                    padding: "3px 10px", borderRadius: 999,
                    background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.18)",
                    fontSize: "0.68rem", color: "#D6DFE9", whiteSpace: "nowrap",
                  }}>{iss}</span>
                ))}
              </div>
            </section>

            <section style={card}>
              <h3 style={{ ...label, margin: "0 0 10px" }}>Plan Type Breakdown</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {stats.types.map(([type, count]) => (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "#B8B8C8" }}>{type}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: Math.min(200, (count / stats.total) * 200), height: 6,
                        borderRadius: 3, background: "rgba(234,179,8,0.3)",
                      }} />
                      <span style={{ ...mono, fontSize: "0.7rem", color: "#FFE45C", minWidth: 30, textAlign: "right" }}>{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Stat box ─── */
function StatBox({ label: lbl, value, color }) {
  return (
    <div style={{
      ...card, display: "flex", flexDirection: "column", alignItems: "center",
      gap: 4, padding: "14px 16px",
    }}>
      <span style={{ ...mono, fontSize: "1.6rem", color }}>{value}</span>
      <span style={{ ...label, fontSize: "0.58rem", color: "#5A5A6A" }}>{lbl}</span>
    </div>
  );
}

const th = {
  textAlign: "left", padding: "8px 10px",
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
  fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#5A5A6A",
};
const td = { padding: "8px 10px", color: "#B8B8C8", fontSize: "0.75rem" };
