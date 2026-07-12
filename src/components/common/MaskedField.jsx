import { Eye, EyeOff } from "lucide-react";

// Read-only masked PII display. Shows `maskedValue` until the record
// has been revealed (revealed/value are owned by the caller — reveal
// is a contact-level action via decrypt_pii, not per-field, so every
// MaskedField for the same contact shares one reveal/auto-hide timer).
// Right-click is disabled and copy events are reported via onCopy so
// the caller can log an 'export' access.
export default function MaskedField({
  label,
  maskedValue,
  value,
  revealed,
  onRequestReveal,
  onCopy,
  className = "",
  as: Tag = "span",
}) {
  const displayValue = revealed && value != null && value !== "" ? value : maskedValue || "--";

  return (
    <span className={`pii-masked-field ${className}`.trim()}>
      {label ? <span className="pii-masked-field-label">{label}</span> : null}
      <Tag
        className="pii-masked-field-value"
        onContextMenu={(event) => event.preventDefault()}
        onCopy={(event) => {
          if (revealed) onCopy?.();
          else event.preventDefault();
        }}
      >
        {displayValue}
      </Tag>
      {onRequestReveal ? (
        <button
          type="button"
          className="pii-masked-field-toggle"
          onClick={onRequestReveal}
          aria-label={revealed ? "Hide PII" : "Reveal PII"}
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      ) : null}
    </span>
  );
}
