import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUser } from "@clerk/clerk-react";
import { useTenantConfig } from "../hooks/useTenantConfig";
import {
  AVAILABILITY_API_KEY as API_KEY,
  AVAILABILITY_FUNCTIONS_BASE_URL as FUNCTIONS_BASE_URL,
  isAuthDisabled,
  readLocalAgentId,
  resolveAgentId,
} from "../lib/agentIdentity";

// Shared agent availability state, lifted out of AgentAvailabilityToggle
// so the cockpit toggle and the top-bar status strip stay in sync.

const VALID_STATUSES = ["available", "busy", "offline"];

const AvailabilityContext = createContext(null);

export function useAvailability() {
  return useContext(AvailabilityContext);
}

function getTrimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeStatus(value) {
  const normalized = getTrimmedString(value).toLowerCase();
  return VALID_STATUSES.includes(normalized) ? normalized : null;
}

function parseSinceValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function extractStatus(payload) {
  const candidates = [
    payload?.status,
    payload?.availability?.status,
    payload?.data?.status,
    payload?.current_status,
    payload?.currentStatus,
  ];
  for (const value of candidates) {
    const normalized = normalizeStatus(value);
    if (normalized) return normalized;
  }
  return null;
}

export function extractSince(payload) {
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
    if (parsed) return parsed;
  }
  return null;
}

function buildRequestError(response, fallbackMessage) {
  return `${fallbackMessage} (${response.status})`;
}

function AvailabilityProviderCore({ agentId, identityLoaded, children }) {
  const [status, setStatus] = useState("offline");
  const [statusSince, setStatusSince] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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
            headers: { "x-api-key": API_KEY },
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error(buildRequestError(response, "Availability lookup failed"));
        }
        const payload = await response.json().catch(() => ({}));
        setStatus(extractStatus(payload) || "offline");
        setStatusSince(extractSince(payload) || new Date());
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("[Availability] GET failed:", err);
        setError(err?.message || "Availability lookup failed");
      } finally {
        setIsHydrated(true);
      }
    }

    loadAvailability();
    return () => controller.abort();
  }, [agentId, identityLoaded]);

  const changeStatus = useCallback(
    async (nextStatus) => {
      if (!API_KEY || !agentId || isSaving || nextStatus === status) {
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
          body: JSON.stringify({ agent_id: agentId, status: nextStatus }),
        });
        if (!response.ok) {
          throw new Error(buildRequestError(response, "Availability update failed"));
        }
        const payload = await response.json().catch(() => ({}));
        setStatus(extractStatus(payload) || nextStatus);
        setStatusSince(extractSince(payload) || nextSince);
      } catch (err) {
        console.error("[Availability] POST failed:", err);
        setError(err?.message || "Availability update failed");
        setStatus(previousStatus);
        setStatusSince(previousSince);
      } finally {
        setIsSaving(false);
      }
    },
    [agentId, isSaving, status, statusSince]
  );

  const value = useMemo(
    () => ({
      agentId,
      identityLoaded,
      hasApiKey: Boolean(API_KEY),
      status,
      statusSince,
      isHydrated,
      isSaving,
      error,
      changeStatus,
    }),
    [agentId, identityLoaded, status, statusSince, isHydrated, isSaving, error, changeStatus]
  );

  return <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>;
}

function AuthedAvailabilityProvider({ children }) {
  const { user, isLoaded } = useUser();
  const { agents } = useTenantConfig();
  return (
    <AvailabilityProviderCore agentId={resolveAgentId(user, agents)} identityLoaded={isLoaded}>
      {children}
    </AvailabilityProviderCore>
  );
}

function LocalAvailabilityProvider({ children }) {
  return (
    <AvailabilityProviderCore agentId={readLocalAgentId()} identityLoaded>
      {children}
    </AvailabilityProviderCore>
  );
}

export function AvailabilityProvider({ children }) {
  return isAuthDisabled() ? (
    <LocalAvailabilityProvider>{children}</LocalAvailabilityProvider>
  ) : (
    <AuthedAvailabilityProvider>{children}</AuthedAvailabilityProvider>
  );
}
