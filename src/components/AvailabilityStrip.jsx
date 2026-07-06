import { memo } from "react";
import { useAvailability } from "../context/AvailabilityContext";

const STATUS_COLORS = {
  available: "var(--status-live)",
  busy: "var(--status-pending)",
  offline: "var(--status-offline)",
};

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Thin display-only availability indicator in the top bar, visible in
// both CRM and call modes. Status changes happen via the cockpit toggle.
const AvailabilityStrip = memo(function AvailabilityStrip() {
  const availability = useAvailability();
  if (!availability?.agentId || !availability.hasApiKey) return null;

  const status = availability.status || "offline";
  const since = availability.statusSince
    ? TIME_FORMATTER.format(availability.statusSince)
    : null;

  return (
    <div
      className="availability-strip"
      title={`Agent ID: ${availability.agentId}${since ? ` since ${since}` : ""}`}
    >
      <span
        className="availability-strip__dot"
        style={{ background: STATUS_COLORS[status] || STATUS_COLORS.offline }}
        aria-hidden="true"
      />
      <span className="availability-strip__label">{status.toUpperCase()}</span>
    </div>
  );
});

export default AvailabilityStrip;
