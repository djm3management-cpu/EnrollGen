const MAIN_WALLPAPER_URL = "/wallpapers/enrollgen-earthy.png";

export function MainWallpaper() {
  return (
    <img
      aria-hidden="true"
      className="eg-main-wallpaper"
      src={MAIN_WALLPAPER_URL}
      alt=""
      decoding="async"
    />
  );
}

function buildWavePath(y, peak, dir) {
  const x0 = -200;
  const x1 = 1600;
  const cp1x = x0 + (x1 - x0) * 0.32;
  const cp2x = x0 + (x1 - x0) * 0.68;
  const cp1y = y - peak * dir;
  const cp2y = y + peak * dir;
  return `M${x0},${y.toFixed(1)} C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${x1},${y.toFixed(1)}`;
}

// Each group = one "section divider" with paired/triplet parallel lines.
// Distinct brown per section so the bands feel separated. Muted alphas.
const WAVE_GROUPS = [
  { y: 150, peak: 180, dir: 1,  color: "#6b4d2d", count: 2, gap: 14, width: 1.0 },
  { y: 320, peak: 230, dir: -1, color: "#7a5a36", count: 3, gap: 16, width: 1.2 },
  { y: 490, peak: 210, dir: 1,  color: "#8a6338", count: 2, gap: 15, width: 1.3 },
  { y: 670, peak: 240, dir: -1, color: "#6b4d2d", count: 3, gap: 14, width: 1.1 },
  { y: 830, peak: 160, dir: 1,  color: "#54401f", count: 2, gap: 12, width: 0.9 },
];

const WAVE_GROUPS_DATA = WAVE_GROUPS.map((g, gi) => ({
  ...g,
  gi,
  paths: Array.from({ length: g.count }, (_, i) => {
    const offset = (i - (g.count - 1) / 2) * g.gap;
    return buildWavePath(g.y + offset, g.peak, g.dir);
  }),
}));

const EMBERS = Array.from({ length: 16 }, (_, i) => {
  const s = i * 7.31 + 3.1;
  return {
    left: `${(s * 13.7) % 100}%`,
    delay: `${(s * 2.7) % 22}s`,
    duration: `${24 + ((i * 5) % 22)}s`,
    drift: `${(((s * 1.3) % 60) - 30).toFixed(1)}px`,
    size: 1.2 + ((i * 0.7) % 2.6),
  };
});

export function Strata() {
  return (
    <div aria-hidden="true" className="eg-strata-stage">
      <div className="eg-aurora eg-aurora--1" />
      <div className="eg-aurora eg-aurora--2" />
      <div className="eg-aurora eg-aurora--3" />

      <svg
        className="eg-ribbons eg-ribbons--glow"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1400 900"
      >
        <defs>
          {WAVE_GROUPS_DATA.map((g) => (
            <linearGradient
              key={`gd-${g.gi}`}
              id={`eg-wave-glow-${g.gi}`}
              x1="0"
              x2="1"
              y1="0"
              y2="0"
            >
              <stop offset="0%" stopColor={g.color} stopOpacity="0" />
              <stop offset="22%" stopColor={g.color} stopOpacity="0.75" />
              <stop offset="50%" stopColor={g.color} stopOpacity="0.95" />
              <stop offset="78%" stopColor={g.color} stopOpacity="0.75" />
              <stop offset="100%" stopColor={g.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {WAVE_GROUPS_DATA.map((g) =>
          g.paths.map((d, i) => (
            <path
              key={`g-${g.gi}-${i}`}
              d={d}
              fill="none"
              stroke={`url(#eg-wave-glow-${g.gi})`}
              strokeWidth={g.width * 7}
              strokeLinecap="round"
            />
          ))
        )}
      </svg>

      <svg
        className="eg-ribbons eg-ribbons--core"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1400 900"
      >
        <defs>
          {WAVE_GROUPS_DATA.map((g) => (
            <linearGradient
              key={`cd-${g.gi}`}
              id={`eg-wave-core-${g.gi}`}
              x1="0"
              x2="1"
              y1="0"
              y2="0"
            >
              <stop offset="0%" stopColor={g.color} stopOpacity="0" />
              <stop offset="20%" stopColor={g.color} stopOpacity="1" />
              <stop offset="50%" stopColor={g.color} stopOpacity="1" />
              <stop offset="80%" stopColor={g.color} stopOpacity="1" />
              <stop offset="100%" stopColor={g.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {WAVE_GROUPS_DATA.map((g) =>
          g.paths.map((d, i) => (
            <path
              key={`c-${g.gi}-${i}`}
              d={d}
              fill="none"
              stroke={`url(#eg-wave-core-${g.gi})`}
              strokeWidth={g.width}
              strokeLinecap="round"
            />
          ))
        )}
      </svg>

      <div className="eg-grid" />

      <div className="eg-embers">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="eg-ember"
            style={{
              left: e.left,
              animationDelay: e.delay,
              animationDuration: e.duration,
              "--ember-drift": e.drift,
              "--ember-size": `${e.size}px`,
            }}
          />
        ))}
      </div>

      <div className="eg-grain" />
    </div>
  );
}

export default function ShellTextures() {
  return <Strata />;
}
