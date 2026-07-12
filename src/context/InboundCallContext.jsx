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
  resolveRequestingAgentUuid,
  setAvailabilityStatus,
} from "../lib/agentIdentity";
import { publishSms } from "../lib/smsEvents";
import { publishAudioLevel } from "../stores/audioLevelStore";

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
  const { supabaseClient, agents } = useTenantConfig();
  const requestingAgentId = resolveRequestingAgentUuid(agents, agentId);

  const [deviceStatus, setDeviceStatus] = useState("offline"); // offline | registering | registered | error
  const [incomingCall, setIncomingCall] = useState(null); // { call, params }
  const [activeCall, setActiveCall] = useState(null); // { call, params }
  const [dialingCall, setDialingCall] = useState(null); // { call, params } while an outbound call is ringing
  const [remoteStream, setRemoteStream] = useState(null); // customer audio from the Twilio call
  const [contact, setContact] = useState(null);
  const [agentRows, setAgentRows] = useState([]);
  const [customerTranscript, setCustomerTranscript] = useState([]);
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [connectedAt, setConnectedAt] = useState(null);

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
    if (message.type === "sms") {
      publishSms(message);
      return;
    }
    if (message.type === "audio_level") {
      if (message.speaker === "customer") {
        publishAudioLevel("customer", message.level);
      }
      return;
    }
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
          // Customer audio: the caller's voice is the call's remote
          // MediaStream. It can lag the accept event by a beat, so
          // retry briefly until Twilio exposes it.
          call.on("accept", () => {
            setConnectedAt(Date.now());
            setIsMuted(false);
            setIsHeld(false);
            let attempts = 0;
            const grabStream = () => {
              const stream = call.getRemoteStream?.();
              if (stream && stream.getAudioTracks().length) {
                console.info(
                  `[InboundCall] remote stream ready after ${attempts * 250}ms`
                );
                setRemoteStream(stream);
                return;
              }
              attempts += 1;
              if (attempts < 20) {
                window.setTimeout(grabStream, 250);
              } else {
                console.warn(
                  "[InboundCall] remote stream never became available; customer transcription will not start"
                );
              }
            };
            grabStream();
          });
          call.on("disconnect", () => {
            setActiveCall(null);
            setRemoteStream(null);
            setContact(null);
            setConnectedAt(null);
            setIsMuted(false);
            setIsHeld(false);
            setAvailabilityStatus(agentId, "available");
            publishAudioLevel("customer", 0, { immediate: true });
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

  // Hydrate the contact record for the ringing/active call. Full PII
  // (name/phone/email/etc) is read via decrypt_pii — the agent needs
  // to see who's calling, so it isn't gated behind a manual reveal
  // click like the CRM screens, but it's still permission-checked and
  // logged (action='view') same as any other decrypt.
  const contactId = incomingCall?.params?.contactId || activeCall?.params?.contactId || null;
  useEffect(() => {
    if (!contactId || !supabaseClient) {
      setContact(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: safeContact } = await supabaseClient
        .from("contacts")
        .select(
          "id, tenant_id, status, source, assigned_agent_id, county, state, zip, medicare_parts, current_carrier, current_plan, do_not_call, ghl_contact_id, first_initial, last_initial, phone_last4, email_set, dob_set, created_at, updated_at"
        )
        .eq("id", contactId)
        .maybeSingle();
      if (cancelled || !safeContact) {
        if (!cancelled) setContact(safeContact || null);
        return;
      }
      let piiFields = {};
      if (requestingAgentId) {
        const { data } = await supabaseClient.rpc("decrypt_pii", {
          p_contact_id: contactId,
          p_requesting_agent_id: requestingAgentId,
          p_action: "view",
        });
        piiFields = data || {};
      }
      if (!cancelled) setContact({ ...safeContact, ...piiFields });
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, supabaseClient, requestingAgentId]);

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
    dialingCall?.call?.disconnect();
  }, [activeCall, dialingCall]);

  // Outbound dial: global dial pad and contact click-to-call both land
  // here. The Voice SDK Device.connect() request is signed and routed
  // to the telephony server's /api/voice/outbound TwiML app; once the
  // callee answers, the call's own "accept" event promotes it to
  // activeCall so the cockpit transition (App.jsx) fires exactly like
  // an accepted inbound call.
  const makeCall = useCallback(
    async ({ phoneNumber, contactId, contactName }) => {
      if (!deviceRef.current) throw new Error("Softphone not registered yet");
      setError("");
      setAgentRows([]);
      setCustomerTranscript([]);

      const params = {
        callerName: contactName || "",
        callerPhone: phoneNumber,
        contactId: contactId || "",
        direction: "outbound",
      };

      const call = await deviceRef.current.connect({
        params: { PhoneNumber: phoneNumber, ContactId: contactId || "" },
      });
      setDialingCall({ call, params });

      call.on("accept", () => {
        setActiveCall({ call, params });
        setDialingCall(null);
        setConnectedAt(Date.now());
        setIsMuted(false);
        setIsHeld(false);
        setAvailabilityStatus(agentId, "busy");
        let attempts = 0;
        const grabStream = () => {
          const stream = call.getRemoteStream?.();
          if (stream && stream.getAudioTracks().length) {
            setRemoteStream(stream);
            return;
          }
          attempts += 1;
          if (attempts < 20) window.setTimeout(grabStream, 250);
        };
        grabStream();
      });
      call.on("disconnect", () => {
        setActiveCall(null);
        setDialingCall(null);
        setRemoteStream(null);
        setContact(null);
        setConnectedAt(null);
        setIsMuted(false);
        setIsHeld(false);
        setAvailabilityStatus(agentId, "available");
        publishAudioLevel("customer", 0, { immediate: true });
      });
      call.on("cancel", () => setDialingCall(null));
      call.on("reject", () => setDialingCall(null));
      call.on("error", (callError) => {
        console.error("[OutboundCall] call error:", callError);
        setError(callError?.message || "Call failed");
        setDialingCall(null);
      });

      return call;
    },
    [agentId]
  );

  const sendDigits = useCallback(
    (digits) => {
      activeCall?.call?.sendDigits(digits);
    },
    [activeCall]
  );

  // Real mic mute via the Voice SDK. Hold has no server-side redirect
  // built (that needs a Twilio REST call.update TwiML swap), so it's
  // approximated as its own mute flag: it silences the agent's mic the
  // same way, but is tracked separately so the UI can show a distinct
  // "on hold" state instead of just "muted".
  const toggleMute = useCallback(() => {
    if (!activeCall?.call) return;
    const next = !isMuted;
    activeCall.call.mute(next);
    setIsMuted(next);
  }, [activeCall, isMuted]);

  const toggleHold = useCallback(() => {
    if (!activeCall?.call) return;
    const next = !isHeld;
    activeCall.call.mute(next || isMuted);
    setIsHeld(next);
  }, [activeCall, isHeld, isMuted]);

  const value = useMemo(
    () => ({
      enabled: true,
      agentId,
      deviceStatus,
      error,
      incomingCall,
      activeCall,
      dialingCall,
      remoteStream,
      contact,
      agentRows,
      customerTranscript,
      isMuted,
      isHeld,
      connectedAt,
      acceptCall,
      declineCall,
      hangUp,
      makeCall,
      sendDigits,
      toggleMute,
      toggleHold,
    }),
    [
      agentId,
      deviceStatus,
      error,
      incomingCall,
      activeCall,
      dialingCall,
      remoteStream,
      contact,
      agentRows,
      customerTranscript,
      isMuted,
      isHeld,
      connectedAt,
      acceptCall,
      declineCall,
      hangUp,
      makeCall,
      sendDigits,
      toggleMute,
      toggleHold,
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
