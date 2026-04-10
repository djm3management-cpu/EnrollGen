import { useState } from "react";
import STATE_PATHS, { STATE_CENTROIDS } from "../../data/usMapPaths";

const ALL_STATES = new Set(Object.keys(STATE_PATHS));

const LABEL_OFFSETS = {
  CT: [40, 2], DC: [30, 12], DE: [28, 8], MA: [38, 0],
  MD: [40, 18], NH: [30, 0], NJ: [24, 8], RI: [28, 4], VT: [30, -4],
};

export function StateMap({ selectedState, onStateClick, compact = false }) {
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  function pathStyle(code) {
    const isSel = selectedState === code;
    const isHov = hovered === code;

    if (isSel) {
      return {
        fill: "rgba(232,0,45,0.35)",
        stroke: "#E8002D",
        strokeWidth: 2,
        cursor: "pointer",
        filter: "url(#sep-glow)",
      };
    }
    if (isHov) {
      return {
        fill: "rgba(232,0,45,0.18)",
        stroke: "rgba(232,0,45,0.6)",
        strokeWidth: 1.5,
        cursor: "pointer",
        filter: "url(#sep-glow-s)",
      };
    }
    return {
      fill: "rgba(232,0,45,0.08)",
      stroke: "rgba(255,255,255,0.12)",
      strokeWidth: 0.8,
      cursor: "pointer",
      filter: undefined,
    };
  }

  return (
    <div className={compact ? "sep-map-compact" : "sep-map-landing"}>
      <svg viewBox="60 50 900 520" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <filter id="sep-glow">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="sep-glow-s">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {Object.entries(STATE_PATHS).map(([code, d]) => {
          const s = pathStyle(code);
          return (
            <path
              key={code}
              d={d}
              fill={s.fill}
              stroke={s.stroke}
              strokeWidth={s.strokeWidth}
              strokeLinejoin="round"
              filter={s.filter}
              style={{ cursor: s.cursor, transition: "fill 0.15s, stroke 0.15s" }}
              onClick={() => onStateClick(code)}
              onMouseEnter={(e) => {
                setHovered(code);
                const r = e.currentTarget.closest("svg").getBoundingClientRect();
                setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseMove={(e) => {
                const r = e.currentTarget.closest("svg").getBoundingClientRect();
                setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {Object.entries(STATE_CENTROIDS).map(([code, [cx, cy]]) => {
          if (!ALL_STATES.has(code)) return null;
          const isSel = selectedState === code;
          const isHov = hovered === code;
          const offset = LABEL_OFFSETS[code];
          const lx = offset ? cx + offset[0] : cx;
          const ly = offset ? cy + offset[1] : cy;

          return (
            <g key={`l-${code}`} style={{ pointerEvents: "none" }}>
              {offset && (
                <line x1={cx} y1={cy} x2={lx - 4} y2={ly} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
              )}
              <text
                x={lx} y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isSel ? "#FFFFFF" : isHov ? "#F0F0F0" : "#999"}
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: isSel || isHov ? "11px" : "8px",
                  letterSpacing: "0.06em",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  transition: "all 0.15s",
                }}
              >
                {code}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && !compact && (
        <div
          style={{
            position: "absolute",
            left: mousePos.x + 14,
            top: mousePos.y - 10,
            pointerEvents: "none",
            zIndex: 20,
            background: "linear-gradient(145deg, rgba(22,22,28,0.97), rgba(12,12,14,0.98))",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "7px 12px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
          }}
        >
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "0.76rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#F0F0F0",
          }}>
            {hovered}
          </span>
          <span style={{ fontSize: "0.65rem", color: "#5A5A6A", marginLeft: 8 }}>
            Click to explore
          </span>
        </div>
      )}
    </div>
  );
}
