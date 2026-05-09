import { useEffect, useRef } from "react";

/**
 * Strata: subtle topographic contour lines drawn as SVG, opacity 0.035, --eg-accent.
 * Renders once, sits absolute behind all content. Pointer-events: none.
 * See docs/DESIGN_SYSTEM.md Section 8.
 */
export function Strata() {
  return (
    <svg
      aria-hidden="true"
      className="eg-strata"
      preserveAspectRatio="none"
      viewBox="0 0 1200 800"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.035,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {[80, 160, 240, 340, 440, 540, 620, 700].map((y, i) => (
        <path
          key={i}
          d={`M0,${y} Q${150 + i * 30},${y - 15 + (i % 3) * 8} ${300 + i * 20},${y + 5} T${600 + i * 15},${y - 8} T${900 - i * 10},${y + 10} T1200,${y - 3}`}
          fill="none"
          stroke="var(--eg-accent)"
          strokeWidth={i % 2 === 0 ? 0.6 : 0.3}
          strokeDasharray={i % 3 === 0 ? "6 10" : "none"}
        />
      ))}
    </svg>
  );
}

/**
 * GrainOverlay: 200x200 canvas of random grayscale values at alpha 8/255,
 * canvas opacity 0.5, sits absolute over the strata. Pointer-events: none.
 * See docs/DESIGN_SYSTEM.md Section 8.
 */
export function GrainOverlay() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = 200;
    cv.height = 200;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 8;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="eg-grain"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.5,
        zIndex: 0,
      }}
    />
  );
}

export default function ShellTextures() {
  return (
    <>
      <Strata />
      <GrainOverlay />
    </>
  );
}
