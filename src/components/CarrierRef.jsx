import { useState, useMemo, useEffect } from "react";
import {
  STATES,
  MARKET_SEGMENTS,
  TOOLS,
  DATA_VERSION,
  CARRIER_URLS,
} from "../data/stateCarrierData";
import STATE_PATHS, { STATE_CENTROIDS } from "../data/usMapPaths";
import { supabase } from "../lib/supabase";

const ACTIVE = new Set(Object.keys(STATES));

/* SBE states with their own tables (not in qhp_landscape_2026) */
const SBE_TABLES = { NJ: "sbe_plans_nj_2025", PA: "sbe_plans_pa_2025", VA: "sbe_plans_va_2025" };


/* ── Helpers ──────────────────────────────────────────────────────── */
function carriers(data, segId) {
  if (segId === "ACA") return data.aca;
  if (segId === "MA") return data.ma;
  if (segId === "MedSup") return data.medSup;
  if (segId === "HI") return data.hi;
  if (segId === "DVH") return data.dvh;
  return data.private;
}

function notes(data, segId) {
  if (segId === "ACA") return data.acaNotes;
  if (segId === "MA") return data.maNotes;
  if (segId === "MedSup") return data.medSupNotes;
  if (segId === "HI") return data.hiNotes;
  if (segId === "DVH") return data.dvhNotes;
  return data.privateNotes;
}

function segTools(code, segId) {
  if (segId === "ACA") {
    const tool = TOOLS.ACA.byState[code] || TOOLS.ACA.default;
    return [tool];
  }
  if (segId === "MA") return TOOLS.MA;
  if (segId === "MedSup") return TOOLS.MedSup;
  if (segId === "HI") return TOOLS.HI;
  if (segId === "DVH") return TOOLS.DVH;
  return TOOLS.Private.filter((t) => {
    if (t.name === "Farm Bureau") {
      return ["AL", "IN", "KS", "MI", "MO", "OH", "TN", "TX"].includes(code);
    }
    return true;
  });
}

