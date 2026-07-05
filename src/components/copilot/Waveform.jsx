import { useEffect, useRef } from "react";
import { WAVEFORM_PEAK_COUNT } from "../../audio/audioPeaks";

function clampLevel(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizePeaks(peaks) {
  const normalized = new Array(WAVEFORM_PEAK_COUNT).fill(0);
  if (!peaks?.length) return normalized;

  for (let i = 0; i < WAVEFORM_PEAK_COUNT; i += 1) {
    const value = peaks[i] || 0;
    normalized[i] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }

  return normalized;
}

/**
 * Waveform visualizer
 * 240px x 32px canvas, 48 vertical bars, 2px gap.
 * Active: live peak-bucket bars at --eg-accent + aa alpha.
 * Idle: near-flat bars (5% height + 3% oscillation) at --eg-text-faint + 44 alpha.
 * Spec: docs/DESIGN_SYSTEM.md Section 9.
 */
export default function Waveform({
  active = false,
  level = null,
  peaks = null,
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
  const peaksRef = useRef(normalizePeaks(peaks));
  const displayPeaksRef = useRef(normalizePeaks(peaks));
  const hasExternalLevel = level !== null;
  const hasExternalPeaks = peaks !== null;

  useEffect(() => {
    levelRef.current = clampLevel(level);
  }, [level]);

  useEffect(() => {
    peaksRef.current = normalizePeaks(peaks);
  }, [peaks]);

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

    const activeColor = resolveColor("--eg-accent", "var(--accent)", "aa");
    const inactiveColor = resolveColor("--eg-text-faint", "var(--text-muted)", "44", idleColor);
    const bars = WAVEFORM_PEAK_COUNT;
    const barWidth = width / bars;

    let timeoutId = null;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const targetLevel = hasExternalLevel ? levelRef.current : active ? 0.72 : 0;
      displayLevelRef.current += (targetLevel - displayLevelRef.current) * 0.22;
      const smoothedLevel = displayLevelRef.current;
      const hasVisiblePeaks = displayPeaksRef.current.some((peak) => peak > 0.015);
      const isActive = active || smoothedLevel > 0.015 || hasVisiblePeaks;
      const phaseStep = isActive ? 0.04 : 0.012;
      phaseRef.current += phaseStep;

      for (let i = 0; i < bars; i += 1) {
        let amp;
        if (hasExternalPeaks) {
          const targetPeak = peaksRef.current[i] || 0;
          const currentPeak = displayPeaksRef.current[i] || 0;
          const response = targetPeak > currentPeak ? 0.7 : 0.24;
          const nextPeak = currentPeak + (targetPeak - currentPeak) * response;
          displayPeaksRef.current[i] = nextPeak < 0.006 ? 0 : nextPeak;
          amp = isActive ? Math.max(0.025, displayPeaksRef.current[i]) : displayPeaksRef.current[i];
        } else {
          const centerWeight = 1 - Math.abs(i - bars / 2) / (bars / 2);
          const motion =
            (Math.sin(phaseRef.current + i * 0.3) * 0.4 + 0.5) *
            (Math.sin(phaseRef.current * 0.7 + i * 0.15) * 0.3 + 0.7);
          amp = isActive
            ? Math.max(
                0.08,
                motion * (0.28 + smoothedLevel * 1.15) * (0.65 + centerWeight * 0.35)
              )
            : 0.05 + Math.sin(phaseRef.current * 0.5 + i * 0.2) * 0.03;
        }

        const h = Math.min(height * 0.9, amp * height * 0.9);
        const y = (height - h) / 2;
        ctx.fillStyle = isActive ? activeColor : inactiveColor;
        ctx.fillRect(i * barWidth + 1, y, barWidth - 2, h);
      }

      if (isActive) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        // Idle: redraw ~8 fps via setTimeout so the GPU isn't pegged for a near-flat line.
        timeoutId = setTimeout(() => {
          frameRef.current = requestAnimationFrame(draw);
        }, 125);
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [active, width, height, color, idleColor, hasExternalLevel, hasExternalPeaks]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width, height, borderRadius: 4, display: "block" }}
    />
  );
}
