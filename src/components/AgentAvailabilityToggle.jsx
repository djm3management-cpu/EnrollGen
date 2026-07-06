import { memo } from "react";
import { useAvailability } from "../context/AvailabilityContext";
import { isAuthDisabled } from "../lib/agentIdentity";

// Availability toggle rendered in the cockpit right rail. State lives in
// AvailabilityContext so the top-bar status strip stays in sync.

const STATUS_OPTIONS = [
  { value: "available", label: "AVAILABLE", color: "var(--status-live)" },
  { value: "busy", label: "BUSY", color: "var(--status-pending)" },
  { value: "offline", label: "OFFLINE", color: "var(--status-offline)" },
];

const STATUS_MAP = Object.fromEntries(
  STATUS_OPTIONS.map((status) => [status.value, status])
);

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const AgentAvailabilityToggle = memo(function AgentAvailabilityToggle() {
  const availability = useAvailability();
  if (!availability) return null;

  const {
    agentId,
    identityLoaded,
    hasApiKey,
    status,
    statusSince,
    isHydrated,
    isSaving,
    error,
    changeStatus,
  } = availability;

  const activeStatus = STATUS_MAP[status] || STATUS_MAP.offline;
  const sinceLabel = statusSince ? TIME_FORMATTER.format(statusSince) : null;

  const disabledReason = !identityLoaded
    ? "Loading agent identity"
    : !hasApiKey
      ? "VITE_AGENT_API_KEY is not configured"
      : !agentId
        ? isAuthDisabled()
          ? "Set a local agent name or VITE_AGENT_AVAILABILITY_AGENT_ID for localhost"
          : "Unable to resolve agent_id for the signed-in user"
        : "";

  const isInteractive = !disabledReason && isHydrated;
  const panelTitle = error || disabledReason || (agentId ? `Agent ID: ${agentId}` : "");

  return (
    <div
      className={`agent-availability-panel${isSaving ? " is-saving" : ""}${
        error ? " is-error" : ""
      }${!isInteractive ? " is-disabled" : ""}`}
      title={panelTitle}
    >
      <div className="agent-availability-header">
        <div className="agent-availability-current">
          <span
            className={`agent-availability-dot is-${activeStatus.value}`}
            style={{ "--availability-color": activeStatus.color }}
            aria-hidden="true"
          />
          <span className="agent-availability-status">{activeStatus.label}</span>
        </div>
        <span className="agent-availability-since">
          {sinceLabel ? `since ${sinceLabel}` : " "}
        </span>
      </div>

      <div className="agent-availability-buttons" role="group" aria-label="Agent availability">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`agent-availability-btn${
              option.value === status ? " is-active" : ""
            }`}
            style={{ "--availability-color": option.color }}
            onClick={() => changeStatus(option.value)}
            disabled={!isInteractive || isSaving}
            aria-pressed={option.value === status}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
});

export default AgentAvailabilityToggle;