function stateMatchesQuery(code, data, q) {
  if (!q) return true;
  const hay = [
    code, data.name, data.marketplace,
    ...data.aca, ...data.ma, ...data.medSup, ...data.private, ...data.hi, ...data.dvh,
    data.acaNotes, data.maNotes, data.medSupNotes, data.privateNotes, data.hiNotes, data.dvhNotes,
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

/* Small northeast states that need external labels */
const LABEL_OFFSETS = {
  CT: [40, 2],
  DC: [30, 12],
  DE: [28, 8],
  MA: [38, 0],
  MD: [40, 18],
  NH: [30, 0],
  NJ: [24, 8],
  RI: [28, 4],
  VT: [30, -4],
};

/* ── Segment Section (sidebar accordion) ──────────────────────────── */
function SegmentSection({ segId, color, rgb, label, stateCode, data, startOpen }) {
  const [open, setOpen] = useState(startOpen);
  const list = carriers(data, segId);
  const note = notes(data, segId);
  const tools = segTools(stateCode, segId);

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid rgba(${rgb}, ${open ? 0.25 : 0.1})`,
        background: open
          ? `linear-gradient(145deg, rgba(${rgb},0.06) 0%, rgba(10,10,12,0.99) 100%)`
          : "rgba(17,17,17,0.7)",
        boxShadow: open
          ? `inset 4px 4px 10px rgba(0,0,0,0.34), inset -2px -2px 6px rgba(255,255,255,0.015), 0 0 20px rgba(${rgb},0.05)`
          : "none",
        transition: "all 0.2s ease",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: color,
              boxShadow: `0 0 6px ${color}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.72rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color,
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            {list.length}
          </span>
          <span
            style={{
              fontSize: "0.6rem",
              color: "#5A5A6A",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          >
            ▼
          </span>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {list.map((c) => {
              const url = CARRIER_URLS[c];
              return url ? (
                <a
                  key={c}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: `rgba(${rgb},0.1)`,
                    border: `1px solid rgba(${rgb},0.2)`,
                    fontSize: "0.7rem",
                    color: "#D6DFE9",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `rgba(${rgb},0.22)`;
                    e.currentTarget.style.borderColor = `rgba(${rgb},0.4)`;
                    e.currentTarget.style.color = "#FFFFFF";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `rgba(${rgb},0.1)`;
                    e.currentTarget.style.borderColor = `rgba(${rgb},0.2)`;
                    e.currentTarget.style.color = "#D6DFE9";
                  }}
                >
                  {c} ↗
                </a>
              ) : (
                <span
                  key={c}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: `rgba(${rgb},0.1)`,
                    border: `1px solid rgba(${rgb},0.2)`,
                    fontSize: "0.7rem",
                    color: "#D6DFE9",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </span>
              );
            })}
          </div>
          {note && (
            <p style={{ margin: 0, fontSize: "0.74rem", color: "#8A8A9A", lineHeight: 1.5 }}>
              {note}
            </p>
          )}
          {tools.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
              {tools.map((t) => (
                <a
                  key={t.name}
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "3px 9px",
                    borderRadius: 999,
                    border: `1px solid rgba(${rgb},0.25)`,
                    background: `rgba(${rgb},0.08)`,
                    color,
                    textDecoration: "none",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.56rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {t.name} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── State Sidebar ────────────────────────────────────────────────── */
function StateSidebar({ code, onClose, acaIssuers }) {
  const data = STATES[code];
  if (!data) return null;

  const totalCarriers =
    data.aca.length + data.ma.length + data.medSup.length + data.private.length + data.hi.length + data.dvh.length;

  return (
    <aside
      className="card carrier-ref-sidebar"
      style={{
        padding: "18px 16px",
        background:
          "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.56rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#4A4A5A",
              marginBottom: 3,
            }}
          >
            {code} · {data.marketplace}
          </div>
          <h3
            style={{
              margin: 0,
              color: "#F0F0F0",
              fontSize: "1.15rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
            }}
          >
            {data.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: "#8A8A9A",
            cursor: "pointer",
            padding: "4px 8px",
            fontSize: "0.7rem",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ✕
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {MARKET_SEGMENTS.map((seg) => {
          const count = carriers(data, seg.id).length;
          return (
            <div
              key={seg.id}
              style={{
                borderRadius: 10,
                padding: "8px 6px",
                border: `1px solid rgba(${seg.rgb},0.15)`,
                background: `rgba(${seg.rgb},0.04)`,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "1rem",
                  fontWeight: 800,
                  color: seg.color,
                }}
              >
                {count}
              </div>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: "0.5rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#5A5A6A",
                  marginTop: 2,
                }}
              >
                {seg.label}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          textAlign: "center",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "0.68rem",
          color: "#5A5A6A",
        }}
      >
        {totalCarriers} total carriers
      </div>

      {MARKET_SEGMENTS.map((seg, i) => (
        <SegmentSection
          key={seg.id}
          segId={seg.id}
          color={seg.color}
          rgb={seg.rgb}
          label={seg.label}
          stateCode={code}
          data={data}
          startOpen={i === 0}
        />
      ))}

      {acaIssuers?.length > 0 && (
        <div style={{
          borderRadius: 14, border: "1px solid rgba(249,115,22,0.2)",
          background: "rgba(249,115,22,0.03)", padding: "10px 14px",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
            fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: "#F97316", marginBottom: 8,
          }}>
            Live ACA Issuers ({acaIssuers.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {acaIssuers.map((iss) => (
              <span key={iss} style={{
                padding: "2px 8px", borderRadius: 999,
                background: "rgba(249,115,22,0.08)",
                border: "1px solid rgba(249,115,22,0.15)",
                fontSize: "0.64rem", color: "#D6DFE9",
                fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
              }}>
                {iss}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.acaSource && (
        <a
          href={data.acaSource}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            color: "#6F7D8E",
            textDecoration: "none",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: "0.56rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          ACA Marketplace Source ↗
        </a>
      )}
    </aside>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function CarrierRef() {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [activeSeg, setActiveSeg] = useState(null);

  /* Every state on the map that is NOT in NGHS ACTIVE = orange expansion state */
  const acaExpansionStates = useMemo(() => {
    const set = new Set();
    for (const code of Object.keys(STATE_PATHS)) {
      if (!ACTIVE.has(code)) set.add(code);
    }
    return set;
  }, []);

  /* ACA issuers cache — fetched on-demand when a state is selected */
  const [acaIssuers, setAcaIssuers] = useState({});

  useEffect(() => {
    if (!selected) return;
    if (acaIssuers[selected]) return;

    (async () => {
      try {
        const issuers = new Set();

        if (SBE_TABLES[selected]) {
          const { data } = await supabase
            .from(SBE_TABLES[selected])
            .select("issuer_id")
            .eq("market_coverage", "Individual");
          if (data) {
            for (const r of data) if (r.issuer_id) issuers.add(String(r.issuer_id));
          }
        } else {
          let from = 0;
          while (true) {
            const { data } = await supabase
              .from("qhp_landscape_2026")
              .select("issuer_name")
              .eq("state_code", selected)
              .range(from, from + 999);
            if (!data || data.length === 0) break;
            for (const r of data) if (r.issuer_name) issuers.add(r.issuer_name);
            if (data.length < 1000) break;
            from += 1000;
          }
        }

        setAcaIssuers((prev) => ({ ...prev, [selected]: [...issuers].sort() }));
      } catch (err) {
        console.error("[CarrierRef] ACA issuer fetch error:", err);
      }
    })();
  }, [selected]);

  const query = search.toLowerCase().trim();

  const matchedStates = useMemo(() => {
    if (!query) return ACTIVE;
    const matched = new Set();
    for (const [code, data] of Object.entries(STATES)) {
      if (stateMatchesQuery(code, data, query)) matched.add(code);
    }
    return matched;
  }, [query]);

  const segSummary = useMemo(() => {
    const sums = {};
    for (const seg of MARKET_SEGMENTS) {
      let total = 0;
      for (const data of Object.values(STATES)) {
        total += carriers(data, seg.id).length;
      }
      sums[seg.id] = total;
    }
    return sums;
  }, []);

  /* Determine fill/stroke for each state */
  function stateStyle(code) {
    const isActive = ACTIVE.has(code);
    const isExpansion = acaExpansionStates.has(code);
    const isMatch = isActive && matchedStates.has(code);
    const isSel = selected === code;
    const isHov = hovered === code;

    /* Expansion states (non-NGHS with ACA data): orange tint */
    if (!isActive && isExpansion) {
      const sel = selected === code;
      const hov = hovered === code;
      if (sel) {
        return {
          fill: "rgba(249,115,22,0.35)",
          stroke: "#F97316",
          strokeWidth: 2,
          cursor: "pointer",
          filter: "url(#map-glow)",
        };
      }
      if (hov) {
        return {
          fill: "rgba(249,115,22,0.22)",
          stroke: "rgba(249,115,22,0.7)",
          strokeWidth: 1.5,
          cursor: "pointer",
          filter: "url(#map-glow-subtle)",
        };
      }
      return {
        fill: "rgba(249,115,22,0.08)",
        stroke: "rgba(249,115,22,0.25)",
        strokeWidth: 0.8,
        cursor: "pointer",
        filter: undefined,
      };
    }

    if (!isActive) {
      return {
        fill: "#141418",
        stroke: "rgba(255,255,255,0.06)",
        strokeWidth: 0.8,
        cursor: "default",
        filter: undefined,
      };
    }

    if (!isMatch && query) {
      return {
        fill: "#141418",
        stroke: "rgba(255,255,255,0.04)",
        strokeWidth: 0.8,
        cursor: "default",
        filter: undefined,
      };
    }

    const segColor = activeSeg
      ? MARKET_SEGMENTS.find((s) => s.id === activeSeg)
      : null;
    const rgb = segColor ? segColor.rgb : "232,0,45";
    const hex = segColor ? segColor.color : "#E8002D";

    if (isSel) {
      return {
        fill: `rgba(${rgb},0.35)`,
        stroke: hex,
        strokeWidth: 2,
        cursor: "pointer",
        filter: "url(#map-glow)",
      };
    }
    if (isHov) {
      return {
        fill: `rgba(${rgb},0.22)`,
        stroke: `rgba(${rgb},0.7)`,
        strokeWidth: 1.5,
        cursor: "pointer",
        filter: "url(#map-glow-subtle)",
      };
    }
    return {
      fill: `rgba(${rgb},0.1)`,
      stroke: `rgba(${rgb},0.3)`,
      strokeWidth: 1,
      cursor: "pointer",
      filter: undefined,
    };
  }

  return (
    <div
      style={{
        maxWidth: 1320,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* ── Map + Sidebar ── */}
      <div
        className="carrier-ref-layout"
        style={{
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* Geographic SVG Map */}
        <section
          className="card"
          style={{
            padding: "16px 20px 12px",
            background:
              "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Search + segment filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#3A3A4A",
                  fontSize: 14,
                  pointerEvents: "none",
                  lineHeight: 1,
                }}
              >
                ⌕
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search state or carrier"
                style={{ width: "100%", paddingLeft: 34 }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MARKET_SEGMENTS.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() =>
                    setActiveSeg(activeSeg === seg.id ? null : seg.id)
                  }
                  style={{
                    background:
                      activeSeg === seg.id
                        ? `rgba(${seg.rgb},0.14)`
                        : "rgba(255,255,255,0.03)",
                    border:
                      activeSeg === seg.id
                        ? `1px solid rgba(${seg.rgb},0.45)`
                        : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    padding: "5px 12px",
                    cursor: "pointer",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.64rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: activeSeg === seg.id ? seg.color : "#5A5A6A",
                    transition: "all 0.13s ease",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: seg.color,
                      marginRight: 6,
                      verticalAlign: "middle",
                      opacity: activeSeg === seg.id ? 1 : 0.4,
                    }}
                  />
                  {seg.label}
                  <span
                    style={{
                      marginLeft: 6,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: "0.58rem",
                      opacity: 0.6,
                    }}
                  >
                    {segSummary[seg.id]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <svg
            viewBox="60 50 900 520"
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            <defs>
              <filter id="map-glow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="map-glow-subtle">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Render all state shapes */}
            {Object.entries(STATE_PATHS).map(([code, d]) => {
              const style = stateStyle(code);
              const isActive = ACTIVE.has(code);
              const isExpansion = acaExpansionStates.has(code);
              const isMatch = isActive && matchedStates.has(code);
              const isClickable = (isActive && isMatch) || isExpansion;

              return (
                <path
                  key={code}
                  d={d}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeLinejoin="round"
                  filter={style.filter}
                  style={{
                    cursor: style.cursor,
                    transition: "fill 0.15s ease, stroke 0.15s ease",
                  }}
                  onClick={() => {
                    if (isClickable)
                      setSelected(selected === code ? null : code);
                  }}
                  onMouseEnter={(e) => {
                    if (isClickable) {
                      setHovered(code);
                      const rect = e.currentTarget.closest("svg").getBoundingClientRect();
                      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }
                  }}
                  onMouseMove={(e) => {
                    if (isClickable) {
                      const rect = e.currentTarget.closest("svg").getBoundingClientRect();
                      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }
                  }}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}

            {/* State labels for active states */}
            {Object.entries(STATE_CENTROIDS).map(([code, [cx, cy]]) => {
              const isActive = ACTIVE.has(code);
              const isMatch = isActive && matchedStates.has(code);
              if (!isActive) return null;

              const isSel = selected === code;
              const isHov = hovered === code;
              const offset = LABEL_OFFSETS[code];

              const labelX = offset ? cx + offset[0] : cx;
              const labelY = offset ? cy + offset[1] : cy;

              return (
                <g key={`label-${code}`} style={{ pointerEvents: "none" }}>
                  {/* Leader line for offset labels */}
                  {offset && (
                    <line
                      x1={cx}
                      y1={cy}
                      x2={labelX - 4}
                      y2={labelY}
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth={0.6}
                    />
                  )}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={
                      !isMatch && query
                        ? "#1A1A2A"
                        : isSel
                          ? "#FFFFFF"
                          : isHov
                            ? "#F0F0F0"
                            : "#B8B8C8"
                    }
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 800,
                      fontSize: isSel || isHov ? "11px" : "9px",
                      letterSpacing: "0.06em",
                      textShadow: isSel || isHov
                        ? "0 0 6px rgba(0,0,0,0.8)"
                        : "0 1px 2px rgba(0,0,0,0.9)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {code}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip — NGHS active states */}
          {hovered && STATES[hovered] && (
            <div
              style={{
                position: "absolute",
                left: mousePos.x + 14,
                top: mousePos.y - 10,
                pointerEvents: "none",
                zIndex: 20,
                background: "linear-gradient(145deg, rgba(22,22,28,0.97) 0%, rgba(12,12,14,0.98) 100%)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "10px 14px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
                minWidth: 160,
              }}
            >
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#F0F0F0",
                  marginBottom: 8,
                }}
              >
                {STATES[hovered].name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {MARKET_SEGMENTS.map((seg) => {
                  const count = carriers(STATES[hovered], seg.id).length;
                  return (
                    <div
                      key={seg.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: seg.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700,
                            fontSize: "0.62rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#8A8A9A",
                          }}
                        >
                          {seg.label}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          color: seg.color,
                        }}
                      >
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hover tooltip — expansion states (ACA data only) */}
          {hovered && !STATES[hovered] && acaExpansionStates.has(hovered) && (
            <div
              style={{
                position: "absolute",
                left: mousePos.x + 14,
                top: mousePos.y - 10,
                pointerEvents: "none",
                zIndex: 20,
                background: "linear-gradient(145deg, rgba(22,22,28,0.97) 0%, rgba(12,12,14,0.98) 100%)",
                border: "1px solid rgba(249,115,22,0.2)",
                borderRadius: 12,
                padding: "10px 14px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
                minWidth: 140,
              }}
            >
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#F97316",
                  marginBottom: 4,
                }}
              >
                {hovered}
              </div>
              <div style={{ fontSize: "0.65rem", color: "#8A8A9A" }}>
                ACA data available{acaIssuers[hovered] ? ` · ${acaIssuers[hovered].length} issuers` : ""} · Click for details
              </div>
            </div>
          )}

          {/* Map legend bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 6,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: "0.65rem",
                color: "#5A5A6A",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 10,
                    borderRadius: 3,
                    background: "rgba(232,0,45,0.15)",
                    border: "1px solid rgba(232,0,45,0.35)",
                  }}
                />
                Active
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 10,
                    borderRadius: 3,
                    background: "rgba(249,115,22,0.12)",
                    border: "1px solid rgba(249,115,22,0.35)",
                  }}
                />
                ACA Data
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 10,
                    borderRadius: 3,
                    background: "#141418",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
                Inactive
              </span>
            </div>
            <div
              style={{
                fontSize: "0.6rem",
                color: "#3A3A4A",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {matchedStates.size} / {ACTIVE.size} states
              {query ? ` matching "${search}"` : ""}
            </div>
          </div>
        </section>

        {/* Sidebar — NGHS active states */}
        {selected && STATES[selected] && (
          <StateSidebar key={selected} code={selected} onClose={() => setSelected(null)} acaIssuers={acaIssuers[selected]} />
        )}

        {/* Sidebar — ACA expansion states (not in NGHS) */}
        {selected && !STATES[selected] && acaExpansionStates.has(selected) && (
          <aside
            className="card carrier-ref-sidebar"
            style={{
              padding: "18px 16px",
              background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
                  fontSize: "0.56rem", letterSpacing: "0.14em", textTransform: "uppercase",
                  color: "#F97316", marginBottom: 3,
                }}>
                  {selected} · {SBE_TABLES[selected] ? "State-Based Exchange" : "Federal Exchange"}
                </div>
                <h3 style={{
                  margin: 0, color: "#F0F0F0", fontSize: "1.15rem",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
                }}>
                  ACA Market Data
                </h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, color: "#8A8A9A", cursor: "pointer",
                  padding: "4px 8px", fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{
              borderRadius: 10, padding: "12px 14px",
              border: "1px solid rgba(249,115,22,0.15)",
              background: "rgba(249,115,22,0.04)",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.4rem",
                fontWeight: 800, color: "#F97316",
              }}>
                {acaIssuers[selected]?.length || 0}
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.56rem",
                fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                color: "#5A5A6A", marginTop: 2,
              }}>
                ACA Issuers
              </div>
            </div>

            {acaIssuers[selected]?.length > 0 && (
              <div style={{
                borderRadius: 14, border: "1px solid rgba(249,115,22,0.25)",
                background: "linear-gradient(145deg, rgba(249,115,22,0.06) 0%, rgba(10,10,12,0.99) 100%)",
                padding: "12px 14px",
              }}>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
                  fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#F97316", marginBottom: 10,
                }}>
                  Issuers
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {acaIssuers[selected].map((iss) => (
                    <span
                      key={iss}
                      style={{
                        padding: "3px 9px", borderRadius: 999,
                        background: "rgba(249,115,22,0.1)",
                        border: "1px solid rgba(249,115,22,0.2)",
                        fontSize: "0.7rem", color: "#D6DFE9",
                        fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
                      }}
                    >
                      {iss}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{
              fontSize: "0.62rem", color: "#3A3A4A", textAlign: "center",
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              Not an active NGHS state · ACA data only
            </div>
          </aside>
        )}
      </div>

      {/* ── Bottom panels ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {/* Tools quick ref */}
        <section
          className="card"
          style={{
            padding: "16px 18px",
            background:
              "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.74rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8E99A7",
            }}
          >
            Quick-Reference Tools
          </h3>
          {MARKET_SEGMENTS.map((seg) => {
            const tools =
              seg.id === "ACA"
                ? [TOOLS.ACA.default]
                : seg.id === "MA"
                  ? TOOLS.MA
                  : seg.id === "MedSup"
                    ? TOOLS.MedSup
                    : seg.id === "HI"
                      ? TOOLS.HI
                      : seg.id === "DVH"
                        ? TOOLS.DVH
                        : TOOLS.Private;
            return (
              <div
                key={seg.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.58rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: seg.color,
                    minWidth: 60,
                  }}
                >
                  {seg.label}
                </span>
                {tools.map((t) => (
                  <a
                    key={t.name}
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "3px 9px",
                      borderRadius: 999,
                      border: `1px solid rgba(${seg.rgb},0.2)`,
                      background: `rgba(${seg.rgb},0.06)`,
                      color: seg.color,
                      textDecoration: "none",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: "0.54rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.name} ↗
                  </a>
                ))}
              </div>
            );
          })}
        </section>

        {/* Data sources */}
        <section
          className="card"
          style={{
            padding: "16px 18px",
            background:
              "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.74rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8E99A7",
            }}
          >
            Data Sources
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            {DATA_VERSION.sources.map((src) => (
              <div
                key={src}
                style={{
                  fontSize: "0.7rem",
                  color: "#5A5A6A",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                }}
              >
                <span style={{ color: "#3A3A4A", marginTop: 1 }}>•</span>
                <span>{src}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 4,
              padding: "6px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: "0.62rem",
              color: "#3A3A4A",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            Last verified: {DATA_VERSION.lastUpdated}
          </div>
        </section>
      </div>
    </div>
  );
}
