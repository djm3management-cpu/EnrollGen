import React from "react";

export default function EnrollGenLogo({ width = 480, className = "" }) {
  const height = (100 / 480) * width;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 480 100"
      fill="none"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="EnrollGen Agent Script Assist"
    >
      {/* Shield / HexShield Icon */}
      <g transform="translate(8, 6)">
        {/* Outer hex shield */}
        <path
          d="M44 2L80 22V62L44 82L8 62V22L44 2Z"
          stroke="#38bdf8"
          strokeWidth="2.5"
          fill="none"
          opacity="0.9"
        />
        {/* Inner hex shield */}
        <path
          d="M44 14L68 28V56L44 70L20 56V28L44 14Z"
          stroke="#2dd4bf"
          strokeWidth="1.5"
          fill="rgba(56,189,248,0.06)"
          opacity="0.7"
        />
        {/* Checkmark */}
        <path
          d="M30 42L40 52L60 30"
          stroke="#38bdf8"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Pulse ring */}
        <circle
          cx="44"
          cy="42"
          r="24"
          stroke="#38bdf8"
          strokeWidth="0.8"
          fill="none"
          opacity="0.25"
        />
        {/* Corner accents */}
        <path d="M44 2L48 4" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M44 2L40 4" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M44 82L48 80" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M44 82L40 80" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </g>

      {/* Wordmark */}
      <g transform="translate(108, 0)">
        <text
          x="0"
          y="58"
          fontFamily="Rajdhani, sans-serif"
          fontWeight="700"
          fontSize="48"
          letterSpacing="2"
          fill="#e8edf5"
        >
          ENROLL
        </text>
        <text
          x="192"
          y="58"
          fontFamily="Rajdhani, sans-serif"
          fontWeight="700"
          fontSize="48"
          letterSpacing="2"
          fill="#38bdf8"
        >
          GEN
        </text>
        <text
          x="1"
          y="78"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="500"
          fontSize="10"
          letterSpacing="3.5"
          fill="#5a6a80"
        >
          AGENT SCRIPT ASSIST
        </text>
        {/* Accent lines */}
        <line x1="0" y1="86" x2="100" y2="86" stroke="#38bdf8" strokeWidth="1.5" opacity="0.4" />
        <line x1="100" y1="86" x2="300" y2="86" stroke="#38bdf8" strokeWidth="0.5" opacity="0.15" />
      </g>
    </svg>
  );
}
