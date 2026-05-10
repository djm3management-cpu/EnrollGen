import { useEffect, useRef } from "react";

function clampLevel(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Waveform visualizer
 * 240px x 32px canvas, 48 vertical bars, 2px gap.
 * Active: sine-modulated bars at --eg-accent + aa alpha.
 * Idle: near-flat bars (5% height + 3% oscillation) at --eg-text-faint + 44 alpha.
 * Spec: docs/DESIGN_SYSTEM.md Section 9.
 */
export default function Waveform({
  active = false,
  level = null,
  width = 240,
  height = 32,
  color,
  idleColor,
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const phaseRef = useRef(0);
  const levelRef = useRef(clampLevel(level));
  const displayLevelRef = useRef(clampLevel(level));
  const hasExternalLevel = level !== null;

  useEffect(() => {
    levelRef.current = clampLevel(level);
  }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    const resolveColor = (cssVar, fallbackHex, alphaHex, override) => {
      if (override) return override;
      if (color) return color;
      const root = getComputedStyle(document.documentElement);
      const value = root.getPropertyValue(cssVar).trim() || fallbackHex;
      return `${value}${alphaHex}`;
    };

    const activeColor = resolveColor("--eg-accent", "#c08b55", "aa");
    const inactiveColor = resolveColor("--eg-text-faint", "#524838", "44", idleColor);
    const bars = 48;
    const barWidth = width / bars;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      phaseRef.current += 0.04;
      const targetLevel = hasExternalLevel ? levelRef.current : active ? 0.72 : 0;
      displayLevelRef.current += (targetLevel - displayLevelRef.current) * 0.22;
      const smoothedLevel = displayLevelRef.current;
      const isActive = active || smoothedLevel > 0.015;

      for (let i = 0; i < bars; i += 1) {
        const centerWeight = 1 - Math.abs(i - bars / 2) / (bars / 2);
        const motion =
          (Math.sin(phaseRef.current + i * 0.3) * 0.4 + 0.5) *
          (Math.sin(phaseRef.current * 0.7 + i * 0.15) * 0.3 + 0.7);
        const amp = isActive
          ? Math.max(0.08, motion * (0.28 + smoothedLevel * 1.15) * (0.65 + centerWeight * 0.35))
          : 0.05 + Math.sin(phaseRef.current * 0.5 + i * 0.2) * 0.03;
        const h = Math.min(height * 0.88, amp * height * 0.8);
        const y = (height - h) / 2;
        ctx.fillStyle = isActive ? activeColor : inactiveColor;
        ctx.fillRect(i * barWidth + 1, y, barWidth - 2, h);
      }
      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, width, height, color, idleColor, hasExternalLevel]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width, height, borderRadius: 4, display: "block" }}
    />
  );
}
