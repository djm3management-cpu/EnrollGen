import { memo } from "react";
import { AVAILABILITY_OPTIONS, availabilityLabel, requiresPhoneReady } from "../lib/availabilityStatus";
import { useAvailability } from "../context/AvailabilityContext";
import { isAuthDisabled } from "../lib/agentIdentity";

// Availability toggle rendered in the cockpit right rail. State lives in
// AvailabilityContext so the top-bar status strip stays in sync.

const STATUS_OPTIONS = AVAILABILITY_OPTIONS;

const AgentAvailabilityToggle = memo(function AgentAvailabilityToggle() {
  const availability = useAvailability();
  if (!availability) return null;

  const {
    agentId,
    identityLoaded,
    canAuthenticate,
    status,
    pendingStatus,
    isHydrated,
    isSaving,
    error,
    changeStatus,
  } = availability;

  const disabledReason = !identityLoaded
    ? "Loading agent identity"
    : !canAuthenticate
      ? "Sign in with Clerk to change availability"
      : !agentId
        ? isAuthDisabled()
          ? "Set a local agent name or VITE_AGENT_AVAILABILITY_AGENT_ID for localhost"
          : "Unable to resolve agent_id for the signed-in user"
        : "";

  const isInteractive = !disabledReason && isHydrated;
  const selectedStatus = status === "wrap_up" ? "busy" : pendingStatus || status;
  const waiting = requiresPhoneReady(pendingStatus) && !isSaving;
  const panelTitle = (waiting ? `${availabilityLabel(selectedStatus)} — connecting phone` : error) || disabledReason || (agentId ? `Agent ID: ${agentId}` : "");

  return (
    <div
      className={`agent-availability-panel${isSaving ? " is-saving" : ""}${
        error ? " is-error" : ""
      }${!isInteractive ? " is-disabled" : ""}`}
      title={panelTitle}
    >
      <div className="agent-availability-buttons" role="group" aria-label="Agent availability">
        {STATUS_OPTIONS.map((option) => (
          <button data-key-role="secondary"
            key={option.value}
            type="button"
            className={`agent-availability-btn${
              option.value === selectedStatus ? " is-active" : ""
            }`}
            style={{ "--availability-color": option.color }}
            onClick={() => changeStatus(option.value)}
            disabled={!isInteractive || (status === "wrap_up" && requiresPhoneReady(option.value))}
            aria-pressed={option.value === selectedStatus}
          >
            {status === "wrap_up" && option.value === "busy" ? "WRAP-UP" : option.value === selectedStatus && waiting ? "CONNECTING…" : option.label}
          </button>
        ))}
      </div>
    </div>
  );
});

export default AgentAvailabilityToggle;
