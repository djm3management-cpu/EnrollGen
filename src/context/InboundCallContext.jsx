import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUser } from "@clerk/clerk-react";
import { useAppAuth } from "./AuthContext";
import { useTenantConfig } from "../hooks/useTenantConfig";
import {
  isAuthDisabled,
  readLocalAgentId,
  resolveAgentId,
  setAvailabilityStatus,
} from "../lib/agentIdentity";

// Inbound softphone state: Twilio Voice SDK device registration, the
// incoming-call banner payload, and the server-transcribed AGENT/CUSTOMER
// transcript delivered over the telephony /agent WebSocket. Feature
// flagged; when disabled the provider renders children untouched and
// useInboundCall() returns null.

export const INBOUND_CALLS_ENABLED =
  import.meta.env.VITE_INBOUND_CALLS_ENABLED === "true";
const TELEPHONY_BASE_URL = (import.meta.env.VITE_TELEPHONY_BASE_URL || "").replace(/\/$/, "");

const InboundCallContext = createContext(null);

export function useInboundCall() {
  return useContext(InboundCallContext);
}

function paramsFromCall(call) {
  const raw = call?.customParameters;
  const params = {};
  if (raw && typeof raw.forEach === "function") {
    raw.forEach((value, key) => {
      params[key] = value;
    });
  }
  return params;
}

