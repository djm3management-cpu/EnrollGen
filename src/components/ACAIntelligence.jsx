import { useState, useMemo, useCallback, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import { getStateFromZip } from "../lib/sepGeo";
import { getCountyFromZip } from "../data/sepPlanDb";
import { useKnowledge } from "../hooks/useKnowledge";
import { useTenantConfig } from "../hooks/useTenantConfig";

const SBE_STATES = { NJ: "sbe_plans_nj_2025", PA: "sbe_plans_pa_2025", VA: "sbe_plans_va_2025" };

const METAL_ORDER = ["Catastrophic", "Expanded Bronze", "Bronze", "Silver", "Gold", "Platinum"];
const METAL_COLORS = {
  Catastrophic: "var(--text-muted)",
  "Expanded Bronze": "var(--warning)",
  Bronze: "var(--accent)",
  Silver: "var(--text-secondary)",
  Gold: "var(--status-pending)",
  Platinum: "var(--text-primary)",
};

function parseDollar(v) {
  if (!v || typeof v !== "string") return null;
  const n = parseFloat(v.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

function fmt(n) { return n == null ? "-" : `$${n.toLocaleString()}`; }
function fmtRange(lo, hi) { return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`; }
function fmtDate(value) {
  if (!value) return "No DB sync";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isAdminUser(user) {
  const role =
    user?.publicMetadata?.role ||
    user?.organizationMemberships?.[0]?.role ||
    user?.organizationMemberships?.[0]?.publicMetadata?.role;
  return role === "admin" || role === "org:admin" || user?.publicMetadata?.isAdmin === true;
}

function diffPreview(before = "", after = "") {
  const beforeLines = before.split("\n").slice(0, 8).join("\n");
  const afterLines = after.split("\n").slice(0, 8).join("\n");
  return { beforeLines, afterLines };
}

/* Styles */
const card = {
  background: "var(--eg-surface-2)",
  borderRadius: "var(--eg-radius-card)",
  border: "1px solid var(--eg-border)",
  padding: "16px 18px",
};
const label = {
  fontFamily: "var(--eg-font-mono)",
  fontWeight: 500,
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--eg-text-faint)",
};
const mono = { fontFamily: "var(--eg-font-mono)", fontWeight: 500 };

export default function ACAIntelligence() {
  const { user } = useUser();
  const isAdmin = isAdminUser(user);
  const { supabaseClient } = useTenantConfig();
  const { entries: acaKnowledgeEntries } = useKnowledge("compliance_aca");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [source, setSource] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [reviewBusyId, setReviewBusyId] = useState(null);

  const knowledgeLastUpdated = useMemo(() => {
    const dates = acaKnowledgeEntries
      .map((entry) => entry.last_verified_at || entry.updated_at || entry.created_at)
      .filter(Boolean)
      .map((value) => Date.parse(value))
      .filter(Number.isFinite);
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  }, [acaKnowledgeEntries]);

  const refreshPendingUpdates = useCallback(async () => {
    try {
      const { data: rows, error: pendingError } = await supabaseClient
        .from("knowledge_updates")
        .select(`
          id,
          knowledge_base_id,
          previous_content,
          new_content,
          change_summary,
          confidence_score,
          status,
          created_at,
          knowledge_base:knowledge_base_id (
            id,
            tenant_id,
            category,
            key,
            title,
            content,
            metadata,
            version,
            source_urls
          )
        `)
        .eq("status", "pending_review")
        .order("created_at", { ascending: false })
        .limit(12);

      if (pendingError) throw pendingError;
      setPendingUpdates(rows || []);
    } catch (err) {
      console.warn("[ACAIntelligence] pending knowledge updates unavailable:", err);
      setPendingUpdates([]);
    }
  }, [supabaseClient]);

  useEffect(() => {
    refreshPendingUpdates();
  }, [refreshPendingUpdates]);

  const reviewUpdate = useCallback(async (update, action) => {
    if (!isAdmin || !update?.knowledge_base) return;
    setReviewBusyId(update.id);
    try {
      if (action === "approve") {
        const base = update.knowledge_base;
        const nextVersion = Number(base.version || 1) + 1;

        const { error: deactivateError } = await supabaseClient
          .from("knowledge_base")
          .update({ is_active: false })
          .eq("id", base.id);
        if (deactivateError) throw deactivateError;

        const { error: insertError } = await supabaseClient
          .from("knowledge_base")
          .insert({
            tenant_id: base.tenant_id,
            category: base.category,
            key: base.key,
            title: base.title,
            content: update.new_content,
            metadata: {
              ...(base.metadata || {}),
              reviewed_update_id: update.id,
            },
            version: nextVersion,
            is_active: true,
            source_urls: base.source_urls || [],
            last_verified_at: new Date().toISOString(),
          });
        if (insertError) throw insertError;

        const { error: updateError } = await supabaseClient
          .from("knowledge_updates")
          .update({
            status: "published",
            change_source: "agentic_review",
            reviewed_by: user?.id || "admin",
          })
          .eq("id", update.id);
        if (updateError) throw updateError;
      } else {
        const { error: rejectError } = await supabaseClient
          .from("knowledge_updates")
          .update({
            status: "rejected",
            reviewed_by: user?.id || "admin",
          })
          .eq("id", update.id);
        if (rejectError) throw rejectError;
      }
      await refreshPendingUpdates();
    } catch (err) {
      console.error("[ACAIntelligence] review failed:", err);
      setError(err.message || "Knowledge review failed");
    } finally {
      setReviewBusyId(null);
    }
  }, [isAdmin, refreshPendingUpdates, supabaseClient, user?.id]);

  const handleSearch = useCallback(async () => {
    const z = zip.trim();
    if (!z || z.length < 5) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const st = getStateFromZip(z);
      if (!st || st === "Unknown") { setError("Invalid zip code"); setLoading(false); return; }
      const countyName = getCountyFromZip(z);

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
        setSource(`SBE, ${st}`);
      } else {
        let q = supabase
          .from("qhp_landscape_2026")
          .select("metal_level, plan_marketing_name, plan_type, issuer_name, plan_id_standard_component, premium_adult_individual_age_27, medical_deductible_individual_standard, medical_maximum_out_of_pocket_individual_standard");
        q = q.eq("state_code", st);
        if (countyName) q = q.ilike("county_name", countyName);

        const { data: d, error: e } = await q;
        if (e) throw e;
        rows = (d || []).map((r) => ({
          metal: r.metal_level, name: r.plan_marketing_name, type: r.plan_type,
          issuer: r.issuer_name, planId: r.plan_id_standard_component,
          premium: parseDollar(r.premium_adult_individual_age_27),
          deductible: parseDollar(r.medical_deductible_individual_standard),
          moop: parseDollar(r.medical_maximum_out_of_pocket_individual_standard),
        }));
        setSource(countyName ? `FFE, ${st}, ${countyName} County` : `FFE, ${st} (all counties)`);
      }

      if (!rows.length) {
        setError(`No plans found for ${st}${countyName ? `, ${countyName} County` : ""}`);
        setLoading(false);
        return;
      }
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
        <span style={{ ...label, color: "var(--accent)", fontSize: "0.82rem" }}>ACA INTELLIGENCE</span>
        <span style={{ ...mono, fontSize: "0.62rem", color: "var(--text-muted)" }}>
          KB {fmtDate(knowledgeLastUpdated)}
        </span>
        <span
          style={{
            ...mono,
            fontSize: "0.62rem",
            color: pendingUpdates.length ? "var(--accent)" : "var(--text-muted)",
            border: "1px solid var(--status-pending-border)",
            borderRadius: 999,
            padding: "3px 8px",
            background: pendingUpdates.length ? "var(--status-pending-bg)" : "color-mix(in srgb, var(--text-primary) 3%, transparent)",
          }}
        >
          {pendingUpdates.length} PENDING
        </span>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, pointerEvents: "none" }}>⌕</span>
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
            background: "var(--status-pending-bg)", border: "1px solid var(--status-pending-border)",
            borderRadius: 999, padding: "7px 20px", cursor: loading ? "wait" : "pointer",
            fontFamily: "var(--font-body)", fontWeight: 800,
            fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--accent)", transition: "all 0.15s ease",
          }}
        >
          {loading ? "LOADING..." : "SEARCH"}
        </button>
        {source && (
          <span style={{ ...mono, fontSize: "0.65rem", color: "var(--text-muted)" }}>{source}</span>
        )}
      </div>

      {error && (
        <div style={{ ...card, borderColor: "var(--status-offline-border)", color: "var(--status-offline)", fontSize: "0.8rem" }}>{error}</div>
      )}

      {isAdmin && pendingUpdates.length > 0 && (
        <section style={card}>
          <h3 style={{ ...label, margin: "0 0 12px", color: "var(--accent)" }}>Pending Knowledge Updates</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingUpdates.map((update) => {
              const preview = diffPreview(update.previous_content, update.new_content);
              return (
                <article
                  key={update.id}
                  style={{
                    borderRadius: 12,
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    padding: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ ...label, color: "var(--text-primary)", marginBottom: 4 }}>
                        {update.knowledge_base?.title || update.knowledge_base?.key || "Knowledge Entry"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                        {update.change_summary || "Agentic update pending review."}
                      </div>
                    </div>
                    <div style={{ ...mono, color: "var(--accent)", fontSize: "0.68rem" }}>
                      {Math.round(Number(update.confidence_score || 0) * 100)}%
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    <pre style={diffBoxStyle}>{preview.beforeLines}</pre>
                    <pre style={{ ...diffBoxStyle, borderColor: "var(--status-live-border)" }}>{preview.afterLines}</pre>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      disabled={reviewBusyId === update.id}
                      onClick={() => reviewUpdate(update, "reject")}
                      style={reviewButtonStyle}
                    >
                      REJECT
                    </button>
                    <button
                      type="button"
                      disabled={reviewBusyId === update.id}
                      onClick={() => reviewUpdate(update, "approve")}
                      style={{
                        ...reviewButtonStyle,
                        color: "var(--status-live)",
                        borderColor: "var(--status-live-border)",
                        background: "var(--status-live-bg)",
                      }}
                    >
                      APPROVE
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {stats && (
        <>
          {/* Summary stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <StatBox label="TOTAL PLANS" value={stats.total} color="var(--accent)" />
            <StatBox label="ISSUERS" value={stats.issuers.length} color="var(--info)" />
            <StatBox label="METAL TIERS" value={stats.tiers.length} color="var(--status-live)" />
            <StatBox label="PLAN TYPES" value={stats.types.length} color="var(--chart-4)" />
          </div>

          {/* Metal tier breakdown */}
          <section style={card}>
            <h3 style={{ ...label, margin: "0 0 14px" }}>Plans by Metal Tier</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <th style={th}>Tier</th>
                    <th style={th}>Plans</th>
                    {hasPremiums && <th style={th}>Premium (Age 27)</th>}
                    <th style={th}>Deductible</th>
                    <th style={th}>Max OOP</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.tiers.map((t) => (
                    <tr key={t.metal} style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <td style={{ ...td, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: METAL_COLORS[t.metal] || "var(--text-muted)", flexShrink: 0 }} />
                        {t.metal}
                      </td>
                      <td style={{ ...td, ...mono, color: "var(--accent)" }}>{t.count}</td>
                      {hasPremiums && (
                        <td style={{ ...td, ...mono, color: "var(--text-primary)" }}>
                          {t.premLo != null ? fmtRange(t.premLo, t.premHi) : "-"}
                        </td>
                      )}
                      <td style={{ ...td, ...mono, color: "var(--text-primary)" }}>
                        {t.dedLo != null ? fmtRange(t.dedLo, t.dedHi) : "-"}
                      </td>
                      <td style={{ ...td, ...mono, color: "var(--text-primary)" }}>
                        {t.moopLo != null ? fmtRange(t.moopLo, t.moopHi) : "-"}
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
                    background: "var(--status-pending-bg)", border: "1px solid var(--status-pending-border)",
                    fontSize: "0.68rem", color: "var(--text-primary)", whiteSpace: "nowrap",
                  }}>{iss}</span>
                ))}
              </div>
            </section>

            <section style={card}>
              <h3 style={{ ...label, margin: "0 0 10px" }}>Plan Type Breakdown</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {stats.types.map(([type, count]) => (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{type}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: Math.min(200, (count / stats.total) * 200), height: 6,
                        borderRadius: 3, background: "var(--status-pending-border)",
                      }} />
                      <span style={{ ...mono, fontSize: "0.7rem", color: "var(--accent)", minWidth: 30, textAlign: "right" }}>{count}</span>
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
      <span style={{ ...label, fontSize: "0.58rem", color: "var(--text-muted)" }}>{lbl}</span>
    </div>
  );
}

const th = {
  textAlign: "left", padding: "8px 10px",
  fontFamily: "var(--font-body)", fontWeight: 700,
  fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)",
};
const td = { padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.75rem" };
const diffBoxStyle = {
  margin: 0,
  minHeight: 120,
  maxHeight: 220,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  borderRadius: 10,
  border: "1px solid var(--status-offline-border)",
  background: "var(--bg-primary)",
  padding: 10,
  color: "var(--text-secondary)",
  fontSize: "0.66rem",
  fontFamily: "var(--font-mono)",
  lineHeight: 1.5,
};
const reviewButtonStyle = {
  border: "1px solid var(--border-default)",
  background: "var(--border-default)",
  borderRadius: 999,
  color: "var(--text-secondary)",
  padding: "6px 12px",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 800,
  fontSize: "0.62rem",
  letterSpacing: "0.1em",
};
