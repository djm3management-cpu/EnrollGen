import React from "react";

export default function EnrollGenLogo({ width = 520, className = "" }) {
  const height = (140 / 520) * width;

  return (
    <svg
      viewBox="0 0 520 140"
      width={width}
      height={height}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="genGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>

      {/* Main Wordmark */}
      <g transform="translate(60,85)">
        <text
          fontFamily="Rajdhani, sans-serif"
          fontSize="64"
          fontWeight="700"
          letterSpacing="2"
          fill="#E10600" // Proper F1 red
        >
          ENROLL
        </text>

        <text
          x="235"
          fontFamily="Rajdhani, sans-serif"
          fontSize="64"
          fontWeight="400"
          letterSpacing="2"
          fill="url(#genGrad)"
        >
          GEN
        </text>
      </g>

      {/* Clean Performance Underline */}
      <rect
        x="60"
        y="100"
        width="285"
        height="3"
        fill="url(#genGrad)"
        opacity="0.95"
      />

      {/* Sub Label */}
      <text
        x="200"
        y="125"
        fontFamily="JetBrains Mono, monospace"
        fontSize="13"
        fill="#5A6A80"
        letterSpacing="5"
      >
        AGENT SCRIPT ASSIST
      </text>

      {/* Subtle Checkered Accent */}
      <g transform="translate(370,38) scale(0.85)" opacity="0.8">
        <rect x="0" y="0" width="8" height="8" fill="#E8EDF5" />
        <rect x="8" y="8" width="8" height="8" fill="#E8EDF5" />
        <rect x="16" y="0" width="8" height="8" fill="#E8EDF5" />
        <rect x="24" y="8" width="8" height="8" fill="#E8EDF5" />
      </g>
    </svg>
  );
}
