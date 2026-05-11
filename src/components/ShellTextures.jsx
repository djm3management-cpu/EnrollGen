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

function buildContourPaths(seed, count, baseY, spacing) {
  const paths = [];
  for (let i = 0; i < count; i += 1) {
    const y = baseY + i * spacing;
    const a1 = (seed + i * 1.7) % 6.28;
    const a2 = (seed + i * 2.3) % 6.28;
    const amp = 180 + ((i * 37) % 80);
    const c1y = y + Math.sin(a1) * amp - 40;
    const c2y = y - Math.cos(a2) * amp + 30;
    const c3y = y + Math.sin(a1 + 1.2) * amp - 20;
    const c4y = y - Math.cos(a2 + 0.7) * amp + 40;
    paths.push(
      `M-80,${y} C260,${c1y} 520,${c2y} 760,${y - 30} S1180,${c3y} 1480,${c4y}`
    );
  }
  return paths;
}

export function Strata() {
  const layerA = buildContourPaths(0.35, 3, 180, 240);
  const layerB = buildContourPaths(2.1, 1, 540, 0);
  const layerC = buildContourPaths(4.7, 3, 120, 220);

  return (
    <div aria-hidden="true" className="eg-strata-stage">
      <svg
        className="eg-strata eg-strata--a"
        preserveAspectRatio="none"
        viewBox="0 0 1400 900"
      >
        <g>
          {layerA.map((d, i) => (
            <path
              key={`a-${i}`}
              d={d}
              fill="none"
              stroke="var(--eg-accent)"
              strokeWidth={i % 2 === 0 ? 1.6 : 1.1}
              strokeDasharray="none"
            />
          ))}
        </g>
      </svg>
      <svg
        className="eg-strata eg-strata--b"
        preserveAspectRatio="none"
        viewBox="0 0 1400 900"
      >
        <g>
          {layerB.map((d, i) => (
            <path
              key={`b-${i}`}
              d={d}
              fill="none"
              stroke="var(--eg-accent-bright)"
              strokeWidth={1.4}
              strokeDasharray="none"
            />
          ))}
        </g>
      </svg>
      <svg
        className="eg-strata eg-strata--c"
        preserveAspectRatio="none"
        viewBox="0 0 1400 900"
      >
        <g>
          {layerC.map((d, i) => (
            <path
              key={`c-${i}`}
              d={d}
              fill="none"
              stroke="var(--eg-accent)"
              strokeWidth={i % 2 === 0 ? 1.2 : 0.9}
              strokeDasharray={i % 2 === 0 ? "14 18" : "6 14"}
              strokeLinecap="round"
            />
          ))}
        </g>
      </svg>
      <div className="eg-grain" />
    </div>
  );
}

export default function ShellTextures() {
  return <Strata />;
}
