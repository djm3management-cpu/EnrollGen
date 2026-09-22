import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createAvailabilityIntent } from "../lib/availabilityIntent";
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
  const [snapshot, setSnapshot] = useState({
    status: "offline", statusSince: null, pendingStatus: null, isSaving: false, error: "",
  });
  const { status, statusSince, pendingStatus, isSaving, error } = snapshot;
  const [isHydrated, setIsHydrated] = useState(false);
  const intentRef = useRef(null);

  useEffect(() => {
    setIsHydrated(false);
    setSnapshot({ status: "offline", statusSince: null, pendingStatus: null, isSaving: false, error: "" });
    const controller = new AbortController();
    const intent = createAvailabilityIntent({
      onChange: setSnapshot,
      async write(nextStatus) {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/set-availability`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({ agent_id: agentId, status: nextStatus }),
        });
        if (!response.ok) throw new Error(buildRequestError(response, "Availability update failed"));
        const payload = await response.json().catch(() => ({}));
        return { status: extractStatus(payload) || nextStatus, statusSince: extractSince(payload) || new Date() };
      },
    });
    const binding = { agentId, intent };
    intentRef.current = binding;

    async function loadAvailability() {
      if (!identityLoaded) return;
      try {
        if (!API_KEY || !agentId) return;
        const response = await fetch(
          `${FUNCTIONS_BASE_URL}/get-availability?agent_id=${encodeURIComponent(agentId)}`,
          { headers: { "x-api-key": API_KEY }, signal: controller.signal }
        );
        if (!response.ok) throw new Error(buildRequestError(response, "Availability lookup failed"));
        const payload = await response.json().catch(() => ({}));
        intent.hydrate({ status: extractStatus(payload) || "offline", statusSince: extractSince(payload) || new Date() });
      } catch (err) {
        if (!controller.signal.aborted) intent.hydrate({ error: err?.message || "Availability lookup failed" });
      } finally {
        if (!controller.signal.aborted) setIsHydrated(true);
      }
    }
    void loadAvailability();
    return () => {
      controller.abort();
      intent.dispose();
      if (intentRef.current === binding) intentRef.current = null;
    };
  }, [agentId, identityLoaded]);

  const changeStatus = useCallback((nextStatus) => {
    const binding = intentRef.current;
    if (API_KEY && agentId && identityLoaded && isHydrated && binding?.agentId === agentId) {
      binding.intent.select(nextStatus);
    }
  }, [agentId, identityLoaded, isHydrated]);

  // Bound to the identity so a late callback from an old phone cannot release
  // another agent's queued request.
  const setPhoneReady = useCallback((ready) => {
    const binding = intentRef.current;
    if (binding?.agentId === agentId) binding.intent.setPhoneReady(ready);
  }, [agentId]);

  const value = useMemo(
    () => ({
      agentId,
      identityLoaded,
      hasApiKey: Boolean(API_KEY),
      status,
      statusSince,
      isHydrated,
      isSaving,
      pendingStatus,
      setPhoneReady,
      error,
      changeStatus,
    }),
    [agentId, identityLoaded, status, statusSince, isHydrated, isSaving, pendingStatus, error, changeStatus, setPhoneReady]
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
