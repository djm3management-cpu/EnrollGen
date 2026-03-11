import { useState, useMemo, useEffect } from "react";
import { CARRIER_DATA } from "../data/carrierData";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const STATES = ["NJ", "PA", "VA", "GA"];

const LINES = [
  { id: "MA",     label: "MA",      color: "#E8002D", rgb: "232,0,45"   },
  { id: "MedSup", label: "MED SUP", color: "#00D166", rgb: "0,209,102"  },
  { id: "ACA",    label: "ACA",     color: "#EAB308", rgb: "234,179,8"  },
  { id: "U65",    label: "U65",     color: "#a855f7", rgb: "168,85,247" },
];

function lineColor(id) {
  return LINES.find((l) => l.id === id)?.color ?? "#8A8A9A";
}
function lineRgb(id) {
  return LINES.find((l) => l.id === id)?.rgb ?? "138,138,154";
}

/* ─── Debounce hook ──────────────────────────────────────────────────────── */
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ─── Filter pill ────────────────────────────────────────────────────────── */
function FilterPill({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `rgba(${color},0.12)` : "rgba(255,255,255,0.03)",
        border: active
          ? `1px solid rgba(${color},0.45)`
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "5px 13px",
        cursor: "pointer",
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: "0.68rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: active
          ? `rgb(${color})`
          : "#5A5A6A",
        transition: "all 0.13s ease",
      }}
    >
      {label}
    </button>
  );
}

