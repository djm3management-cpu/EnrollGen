import { useState, useCallback, memo } from "react";
import { StickyNote } from "lucide-react";

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
        <StickyNote size={11} style={{ color: "#60a5fa" }} />
        <span
          style={{
            fontSize: "0.64em",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#60a5fa",
          }}
        >
          Quick Notes
        </span>
      </div>
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
