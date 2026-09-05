import { memo, useEffect, useRef, useState } from "react";
import { useAvailability } from "../context/AvailabilityContext";

const STATUS_OPTIONS = [
  { value: "available", label: "AVAILABLE", color: "var(--status-live)" },
  { value: "busy", label: "BUSY", color: "var(--status-pending)" },
  { value: "offline", label: "OFFLINE", color: "var(--status-offline)" },
];

const STATUS_COLORS = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.color])
);

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Availability control in the top bar, visible in both CRM and call modes.
const AvailabilityStrip = memo(function AvailabilityStrip() {
  const availability = useAvailability();
  const [open, setOpen] = useState(false);
  const controlRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!controlRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!availability?.agentId || !availability.hasApiKey) return null;

  const status = availability.status || "offline";
  const since = availability.statusSince
    ? TIME_FORMATTER.format(availability.statusSince)
    : null;

  const isInteractive = availability.identityLoaded && availability.isHydrated;
  const title = availability.error ||
    `Agent ID: ${availability.agentId}${since ? ` since ${since}` : ""}`;

  const selectStatus = (nextStatus) => {
    setOpen(false);
    void availability.changeStatus(nextStatus);
  };

  return (
    <div
      ref={controlRef}
      className={`availability-control${open ? " is-open" : ""}${
        availability.isSaving ? " is-saving" : ""
      }`}
    >
      <button
        type="button"
        className="availability-strip"
        title={title}
        aria-label={`Agent availability: ${status}. Change status`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={!isInteractive}
      >
        <span
          className="availability-strip__dot"
          style={{ background: STATUS_COLORS[status] || STATUS_COLORS.offline }}
          aria-hidden="true"
        />
        <span className="availability-strip__label">{status.toUpperCase()}</span>
        <span className="availability-strip__chevron" aria-hidden="true">▼</span>
      </button>

      {open ? (
        <div className="availability-menu" role="menu" aria-label="Set agent availability">
          {STATUS_OPTIONS.map((option) => {
            const active = option.value === status;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`availability-menu__option${active ? " is-active" : ""}`}
                style={{ "--availability-color": option.color }}
                onClick={() => selectStatus(option.value)}
                disabled={!isInteractive || availability.isSaving}
              >
                <span className="availability-menu__dot" aria-hidden="true" />
                <span>{option.label}</span>
                <span className="availability-menu__check" aria-hidden="true">
                  {active ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

export default AvailabilityStrip;