function formatClock(timestamp) {
  const d = new Date(timestamp);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function InboundCallProviderCore({ agentId, identityReady, children }) {
  const { getToken } = useAppAuth();
  const { supabaseClient } = useTenantConfig();

  const [deviceStatus, setDeviceStatus] = useState("offline"); // offline | registering | registered | error
  const [incomingCall, setIncomingCall] = useState(null); // { call, params }
  const [activeCall, setActiveCall] = useState(null); // { call, params }
  const [contact, setContact] = useState(null);
  const [agentRows, setAgentRows] = useState([]);
  const [customerTranscript, setCustomerTranscript] = useState([]);
  const [error, setError] = useState("");

  const deviceRef = useRef(null);
  const wsRef = useRef(null);
  const tokenBundleRef = useRef(null);

  const fetchTokenBundle = useCallback(async () => {
    const clerkToken = await getToken().catch(() => null);
    const response = await fetch(`${TELEPHONY_BASE_URL}/api/voice/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}),
      },
      body: JSON.stringify({ agent_id: agentId }),
    });
    if (!response.ok) {
      throw new Error(`Voice token request failed (${response.status})`);
    }
    const bundle = await response.json();
    tokenBundleRef.current = bundle;
    return bundle;
  }, [getToken, agentId]);

  const handleTranscriptMessage = useCallback((message) => {
    if (message.type !== "transcript" || !message.text) return;
    if (message.speaker === "agent") {
      if (!message.isFinal) return;
      setAgentRows((prev) => [
        ...prev,
        {
          id: message.timestamp || Date.now(),
          ts: formatClock(message.timestamp || Date.now()),
          timestamp: message.timestamp || Date.now(),
          text: message.text,
        },
      ]);
      return;
    }
    setCustomerTranscript((prev) => {
      const entry = {
        speaker: "customer",
        text: message.text,
        timestamp: message.timestamp || Date.now(),
        isFinal: Boolean(message.isFinal),
      };
      const last = prev[prev.length - 1];
      if (last && !last.isFinal) {
        return [...prev.slice(0, -1), entry];
      }
      return [...prev, entry];
    });
  }, []);

  const connectAgentSocket = useCallback((bundle) => {
    if (!bundle?.ws_url || !bundle?.ws_token) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = new WebSocket(`${bundle.ws_url}?token=${encodeURIComponent(bundle.ws_token)}`);
    ws.onmessage = (event) => {
      try {
        handleTranscriptMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => {
      console.error("[InboundCall] agent socket error");
    };
    wsRef.current = ws;
  }, [handleTranscriptMessage]);

  // Register the softphone device once identity is resolved.
  useEffect(() => {
    if (!identityReady || !agentId || !TELEPHONY_BASE_URL) return undefined;
    let cancelled = false;

    async function register() {
      setDeviceStatus("registering");
      setError("");
      try {
        const [{ Device }, bundle] = await Promise.all([
          import("@twilio/voice-sdk"),
          fetchTokenBundle(),
        ]);
        if (cancelled) return;

        const device = new Device(bundle.token, {
          codecPreferences: ["opus", "pcmu"],
        });

        device.on("registered", () => {
          setDeviceStatus("registered");
          setAvailabilityStatus(agentId, "available");
        });
        device.on("error", (deviceError) => {
          console.error("[InboundCall] device error:", deviceError);
          setError(deviceError?.message || "Softphone error");
          setDeviceStatus("error");
        });
        device.on("tokenWillExpire", async () => {
          try {
            const fresh = await fetchTokenBundle();
            device.updateToken(fresh.token);
            connectAgentSocket(fresh);
          } catch (err) {
            console.error("[InboundCall] token refresh failed:", err);
          }
        });
        device.on("incoming", (call) => {
          const params = paramsFromCall(call);
          setIncomingCall({ call, params });
          call.on("cancel", () => setIncomingCall(null));
          call.on("disconnect", () => {
            setActiveCall(null);
            setContact(null);
            setAvailabilityStatus(agentId, "available");
          });
        });

        await device.register();
        deviceRef.current = device;
        connectAgentSocket(bundle);
      } catch (err) {
        if (cancelled) return;
        console.error("[InboundCall] registration failed:", err);
        setError(err?.message || "Softphone registration failed");
        setDeviceStatus("error");
      }
    }

    register();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
      setDeviceStatus("offline");
    };
  }, [identityReady, agentId, fetchTokenBundle, connectAgentSocket]);

  // Hydrate the contact record for the ringing/active call.
  const contactId = incomingCall?.params?.contactId || activeCall?.params?.contactId || null;
  useEffect(() => {
    if (!contactId || !supabaseClient) {
      setContact(null);
      return;
    }
    let cancelled = false;
    supabaseClient
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setContact(data || null);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, supabaseClient]);

  const acceptCall = useCallback(() => {
    if (!incomingCall) return;
    setAgentRows([]);
    setCustomerTranscript([]);
    incomingCall.call.accept();
    setActiveCall(incomingCall);
    setIncomingCall(null);
    setAvailabilityStatus(agentId, "busy");
  }, [incomingCall, agentId]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    incomingCall.call.reject();
    setIncomingCall(null);
  }, [incomingCall]);

  const hangUp = useCallback(() => {
    activeCall?.call?.disconnect();
  }, [activeCall]);

  const value = useMemo(
    () => ({
      enabled: true,
      agentId,
      deviceStatus,
      error,
      incomingCall,
      activeCall,
      contact,
      agentRows,
      customerTranscript,
      acceptCall,
      declineCall,
      hangUp,
    }),
    [
      agentId,
      deviceStatus,
      error,
      incomingCall,
      activeCall,
      contact,
      agentRows,
      customerTranscript,
      acceptCall,
      declineCall,
      hangUp,
    ]
  );

  return <InboundCallContext.Provider value={value}>{children}</InboundCallContext.Provider>;
}

function AuthedInboundCallProvider({ children }) {
  const { user, isLoaded } = useUser();
  return (
    <InboundCallProviderCore agentId={resolveAgentId(user)} identityReady={isLoaded}>
      {children}
    </InboundCallProviderCore>
  );
}

function LocalInboundCallProvider({ children }) {
  return (
    <InboundCallProviderCore agentId={readLocalAgentId()} identityReady>
      {children}
    </InboundCallProviderCore>
  );
}

export function InboundCallProvider({ children }) {
  if (!INBOUND_CALLS_ENABLED) {
    return children;
  }
  return isAuthDisabled() ? (
    <LocalInboundCallProvider>{children}</LocalInboundCallProvider>
  ) : (
    <AuthedInboundCallProvider>{children}</AuthedInboundCallProvider>
  );
}
