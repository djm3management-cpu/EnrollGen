import { useState, memo } from "react";
import { User } from "lucide-react";

const FIELDS = [
  { key: "name", label: "Name", placeholder: "Caller name" },
  { key: "zip", label: "ZIP", placeholder: "00000" },
  { key: "bday", label: "DOB", placeholder: "MM/DD/YYYY" },
  { key: "mbi", label: "MBI", placeholder: "MBI #" },
];

const CallerInfo = memo(function CallerInfo() {
  const [values, setValues] = useState({ name: "", zip: "", bday: "", mbi: "" });

  const update = (key, val) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 16,
        padding: "8px 12px 10px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 10px 24px rgba(0, 0, 0, 0.36)",
        width: 230,
        marginBottom: 8,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          paddingBottom: 5,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <User size={11} style={{ color: "#f97316" }} />
        <span
          style={{
            fontSize: "0.64em",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#f97316",
          }}
        >
          Caller Info
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.46em",
            color: "#475569",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          local only
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {FIELDS.map((f) => (
          <div
            key={f.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <label
              style={{
                fontSize: "0.56em",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#64748b",
                width: 30,
                flexShrink: 0,
              }}
            >
              {f.label}
            </label>
            <input
              type="text"
              value={values[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 6,
                padding: "3px 7px",
                color: "#e2e8f0",
                fontSize: "0.58em",
                fontFamily: "'Inter', sans-serif",
                outline: "none",
                minWidth: 0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

export default CallerInfo;
