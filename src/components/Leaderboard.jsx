import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";

/* ─── Bonus Tier Config (manager-adjustable) ─── */
const BONUS_TIERS = [
  { name: "Bronze",   threshold: 10, bonus: 250,  color: "#CD7F32" },
  { name: "Silver",   threshold: 20, bonus: 600,  color: "#C0C0C0" },
  { name: "Gold",     threshold: 35, bonus: 1200, color: "#FFD700" },
  { name: "Platinum", threshold: 50, bonus: 2000, color: "#E5E4E2" },
];

const PRODUCT_TYPES = ["MA", "MedSup", "ACA", "U65"];
const PRODUCT_COLORS = {
  MA:     "#E8002D",
  MedSup: "#00D166",
  ACA:    "#EAB308",
  U65:    "#a855f7",
};

/* ─── Time Filter Helpers ─── */
function getDateRange(filter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((day + 6) % 7));
      return { from: monday, to: today };
    }
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "quarter": {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      return { from: new Date(today.getFullYear(), qMonth, 1), to: today };
    }
    case "ytd":
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    case "all":
      return { from: new Date(2020, 0, 1), to: today };
    default:
      return { from: today, to: today };
  }
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

/* ─── Streak Calculator ─── */
function calcStreak(salesDates) {
  if (!salesDates.length) return 0;
  const unique = [...new Set(salesDates.map((d) => d))].sort().reverse();
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));

  if (unique[0] !== today && unique[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const curr = new Date(unique[i - 1]);
    const prev = new Date(unique[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

/* ─── Bonus Helpers ─── */
function getCurrentTier(count) {
  let earned = null;
  for (const tier of BONUS_TIERS) {
    if (count >= tier.threshold) earned = tier;
  }
  return earned;
}

function getNextTier(count) {
  for (const tier of BONUS_TIERS) {
    if (count < tier.threshold) return tier;
  }
  return null;
}

function getTotalBonus(count) {
  let total = 0;
  for (const tier of BONUS_TIERS) {
    if (count >= tier.threshold) total += tier.bonus;
  }
  return total;
}

/* ─── Styles ─── */
const S = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    padding: "4px 0",
    fontFamily: "var(--font-body)",
  },
  sectionTitle: {
    fontFamily: "var(--font-body)",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#F0F0F0",
    margin: 0,
  },
  sectionSubtitle: {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    color: "#4A4A5A",
    marginTop: 2,
  },
  card: {
    background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 10px 24px rgba(0,0,0,0.36)",
  },
  filterBar: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  filterBtn: (active) => ({
    padding: "6px 14px",
    borderRadius: 20,
    border: active ? "1px solid rgba(232,0,45,0.4)" : "1px solid rgba(255,255,255,0.08)",
    background: active
      ? "linear-gradient(180deg, rgba(232,0,45,0.15) 0%, rgba(232,0,45,0.05) 100%)"
      : "rgba(255,255,255,0.03)",
    color: active ? "#ff2244" : "#8A8A9A",
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.2s ease",
    textShadow: active ? "0 0 12px rgba(232,0,45,0.5)" : "none",
  }),
};

/* ─── Time Filter Chips ─── */
const TIME_FILTERS = [
  { id: "today", label: "Today" },
  { id: "week",  label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "ytd",  label: "YTD" },
  { id: "all",  label: "All Time" },
];

/* ────────────────────────────────────────────────────────── */
/*  AGENT STAT CARD                                          */
/* ────────────────────────────────────────────────────────── */
function AgentStatCard({ agent, rank }) {
  const isChampion = rank === 1;
  const borderColor = isChampion
    ? "rgba(255,215,0,0.35)"
    : rank === 2
      ? "rgba(192,192,192,0.25)"
      : rank === 3
        ? "rgba(205,127,50,0.25)"
        : "rgba(255,255,255,0.07)";

  return (
    <div
      style={{
        ...S.card,
        border: `1px solid ${borderColor}`,
        position: "relative",
        overflow: "hidden",
        minWidth: 220,
        flex: "1 1 260px",
      }}
    >
      {/* Carbon fiber texture overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          background:
            "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 4px)," +
            "repeating-linear-gradient(-45deg, #fff 0px, #fff 1px, transparent 1px, transparent 4px)",
          pointerEvents: "none",
        }}
      />

      {/* Podium badge */}
      {rank <= 3 && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            fontFamily: "var(--font-body)",
            fontSize: rank === 1 ? 28 : 22,
            fontWeight: 800,
            color:
              rank === 1
                ? "#FFD700"
                : rank === 2
                  ? "#C0C0C0"
                  : "#CD7F32",
            textShadow:
              rank === 1
                ? "0 0 20px rgba(255,215,0,0.5)"
                : rank === 2
                  ? "0 0 14px rgba(192,192,192,0.4)"
                  : "0 0 14px rgba(205,127,50,0.3)",
            lineHeight: 1,
          }}
        >
          P{rank}
        </div>
      )}

      {/* Agent name + rank */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background:
              rank === 1
                ? "linear-gradient(135deg, #FFD700, #FFA500)"
                : rank === 2
                  ? "linear-gradient(135deg, #C0C0C0, #808080)"
                  : rank === 3
                    ? "linear-gradient(135deg, #CD7F32, #8B4513)"
                    : "linear-gradient(135deg, #333, var(--eg-surface-3))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 800,
            color: rank <= 3 ? "var(--eg-text)" : "#666",
            flexShrink: 0,
          }}
        >
          {rank}
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: isChampion ? "#FFD700" : "#F0F0F0",
              textShadow: isChampion ? "0 0 16px rgba(255,215,0,0.3)" : "none",
            }}
          >
            {agent.name}
          </div>
          <div style={{ fontSize: 10, color: "#4A4A5A" }}>
            {agent.streak > 0 && (
              <span style={{ color: "#FF4455" }}>
                {agent.streak}-day streak
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Total sales */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 36,
            fontWeight: 800,
            color: "#F0F0F0",
            lineHeight: 1,
          }}
        >
          {agent.total}
        </span>
        <span style={{ fontSize: 11, color: "#4A4A5A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          sales
        </span>
      </div>

      {/* Product breakdown */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PRODUCT_TYPES.map((pt) => (
          <div
            key={pt}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 6,
              background: `${PRODUCT_COLORS[pt]}10`,
              border: `1px solid ${PRODUCT_COLORS[pt]}20`,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: PRODUCT_COLORS[pt], fontFamily: "var(--font-body)", letterSpacing: "0.08em" }}>
              {pt}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#F0F0F0", fontFamily: "var(--font-body)" }}>
              {agent.byProduct[pt] || 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  LEADERBOARD TABLE                                        */
/* ────────────────────────────────────────────────────────── */
function LeaderboardTable({ agents }) {
  if (!agents.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", color: "#4A4A5A", padding: 40 }}>
        No sales recorded for this period
      </div>
    );
  }

  const thStyle = {
    padding: "10px 14px",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#4A4A5A",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  };

  const tdStyle = (rank) => ({
    padding: "10px 14px",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "#F0F0F0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    background:
      rank === 1
        ? "rgba(255,215,0,0.04)"
        : rank === 2
          ? "rgba(192,192,192,0.02)"
          : rank === 3
            ? "rgba(205,127,50,0.02)"
            : "transparent",
  });

  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 50, textAlign: "center" }}>Rank</th>
              <th style={thStyle}>Agent</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              {PRODUCT_TYPES.map((pt) => (
                <th key={pt} style={{ ...thStyle, textAlign: "right", color: PRODUCT_COLORS[pt] }}>
                  {pt}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, i) => {
              const rank = i + 1;
              const td = tdStyle(rank);

              return (
                <tr key={agent.agent_id}>
                  <td style={{ ...td, textAlign: "center" }}>
                    {rank <= 3 ? (
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                          fontWeight: 800,
                          color:
                            rank === 1
                              ? "#FFD700"
                              : rank === 2
                                ? "#C0C0C0"
                                : "#CD7F32",
                          textShadow:
                            rank === 1
                              ? "0 0 12px rgba(255,215,0,0.4)"
                              : "none",
                        }}
                      >
                        P{rank}
                      </span>
                    ) : (
                      <span style={{ color: "#4A4A5A", fontWeight: 600 }}>{rank}</span>
                    )}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: 700,
                        fontSize: 14,
                        letterSpacing: "0.03em",
                        color: rank === 1 ? "#FFD700" : "#F0F0F0",
                        textShadow: rank === 1 ? "0 0 14px rgba(255,215,0,0.3)" : "none",
                      }}
                    >
                      {agent.name}
                    </span>
                    {agent.streak > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: "#FF4455" }}>
                        {agent.streak}d streak
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      fontFamily: "var(--font-body)",
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    {agent.total}
                  </td>
                  {PRODUCT_TYPES.map((pt) => (
                    <td
                      key={pt}
                      style={{
                        ...td,
                        textAlign: "right",
                        fontFamily: "var(--font-body)",
                        fontWeight: 600,
                        color: agent.byProduct[pt] ? PRODUCT_COLORS[pt] : "#2a2a2a",
                      }}
                    >
                      {agent.byProduct[pt] || 0}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  BONUS TRACKER                                            */
/* ────────────────────────────────────────────────────────── */
function BonusTracker({ agents }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {agents.map((agent) => {
        const monthlySales = agent.monthlySales ?? agent.total;
        const currentTier = getCurrentTier(monthlySales);
        const nextTier = getNextTier(monthlySales);
        const totalBonus = getTotalBonus(monthlySales);
        const maxThreshold = BONUS_TIERS[BONUS_TIERS.length - 1].threshold;
        const progressPct = Math.min((monthlySales / maxThreshold) * 100, 100);

        return (
          <div key={agent.agent_id} style={{ ...S.card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#F0F0F0",
                    letterSpacing: "0.03em",
                  }}
                >
                  {agent.name}
                </span>
                {currentTier && (
                  <span
                    style={{
                      marginLeft: 10,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 9,
                      fontFamily: "var(--font-body)",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: currentTier.color,
                      background: `${currentTier.color}15`,
                      border: `1px solid ${currentTier.color}30`,
                    }}
                  >
                    {currentTier.name}
                  </span>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                {totalBonus > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#00D166",
                    }}
                  >
                    ${totalBonus.toLocaleString()}
                  </span>
                )}
                <div style={{ fontSize: 9, color: "#4A4A5A", fontFamily: "var(--font-body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {monthlySales} sales this month
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div
              style={{
                position: "relative",
                height: 8,
                borderRadius: 4,
                background: "rgba(255,255,255,0.04)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${progressPct}%`,
                  borderRadius: 4,
                  background: currentTier
                    ? `linear-gradient(90deg, ${currentTier.color}AA, ${currentTier.color})`
                    : "linear-gradient(90deg, #333, #555)",
                  boxShadow: currentTier ? `0 0 12px ${currentTier.color}40` : "none",
                  transition: "width 0.6s ease",
                }}
              />

              {/* Tier markers */}
              {BONUS_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    position: "absolute",
                    left: `${(tier.threshold / maxThreshold) * 100}%`,
                    top: -2,
                    bottom: -2,
                    width: 2,
                    background: monthlySales >= tier.threshold ? `${tier.color}80` : "rgba(255,255,255,0.1)",
                    borderRadius: 1,
                  }}
                  title={`${tier.name}: ${tier.threshold} sales (+$${tier.bonus})`}
                />
              ))}
            </div>

            {/* Tier labels */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, position: "relative" }}>
              {BONUS_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    position: "absolute",
                    left: `${(tier.threshold / maxThreshold) * 100}%`,
                    transform: "translateX(-50%)",
                    fontSize: 8,
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: monthlySales >= tier.threshold ? tier.color : "#333",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tier.threshold}
                </div>
              ))}
            </div>

            {/* Next tier callout */}
            {nextTier && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: "#8A8A9A",
                }}
              >
                <span style={{ color: nextTier.color, fontWeight: 600 }}>
                  {nextTier.threshold - monthlySales}
                </span>{" "}
                more sale{nextTier.threshold - monthlySales !== 1 ? "s" : ""} to{" "}
                <span style={{ color: nextTier.color, fontWeight: 600 }}>{nextTier.name}</span>{" "}
                <span style={{ color: "#4A4A5A" }}>(+${nextTier.bonus})</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  MAIN LEADERBOARD COMPONENT                                */
/* ════════════════════════════════════════════════════════════ */
export default function Leaderboard() {
  const [timeFilter, setTimeFilter] = useState("month");
  const [salesData, setSalesData] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch agents and sales
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);

      const { from, to } = getDateRange(timeFilter);

      const [agentsRes, salesRes] = await Promise.all([
        supabase
          .from("enrolled_agents")
          .select("id, clerk_user_id, name")
          .eq("is_active", true),
        supabase
          .from("sales_log")
          .select("id, agent_id, product_type, sale_date")
          .gte("sale_date", formatDate(from))
          .lte("sale_date", formatDate(to))
          .order("sale_date", { ascending: false }),
      ]);

      if (cancelled) return;

      const agentList = agentsRes.data || [];
      const sales = salesRes.data || [];

      setAgents(agentList);
      setSalesData(sales);
      setLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, [timeFilter]);

  // Also fetch monthly sales for bonus tracker (always current month)
  const [monthlySales, setMonthlySales] = useState([]);
  useEffect(() => {
    const { from, to } = getDateRange("month");
    supabase
      .from("sales_log")
      .select("id, agent_id, product_type, sale_date")
      .gte("sale_date", formatDate(from))
      .lte("sale_date", formatDate(to))
      .then(({ data }) => setMonthlySales(data || []));
  }, []);

  // Aggregate data per agent
  const leaderboard = useMemo(() => {
    const map = new Map();

    // Initialize all agents
    for (const a of agents) {
      map.set(a.id, {
        agent_id: a.id,
        name: a.name,
        total: 0,
        byProduct: { MA: 0, MedSup: 0, ACA: 0, U65: 0 },
        saleDates: [],
        streak: 0,
      });
    }

    // Tally sales
    for (const sale of salesData) {
      const entry = map.get(sale.agent_id);
      if (!entry) continue;
      entry.total++;
      if (entry.byProduct[sale.product_type] !== undefined) {
        entry.byProduct[sale.product_type]++;
      }
      entry.saleDates.push(sale.sale_date);
    }

    // Compute streaks
    for (const entry of map.values()) {
      entry.streak = calcStreak(entry.saleDates);
    }

    // Sort by total desc
    return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [agents, salesData]);

  // Add monthly sales counts for bonus tracker
  const leaderboardWithMonthly = useMemo(() => {
    const monthlyMap = new Map();
    for (const sale of monthlySales) {
      monthlyMap.set(sale.agent_id, (monthlyMap.get(sale.agent_id) || 0) + 1);
    }

    return leaderboard.map((agent) => ({
      ...agent,
      monthlySales: monthlyMap.get(agent.agent_id) || 0,
    }));
  }, [leaderboard, monthlySales]);

  return (
    <div style={S.page}>
      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              boxShadow: "0 0 20px rgba(255,215,0,0.2)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#F0F0F0",
                margin: 0,
                lineHeight: 1,
              }}
            >
              Leaderboard
            </h1>
            <div style={{ fontSize: 11, color: "#4A4A5A", marginTop: 2 }}>
              Agent performance & bonus tracking
            </div>
          </div>
        </div>
      </div>

      {/* ── TIME FILTERS ── */}
      <div style={S.filterBar}>
        {TIME_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setTimeFilter(f.id)}
            style={S.filterBtn(timeFilter === f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ ...S.card, textAlign: "center", color: "#4A4A5A", padding: 60 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Loading telemetry...
          </div>
        </div>
      ) : (
        <>
          {/* ── STATS DASHBOARD, Top agent cards ── */}
          <div>
            <h2 style={{ ...S.sectionTitle, marginBottom: 12 }}>Stats Dashboard</h2>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {leaderboard.slice(0, 6).map((agent, i) => (
                <AgentStatCard key={agent.agent_id} agent={agent} rank={i + 1} />
              ))}
              {leaderboard.length === 0 && (
                <div style={{ ...S.card, flex: 1, textAlign: "center", color: "#4A4A5A", padding: 40 }}>
                  No agents found
                </div>
              )}
            </div>
          </div>

          {/* ── LEADERBOARD TABLE ── */}
          <div>
            <h2 style={{ ...S.sectionTitle, marginBottom: 12 }}>Rankings</h2>
            <LeaderboardTable agents={leaderboard} />
          </div>

          {/* ── BONUS TRACKER ── */}
          <div>
            <div style={{ marginBottom: 12 }}>
              <h2 style={S.sectionTitle}>Bonus Tracker</h2>
              <div style={S.sectionSubtitle}>Monthly progress toward bonus tiers</div>
            </div>
            <BonusTracker agents={leaderboardWithMonthly} />
          </div>
        </>
      )}
    </div>
  );
}
