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
import { useKnowledge } from "../hooks/useKnowledge";
import { mergeStructuredStateMap } from "../lib/knowledgeBase";

/* SBE states with their own tables (not in qhp_landscape_2026) */
const SBE_TABLES = { NJ: "sbe_plans_nj_2025", PA: "sbe_plans_pa_2025", VA: "sbe_plans_va_2025" };

const COLOR = {
  text: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  muted: "var(--text-muted)",
  label: "var(--text-label)",
  border: "var(--border-default)",
  surface: "var(--bg-surface)",
  elevated: "var(--bg-elevated)",
  accent: "var(--accent)",
};

const tint = (color, amount) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;
const mix = (color, amount, fallback = COLOR.elevated) =>
  `color-mix(in srgb, ${color} ${amount}%, ${fallback})`;

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
function SegmentSection({ segId, color, label, stateCode, data, startOpen }) {
  const [open, setOpen] = useState(startOpen);
  const list = carriers(data, segId);
  const note = notes(data, segId);
  const tools = segTools(stateCode, segId);

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${tint(color, open ? 25 : 10)}`,
        background: open
          ? `linear-gradient(145deg, ${tint(color, 6)} 0%, var(--bg-surface) 100%)`
          : "var(--bg-elevated)",
        boxShadow: open
          ? `inset 0 0 0 1px ${tint(color, 5)}`
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
              fontFamily: "var(--font-body)",
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
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: COLOR.muted,
            }}
          >
            {list.length}
          </span>
          <span
            style={{
              fontSize: "0.6rem",
              color: COLOR.muted,
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
                    background: tint(color, 10),
                    border: `1px solid ${tint(color, 20)}`,
                    fontSize: "0.7rem",
                    color: COLOR.text,
                    fontFamily: "var(--font-body)",
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = tint(color, 22);
                    e.currentTarget.style.borderColor = tint(color, 40);
                    e.currentTarget.style.color = COLOR.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = tint(color, 10);
                    e.currentTarget.style.borderColor = tint(color, 20);
                    e.currentTarget.style.color = COLOR.text;
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
                    background: tint(color, 10),
                    border: `1px solid ${tint(color, 20)}`,
                    fontSize: "0.7rem",
                    color: COLOR.text,
                    fontFamily: "var(--font-body)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </span>
              );
            })}
          </div>
          {note && (
            <p style={{ margin: 0, fontSize: "0.74rem", color: COLOR.secondary, lineHeight: 1.5 }}>
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
                    border: `1px solid ${tint(color, 25)}`,
                    background: tint(color, 8),
                    color,
                    textDecoration: "none",
                    fontFamily: "var(--font-body)",
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
function StateSidebar({ code, onClose, acaIssuers, states }) {
  const data = states[code];
  if (!data) return null;

  const totalCarriers =
    data.aca.length + data.ma.length + data.medSup.length + data.private.length + data.hi.length + data.dvh.length;

  return (
    <aside
      className="card carrier-ref-sidebar"
      style={{
        padding: "18px 16px",
        background:
          "linear-gradient(180deg, var(--eg-surface-3) 0%, var(--eg-surface-2) 50%, var(--eg-surface-1) 100%)",
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
              fontFamily: "var(--font-body)",
              fontWeight: 800,
              fontSize: "0.56rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 3,
            }}
          >
            {code} · {data.marketplace}
          </div>
          <h3
            style={{
              margin: 0,
              color: "var(--text-primary)",
              fontSize: "1.15rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
              fontWeight: 800,
            }}
          >
            {data.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "color-mix(in srgb, var(--text-primary) 5%, transparent)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "4px 8px",
            fontSize: "0.7rem",
            fontFamily: "var(--font-body)",
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
                border: `1px solid ${tint(seg.color, 15)}`,
                background: tint(seg.color, 4),
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "1rem",
                  fontWeight: 800,
                  color: seg.color,
                }}
              >
                {count}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.5rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
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
          fontFamily: "var(--font-mono)",
          fontSize: "0.68rem",
          color: "var(--text-muted)",
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
          borderRadius: 14, border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
          background: "color-mix(in srgb, var(--accent) 3%, transparent)", padding: "10px 14px",
        }}>
          <div style={{
            fontFamily: "var(--font-body)", fontWeight: 800,
            fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--accent)", marginBottom: 8,
          }}>
            Live ACA Issuers ({acaIssuers.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {acaIssuers.map((iss) => (
              <span key={iss} style={{
                padding: "2px 8px", borderRadius: 999,
                background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
                fontSize: "0.64rem", color: "var(--text-primary)",
                fontFamily: "var(--font-body)", whiteSpace: "nowrap",
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
            border: "1px solid var(--border-default)",
            background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontFamily: "var(--font-body)",
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
  const { entries: stateCarrierEntries } = useKnowledge("state_carrier_data");
  const carrierStates = useMemo(
    () => mergeStructuredStateMap(STATES, stateCarrierEntries),
    [stateCarrierEntries]
  );
  const activeStates = useMemo(() => new Set(Object.keys(carrierStates)), [carrierStates]);

  /* Every state on the map that is NOT in NGHS ACTIVE = orange expansion state */
  const acaExpansionStates = useMemo(() => {
    const set = new Set();
    for (const code of Object.keys(STATE_PATHS)) {
      if (!activeStates.has(code)) set.add(code);
    }
    return set;
  }, [activeStates]);

  /* ACA issuers cache, fetched on-demand when a state is selected */
  const [acaIssuers, setAcaIssuers] = useState({});

  useEffect(() => {
    if (!selected) return;
    if (Object.prototype.hasOwnProperty.call(acaIssuers, selected)) return;

    // FFE issuer scans on qhp_landscape_2026 time out for large states.
    // Keep expansion-state Carrier Ref stable by only doing live issuer fetches
    // against the smaller SBE tables.
    if (!SBE_TABLES[selected]) {
      setAcaIssuers((prev) => ({ ...prev, [selected]: [] }));
      return;
    }

    (async () => {
      try {
        const issuers = new Set();

        const { data, error } = await supabase
          .from(SBE_TABLES[selected])
          .select("issuer_id")
          .eq("market_coverage", "Individual");

        if (error) throw error;

        if (data) {
          for (const r of data) if (r.issuer_id) issuers.add(String(r.issuer_id));
        }

        setAcaIssuers((prev) => ({ ...prev, [selected]: [...issuers].sort() }));
      } catch (err) {
        console.error("[CarrierRef] ACA issuer fetch error:", err);
        setAcaIssuers((prev) => ({ ...prev, [selected]: [] }));
      }
    })();
  }, [selected, acaIssuers]);

  const query = search.toLowerCase().trim();
  const selectedAcaTool = selected ? (TOOLS.ACA.byState[selected] || TOOLS.ACA.default) : TOOLS.ACA.default;

  const matchedStates = useMemo(() => {
    if (!query) return activeStates;
    const matched = new Set();
    for (const [code, data] of Object.entries(carrierStates)) {
      if (stateMatchesQuery(code, data, query)) matched.add(code);
    }
    return matched;
  }, [activeStates, carrierStates, query]);

  const segSummary = useMemo(() => {
    const sums = {};
    for (const seg of MARKET_SEGMENTS) {
      let total = 0;
      for (const data of Object.values(carrierStates)) {
        total += carriers(data, seg.id).length;
      }
      sums[seg.id] = total;
    }
    return sums;
  }, [carrierStates]);

  /* Determine fill/stroke for each state */
  function stateStyle(code) {
    const isActive = activeStates.has(code);
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
          fill: "color-mix(in srgb, var(--accent) 35%, transparent)",
          stroke: "var(--accent)",
          strokeWidth: 2,
          cursor: "pointer",
          filter: "url(#map-glow)",
        };
      }
      if (hov) {
        return {
          fill: "color-mix(in srgb, var(--accent) 22%, transparent)",
          stroke: "color-mix(in srgb, var(--accent) 70%, transparent)",
          strokeWidth: 1.5,
          cursor: "pointer",
          filter: "url(#map-glow-subtle)",
        };
      }
      return {
        fill: "color-mix(in srgb, var(--accent) 8%, transparent)",
        stroke: "color-mix(in srgb, var(--accent) 25%, transparent)",
        strokeWidth: 0.8,
        cursor: "pointer",
        filter: undefined,
      };
    }

    if (!isActive) {
      return {
        fill: "var(--bg-elevated)",
        stroke: "color-mix(in srgb, var(--text-primary) 6%, transparent)",
        strokeWidth: 0.8,
        cursor: "default",
        filter: undefined,
      };
    }

    if (!isMatch && query) {
      return {
        fill: "var(--bg-elevated)",
        stroke: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
        strokeWidth: 0.8,
        cursor: "default",
        filter: undefined,
      };
    }

    const segColor = activeSeg
      ? MARKET_SEGMENTS.find((s) => s.id === activeSeg)
      : null;
    const pathColor = segColor ? segColor.color : "var(--danger)";

    if (isSel) {
      return {
        fill: tint(pathColor, 35),
        stroke: pathColor,
        strokeWidth: 2,
        cursor: "pointer",
        filter: "url(#map-glow)",
      };
    }
    if (isHov) {
      return {
        fill: tint(pathColor, 22),
        stroke: tint(pathColor, 70),
        strokeWidth: 1.5,
        cursor: "pointer",
        filter: "url(#map-glow-subtle)",
      };
    }
    return {
      fill: tint(pathColor, 10),
      stroke: tint(pathColor, 30),
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
              "linear-gradient(180deg, var(--eg-surface-3) 0%, var(--eg-surface-2) 50%, var(--eg-surface-1) 100%)",
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
                  color: "var(--text-muted)",
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
                        ? tint(seg.color, 14)
                        : "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                    border:
                      activeSeg === seg.id
                        ? `1px solid ${tint(seg.color, 45)}`
                        : "1px solid var(--border-default)",
                    borderRadius: 999,
                    padding: "5px 12px",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontWeight: 700,
                    fontSize: "0.64rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: activeSeg === seg.id ? seg.color : "var(--text-muted)",
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
                      fontFamily: "var(--font-mono)",
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
              const isActive = activeStates.has(code);
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
              const isActive = activeStates.has(code);
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
                      stroke="color-mix(in srgb, var(--text-primary) 15%, transparent)"
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
                        ? "var(--text-muted)"
                        : isSel
                          ? "var(--text-primary)"
                          : isHov
                            ? "var(--text-primary)"
                            : "var(--text-secondary)"
                    }
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 800,
                      fontSize: isSel || isHov ? "11px" : "9px",
                      letterSpacing: "0.06em",
                      textShadow: isSel || isHov
                        ? "none"
                        : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {code}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip, NGHS active states */}
          {hovered && carrierStates[hovered] && (
            <div
              style={{
                position: "absolute",
                left: mousePos.x + 14,
                top: mousePos.y - 10,
                pointerEvents: "none",
                zIndex: 20,
                background: "linear-gradient(145deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
                border: "1px solid var(--border-default)",
                borderRadius: 12,
                padding: "10px 14px",
                boxShadow: "none",
                minWidth: 160,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {carrierStates[hovered].name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {MARKET_SEGMENTS.map((seg) => {
                  const count = carriers(carrierStates[hovered], seg.id).length;
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
                            fontFamily: "var(--font-body)",
                            fontWeight: 700,
                            fontSize: "0.62rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {seg.label}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
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

          {/* Hover tooltip, expansion states (ACA data only) */}
          {hovered && !carrierStates[hovered] && acaExpansionStates.has(hovered) && (
            <div
              style={{
                position: "absolute",
                left: mousePos.x + 14,
                top: mousePos.y - 10,
                pointerEvents: "none",
                zIndex: 20,
                background: "linear-gradient(145deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
                border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                borderRadius: 12,
                padding: "10px 14px",
                boxShadow: "none",
                minWidth: 140,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  marginBottom: 4,
                }}
              >
                {hovered}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>
                {SBE_TABLES[hovered]
                  ? `ACA issuer list${acaIssuers[hovered]?.length ? ` · ${acaIssuers[hovered].length} issuers` : ""} · Click for details`
                  : "Marketplace overview · Click for details"}
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
                color: "var(--text-muted)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 10,
                    borderRadius: 3,
                    background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
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
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
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
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                  }}
                />
                Inactive
              </span>
            </div>
            <div
              style={{
                fontSize: "0.6rem",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {matchedStates.size} / {activeStates.size} states
              {query ? ` matching "${search}"` : ""}
            </div>
          </div>
        </section>

        {/* Sidebar, NGHS active states */}
        {selected && carrierStates[selected] && (
          <StateSidebar
            key={selected}
            code={selected}
            states={carrierStates}
            onClose={() => setSelected(null)}
            acaIssuers={acaIssuers[selected]}
          />
        )}

        {/* Sidebar, ACA expansion states (not in NGHS) */}
        {selected && !carrierStates[selected] && acaExpansionStates.has(selected) && (
          <aside
            className="card carrier-ref-sidebar"
            style={{
              padding: "18px 16px",
              background: "linear-gradient(180deg, var(--eg-surface-3) 0%, var(--eg-surface-2) 50%, var(--eg-surface-1) 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{
                  fontFamily: "var(--font-body)", fontWeight: 800,
                  fontSize: "0.56rem", letterSpacing: "0.14em", textTransform: "uppercase",
                  color: "var(--accent)", marginBottom: 3,
                }}>
                  {selected} · {SBE_TABLES[selected] ? "State-Based Exchange" : "Federal Exchange"}
                </div>
                <h3 style={{
                  margin: 0, color: "var(--text-primary)", fontSize: "1.15rem",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  fontFamily: "var(--font-body)", fontWeight: 800,
                }}>
                  ACA Market Data
                </h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: "color-mix(in srgb, var(--text-primary) 5%, transparent)", border: "1px solid var(--border-default)",
                  borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer",
                  padding: "4px 8px", fontSize: "0.7rem", fontFamily: "var(--font-body)",
                }}
              >
                ✕
              </button>
            </div>

            {SBE_TABLES[selected] ? (
              <div style={{
                borderRadius: 10, padding: "12px 14px",
                border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
                background: "color-mix(in srgb, var(--accent) 4%, transparent)",
                textAlign: "center",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "1.4rem",
                  fontWeight: 800, color: "var(--accent)",
                }}>
                  {acaIssuers[selected]?.length || 0}
                </div>
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: "0.56rem",
                  fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "var(--text-muted)", marginTop: 2,
                }}>
                  ACA Issuers
                </div>
              </div>
            ) : (
              <div style={{
                borderRadius: 14,
                border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
                background: "color-mix(in srgb, var(--accent) 4%, transparent)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}>
                <div style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 800,
                  fontSize: "0.68rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                }}>
                  Marketplace Lookup
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Live issuer scans are disabled here to avoid QHP table timeouts. Use the marketplace link below for current carriers and plan details.
                </div>
                <a
                  href={selectedAcaTool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    alignSelf: "flex-start",
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                    background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                    color: "var(--accent)",
                    textDecoration: "none",
                    fontFamily: "var(--font-body)",
                    fontWeight: 700,
                    fontSize: "0.6rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {selectedAcaTool.name} ↗
                </a>
              </div>
            )}

            {SBE_TABLES[selected] && acaIssuers[selected]?.length > 0 && (
              <div style={{
                borderRadius: 14, border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                background: "linear-gradient(145deg, color-mix(in srgb, var(--accent) 6%, transparent) 0%, var(--bg-surface) 100%)",
                padding: "12px 14px",
              }}>
                <div style={{
                  fontFamily: "var(--font-body)", fontWeight: 800,
                  fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "var(--accent)", marginBottom: 10,
                }}>
                  Issuers
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {acaIssuers[selected].map((iss) => (
                    <span
                      key={iss}
                      style={{
                        padding: "3px 9px", borderRadius: 999,
                        background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                        fontSize: "0.7rem", color: "var(--text-primary)",
                        fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                      }}
                    >
                      {iss}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{
              fontSize: "0.62rem", color: "var(--text-muted)", textAlign: "center",
              fontFamily: "var(--font-mono)",
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
              "linear-gradient(180deg, var(--eg-surface-3) 0%, var(--eg-surface-2) 50%, var(--eg-surface-1) 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontWeight: 800,
              fontSize: "0.74rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
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
                    fontFamily: "var(--font-body)",
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
                      border: `1px solid ${tint(seg.color, 20)}`,
                      background: tint(seg.color, 6),
                      color: seg.color,
                      textDecoration: "none",
                      fontFamily: "var(--font-body)",
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
              "linear-gradient(180deg, var(--eg-surface-3) 0%, var(--eg-surface-2) 50%, var(--eg-surface-1) 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontWeight: 800,
              fontSize: "0.74rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
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
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                }}
              >
                <span style={{ color: "var(--text-muted)", marginTop: 1 }}>•</span>
                <span>{src}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 4,
              padding: "6px 10px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--text-primary) 2%, transparent)",
              border: "1px solid var(--border-default)",
              fontSize: "0.62rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Last verified: {DATA_VERSION.lastUpdated}
          </div>
        </section>
      </div>
    </div>
  );
}
