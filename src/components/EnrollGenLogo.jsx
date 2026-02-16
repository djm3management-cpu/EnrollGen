import React from "react";

export default function EnrollGenLogo({ width = 460, className = "" }) {
  const height = (110 / 460) * width;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 460 110"
      fill="none"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="EnrollGen Agent Script Assist"
    >
      <defs>
        {/* Diagonal speed stripe behind text */}
        <clipPath id="speedClip">
          <rect x="0" y="0" width="460" height="110" />
        </clipPath>
      </defs>

      {/* Speed stripes — subtle diagonal lines (F1 livery nod) */}
      <g clipPath="url(#speedClip)" opacity="0.06">
        <line x1="340" y1="-10" x2="300" y2="120" stroke="#e8edf5" strokeWidth="18" />
        <line x1="370" y1="-10" x2="330" y2="120" stroke="#e8edf5" strokeWidth="8" />
        <line x1="395" y1="-10" x2="355" y2="120" stroke="#e8edf5" strokeWidth="4" />
      </g>

      {/* Red racing stripe — top edge */}
      <rect x="0" y="0" width="160" height="3" rx="1" fill="#e11d48" />
      <rect x="165" y="0" width="40" height="3" rx="1" fill="#e11d48" opacity="0.4" />
      <rect x="210" y="0" width="12" height="3" rx="1" fill="#e11d48" opacity="0.2" />

      {/* ENROLL — white, heavy */}
      <text
        x="0"
        y="62"
        fontFamily="Rajdhani, sans-serif"
        fontWeight="700"
        fontSize="58"
        letterSpacing="3"
        fill="#e8edf5"
      >
        ENROLL
      </text>

      {/* GEN — red, matches racing accent */}
      <text
        x="234"
        y="62"
        fontFamily="Rajdhani, sans-serif"
        fontWeight="700"
        fontSize="58"
        letterSpacing="3"
        fill="#e11d48"
      >
        GEN
      </text>

      {/* AGENT SCRIPT ASSIST — larger, red tint */}
      <text
        x="1"
        y="88"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
        fontSize="13"
        letterSpacing="4"
        fill="#e11d48"
        opacity="0.7"
      >
        AGENT SCRIPT ASSIST
      </text>

      {/* Bottom racing stripe */}
      <rect x="0" y="100" width="260" height="2" rx="1" fill="#e11d48" opacity="0.35" />
      <rect x="265" y="100" width="60" height="2" rx="1" fill="#e11d48" opacity="0.15" />
      <rect x="330" y="100" width="20" height="2" rx="1" fill="#e11d48" opacity="0.08" />
    </svg>
  );
}