/* ─── Plan card ──────────────────────────────────────────────────────────── */
function PlanCard({ plan }) {
  const [expanded, setExpanded] = useState(false);
  const color = lineColor(plan.productLine);
  const rgb = lineRgb(plan.productLine);

  return (
    <div
      style={{
        background: "linear-gradient(180deg,#181818 0%,#111111 60%,#0e0e0e 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderTop: `2px solid rgba(${rgb},0.5)`,
        borderRadius: 5,
        overflow: "hidden",
        transition: "box-shadow 0.15s ease",
      }}
    >
      {/* ── Card header ── */}
      <div style={{ padding: "14px 18px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: "0.58rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#4A4A5A",
                marginBottom: 4,
              }}
            >
              {plan.carrier}
            </div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "1.05rem",
                letterSpacing: "0.02em",
                color: "#F0F0F0",
                lineHeight: 1.2,
              }}
            >
              {plan.planName}
            </div>
          </div>

          {/* Product line badge */}
          <span
            style={{
              background: `rgba(${rgb},0.1)`,
              border: `1px solid rgba(${rgb},0.35)`,
              borderRadius: 3,
              padding: "3px 10px",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.65rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {plan.productLine}
          </span>
        </div>

        {/* State pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
          {plan.states.map((s) => (
            <span
              key={s}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 3,
                padding: "2px 8px",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                color: "#8A8A9A",
              }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* Key metrics grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 1,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {[
            { label: "Premium", value: plan.premium },
            { label: "Network", value: plan.networkType },
            { label: "Part B Giveback", value: plan.partBGiveback },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                padding: "8px 12px",
                background: "#0C0C0C",
              }}
            >
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.55rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#3A3A4A",
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  color: "#C0C0C0",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Key benefits */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {plan.keyBenefits.map((b, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <span
                style={{
                  color,
                  flexShrink: 0,
                  fontSize: "0.6rem",
                  marginTop: 3,
                }}
              >
                ▸
              </span>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.8rem",
                  color: "#9A9AAA",
                  lineHeight: 1.4,
                }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Expand toggle ── */}
      <button
        onClick={() => setExpanded((x) => !x)}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.02)",
          border: "none",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "8px 18px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#4A4A5A",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          transition: "color 0.13s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#8A8A9A")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#4A4A5A")}
      >
        <span>{expanded ? "Hide Details" : "Show Details"}</span>
        <span style={{ fontSize: "0.6rem" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* ── Expanded details ── */}
      {expanded && (
        <div
          style={{
            padding: "14px 18px 16px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            background: "#0A0A0A",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {[
            {
              label: "Formulary / Drug List",
              value: plan.formularyLink,
              isLink:
                plan.formularyLink.startsWith("http"),
            },
            {
              label: "Provider Search",
              value: plan.providerSearchLink,
              isLink:
                plan.providerSearchLink.startsWith("http"),
            },
          ].map(({ label, value, isLink }) => (
            <div key={label}>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.55rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#3A3A4A",
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              {isLink ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "0.78rem",
                    color,
                    textDecoration: "none",
                    opacity: 0.85,
                  }}
                >
                  {value}
                </a>
              ) : (
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "0.78rem",
                    color: "#5A5A6A",
                  }}
                >
                  {value}
                </span>
              )}
            </div>
          ))}

          <div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.55rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#3A3A4A",
                marginBottom: 4,
              }}
            >
              Enrollment Notes
            </div>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.78rem",
                color: "#7A7A8A",
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {plan.enrollmentNotes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function CarrierRef() {
  const [searchRaw, setSearchRaw] = useState("");
  const [activeStates, setActiveStates] = useState(new Set());
  const [activeLines, setActiveLines] = useState(new Set());

  const search = useDebounce(searchRaw, 300);

  const toggleState = (s) =>
    setActiveStates((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleLine = (l) =>
    setActiveLines((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return CARRIER_DATA.filter((plan) => {
      // State filter (AND: plan must serve at least one active state)
      if (
        activeStates.size > 0 &&
        !plan.states.some((s) => activeStates.has(s))
      )
        return false;

      // Product line filter
      if (activeLines.size > 0 && !activeLines.has(plan.productLine))
        return false;

      // Text search
      if (q) {
        const haystack = [
          plan.carrier,
          plan.planName,
          plan.productLine,
          ...plan.states,
          plan.networkType,
          ...plan.keyBenefits,
          plan.enrollmentNotes,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [search, activeStates, activeLines]);

  const hasFilters =
    searchRaw.trim() || activeStates.size > 0 || activeLines.size > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div className="card" style={{ marginBottom: 14, padding: "16px 20px", background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)" }}>
        <h2 style={{ margin: "0 0 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#E8002D" }}>◈</span>
          Carrier Quick Reference
        </h2>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 14 }}>
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
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search carriers, plans, benefits..."
            style={{
              width: "100%",
              background: "#0A0A0A",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              padding: "9px 12px 9px 34px",
              fontSize: "0.85rem",
              fontFamily: "'DM Sans', sans-serif",
              color: "#F0F0F0",
              outline: "none",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(0,0,0,0.4)",
            }}
          />
        </div>

        {/* Filter rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#3A3A4A",
                minWidth: 44,
              }}
            >
              State
            </span>
            {STATES.map((s) => (
              <FilterPill
                key={s}
                label={s}
                active={activeStates.has(s)}
                color="138,138,154"
                onClick={() => toggleState(s)}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#3A3A4A",
                minWidth: 44,
              }}
            >
              Line
            </span>
            {LINES.map((l) => (
              <FilterPill
                key={l.id}
                label={l.label}
                active={activeLines.has(l.id)}
                color={l.rgb}
                onClick={() => toggleLine(l.id)}
              />
            ))}
          </div>
        </div>

        {/* Result count */}
        {hasFilters && (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#4A4A5A",
              }}
            >
              {filtered.length} plan{filtered.length !== 1 ? "s" : ""} found
            </span>
            <button
              onClick={() => {
                setSearchRaw("");
                setActiveStates(new Set());
                setActiveLines(new Set());
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#E8002D",
                padding: 0,
                opacity: 0.75,
              }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "#3A3A4A",
            background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
          }}
        >
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
              color: "#3A3A4A",
            }}
          >
            No plans match your search.
          </div>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.8rem",
              color: "#2A2A3A",
            }}
          >
            Try clearing some filters or adjusting your search term.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
