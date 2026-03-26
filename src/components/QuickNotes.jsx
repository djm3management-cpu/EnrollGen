import { useState, useCallback, memo } from "react";

const QuickNotes = memo(function QuickNotes({ onNotesChange }) {
  const [notes, setNotes] = useState("");

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setNotes(val);
      onNotesChange?.(val);
    },
    [onNotesChange]
  );

  return (
    <div style={{ padding: "6px 10px 8px" }}>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder=""
        rows={3}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: "6px 8px",
          color: "#e2e8f0",
          fontSize: "0.58em",
          fontFamily: "'Inter', sans-serif",
          lineHeight: 1.5,
          outline: "none",
          resize: "vertical",
          minHeight: 48,
          maxHeight: 120,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
});

export default QuickNotes;
