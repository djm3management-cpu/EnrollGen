import { useState, memo } from "react";

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
    <div style={{ padding: "6px 10px 8px" }}>
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
