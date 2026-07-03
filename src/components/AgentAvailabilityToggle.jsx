import { memo, useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";

const AUTH_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const API_KEY = import.meta.env.VITE_AGENT_API_KEY;
const LOCAL_AGENT_ID = import.meta.env.VITE_AGENT_AVAILABILITY_AGENT_ID;
const FUNCTIONS_BASE_URL =
  "https://qzjtagnpklaxefwurorc.supabase.co/functions/v1";

const STATUS_OPTIONS = [
  { value: "available", label: "AVAILABLE", color: "var(--status-live)" },
  { value: "busy", label: "BUSY", color: "var(--status-pending)" },
  { value: "offline", label: "OFFLINE", color: "var(--status-offline)" },
];

const STATUS_MAP = Object.fromEntries(
  STATUS_OPTIONS.map((status) => [status.value, status])
);

const KNOWN_AGENT_ID_MAP = new Map([
  ["markendres", "mark_endres"],
  ["miguel", "miguel_mejia"],
  ["miguelmejia", "miguel_mejia"],
  ["m3", "mark_endres"],
  ["nghscontracting", "mark_endres"],
  ["nghs", "mark_endres"],
  ["michaelshlomos", "mark_endres"],
]);

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function normalizeLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getTrimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function mapKnownAgentId(value) {
  const normalized = normalizeLookupValue(value);
  return normalized ? KNOWN_AGENT_ID_MAP.get(normalized) || null : null;
}

function resolveAgentIdFromCandidates(candidates) {
  for (const value of candidates) {
    const trimmed = getTrimmedString(value);
    if (!trimmed) {
      continue;
    }

    const mapped = mapKnownAgentId(trimmed);
    if (mapped) {
      return mapped;
    }
  }

  for (const value of candidates) {
    const trimmed = getTrimmedString(value);
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function resolveAgentId(user) {
  if (!user) {
    return null;
  }

  return resolveAgentIdFromCandidates([
    user.publicMetadata?.availabilityAgentId,
    user.publicMetadata?.availability_agent_id,
    user.publicMetadata?.agentId,
    user.publicMetadata?.agent_id,
    user.unsafeMetadata?.availabilityAgentId,
    user.unsafeMetadata?.availability_agent_id,
    user.unsafeMetadata?.agentId,
    user.unsafeMetadata?.agent_id,
    user.publicMetadata?.agentName,
    user.unsafeMetadata?.agentName,
    user.username,
    user.fullName,
    [user.firstName, user.lastName].filter(Boolean).join(" "),
  ]);
}

function readLocalAgentId() {
  const persistedAgentName = (() => {
    if (typeof window === "undefined") {
      return "";
    }

    try {
      const raw = window.localStorage.getItem("enrollgen_persist");
      if (!raw) {
        return "";
      }

      const parsed = JSON.parse(raw);
      return getTrimmedString(parsed?.agentName);
    } catch {
      return "";
    }
  })();

  return resolveAgentIdFromCandidates([
    LOCAL_AGENT_ID,
    persistedAgentName,
  ]);
}

function normalizeStatus(value) {
  const normalized = getTrimmedString(value).toLowerCase();
  return STATUS_MAP[normalized] ? normalized : null;
}

function parseSinceValue(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractStatus(payload) {
  const candidates = [
    payload?.status,
    payload?.availability?.status,
    payload?.data?.status,
    payload?.current_status,
    payload?.currentStatus,
  ];

  for (const value of candidates) {
    const normalized = normalizeStatus(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractSince(payload) {
  const candidates = [
    payload?.since,
    payload?.since_at,
    payload?.sinceAt,
    payload?.changed_at,
    payload?.changedAt,
    payload?.updated_at,
    payload?.updatedAt,
    payload?.availability?.since,
    payload?.availability?.changed_at,
    payload?.availability?.updated_at,
    payload?.data?.since,
    payload?.data?.changed_at,
    payload?.data?.updated_at,
  ];

  for (const value of candidates) {
    const parsed = parseSinceValue(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function buildRequestError(response, fallbackMessage) {
  return `${fallbackMessage} (${response.status})`;
}

function AgentAvailabilityToggleBase({ agentId, identityLoaded }) {
  const [status, setStatus] = useState("offline");
  const [statusSince, setStatusSince] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const activeStatus = STATUS_MAP[status] || STATUS_MAP.offline;
  const sinceLabel = statusSince ? TIME_FORMATTER.format(statusSince) : null;

  useEffect(() => {
    if (!identityLoaded) {
      return undefined;
    }

    if (!API_KEY || !agentId) {
      setIsHydrated(true);
      if (!agentId) {
        setStatusSince(null);
      }
      return undefined;
    }

    setIsHydrated(false);
    const controller = new AbortController();

    async function loadAvailability() {
      try {
        setError("");

        const response = await fetch(
          `${FUNCTIONS_BASE_URL}/get-availability?agent_id=${encodeURIComponent(agentId)}`,
          {
            headers: {
              "x-api-key": API_KEY,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(buildRequestError(response, "Availability lookup failed"));
        }

        const payload = await response.json().catch(() => ({}));
        const nextStatus = extractStatus(payload) || "offline";
        const nextSince = extractSince(payload) || new Date();

        setStatus(nextStatus);
        setStatusSince(nextSince);
      } catch (err) {
        if (err?.name === "AbortError") {
          return;
        }

        console.error("[AgentAvailabilityToggle] GET failed:", err);
        setError(err?.message || "Availability lookup failed");
      } finally {
        setIsHydrated(true);
      }
    }

    loadAvailability();

    return () => controller.abort();
  }, [agentId, identityLoaded]);

  const disabledReason = !identityLoaded
    ? "Loading agent identity"
    : !API_KEY
      ? "VITE_AGENT_API_KEY is not configured"
      : !agentId
        ? AUTH_DISABLED
          ? "Set a local agent name or VITE_AGENT_AVAILABILITY_AGENT_ID for localhost"
          : "Unable to resolve agent_id for the signed-in user"
        : "";

  const isInteractive = !disabledReason && isHydrated;
  const panelTitle = error || disabledReason || (agentId ? `Agent ID: ${agentId}` : "");

  const handleStatusChange = async (nextStatus) => {
    if (!isInteractive || isSaving || nextStatus === status) {
      return;
    }

    const previousStatus = status;
    const previousSince = statusSince;
    const nextSince = new Date();

    setStatus(nextStatus);
    setStatusSince(nextSince);
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/set-availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          agent_id: agentId,
          status: nextStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(buildRequestError(response, "Availability update failed"));
      }

      const payload = await response.json().catch(() => ({}));
      setStatus(extractStatus(payload) || nextStatus);
      setStatusSince(extractSince(payload) || nextSince);
    } catch (err) {
      console.error("[AgentAvailabilityToggle] POST failed:", err);
      setError(err?.message || "Availability update failed");
      setStatus(previousStatus);
      setStatusSince(previousSince);
    } finally {
      setIsSaving(false);
    }
  };

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
          {sinceLabel ? `since ${sinceLabel}` : "\u00a0"}
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
            onClick={() => handleStatusChange(option.value)}
            disabled={!isInteractive || isSaving}
            aria-pressed={option.value === status}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const AuthenticatedAgentAvailabilityToggle = memo(function AuthenticatedAgentAvailabilityToggle() {
  const { user, isLoaded } = useUser();

  return (
    <AgentAvailabilityToggleBase
      agentId={resolveAgentId(user)}
      identityLoaded={isLoaded}
    />
  );
});

const LocalAgentAvailabilityToggle = memo(function LocalAgentAvailabilityToggle() {
  return (
    <AgentAvailabilityToggleBase
      agentId={readLocalAgentId()}
      identityLoaded
    />
  );
});

const AgentAvailabilityToggle = memo(function AgentAvailabilityToggle() {
  return AUTH_DISABLED
    ? <LocalAgentAvailabilityToggle />
    : <AuthenticatedAgentAvailabilityToggle />;
});

export default AgentAvailabilityToggle;
