import { callContinuity } from "../lib/callContinuity.js";
import { debugLog } from "../lib/debugLog.js";
import { createVoiceTelemetry } from "../lib/voiceTelemetry.js";
import { checkOutbound, canonicalOutbound } from "../lib/outboundApi";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppAuth } from "./AuthContext";
import { useTenantConfig } from "../hooks/useTenantConfig";
import { useAvailability } from "./AvailabilityContext";
import {
  isAuthDisabled,
  readLocalAgentId,
  resolveAgentId,
  resolveRequestingAgentUuid,
} from "../lib/agentIdentity";
import { createAgentPhoneConnection } from "../lib/agentPhoneConnection";
import { publishSms } from "../lib/smsEvents";
import { publishAudioLevel } from "../stores/audioLevelStore";
import { updateTranscriptionHealth, transcriptionHealthError, transcriptionHealthForCall } from "../lib/transcriptionHealth";
import { updateLiveTranscript } from "../lib/liveTranscript.js";

// Inbound softphone state: Twilio Voice SDK device registration, the
// incoming-call banner payload, and the server-transcribed AGENT/CUSTOMER
// transcript delivered over the telephony /agent WebSocket. Feature
// flagged; when disabled the provider renders children untouched and
// useInboundCall() returns null.

export const INBOUND_CALLS_ENABLED =
  import.meta.env.VITE_INBOUND_CALLS_ENABLED === "true";
const TELEPHONY_BASE_URL = (import.meta.env.VITE_TELEPHONY_BASE_URL || "").replace(/\/$/, "");
const WS_TOKEN_REFRESH_MS = 10 * 60 * 1000;
const WS_TOKEN_REFRESH_RETRY_MS = 30 * 1000;

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
  const availability = useAvailability();
  const reportPhoneReady = availability?.setPhoneReady;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const reportVoiceEvent = useMemo(() => createVoiceTelemetry({ baseUrl: TELEPHONY_BASE_URL,
    agentId, getToken: () => getTokenRef.current() }), [agentId]);
  // Token getter rotation or availability refresh must not destroy a live SDK device.
  const hydratedIdentityRef = useRef(null);
  if (identityReady && availability?.isHydrated) hydratedIdentityRef.current = agentId;
  const registrationReady = identityReady && hydratedIdentityRef.current === agentId;

  const [deviceStatus, setDeviceStatus] = useState("offline"); // offline | registering | registered | error
  const [incomingCall, setIncomingCall] = useState(null); // { call, params }
  const [activeCall, setActiveCall] = useState(null); // { call, params }
  const [dialingCall, setDialingCall] = useState(null); // { call, params } while an outbound call is ringing
  const [remoteStream, setRemoteStream] = useState(null); // customer audio from the Twilio call
  const [contact, setContact] = useState(null);
  const [agentTranscript, setAgentTranscript] = useState([]);
  const agentRows = useMemo(() => agentTranscript.filter(entry => entry.isFinal).map(entry => ({
    ...entry, id: entry.segmentId || entry.timestamp, ts: formatClock(entry.timestamp),
  })), [agentTranscript]);
  const agentInterim = useMemo(() => agentTranscript.find(entry => !entry.isFinal) || null, [agentTranscript]);
  const [customerTranscript, setCustomerTranscript] = useState([]);
  const [error, setError] = useState("");
  const [transcriptionHealth, setTranscriptionHealth] = useState({});
  const transcriptionError = transcriptionHealthError(transcriptionHealth);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [connectedAt, setConnectedAt] = useState(null);

  const deviceRef = useRef(null);
  const phoneConnectionRef = useRef(null);
  const phoneReadyRef = useRef(false);
  const tokenBundleRef = useRef(null);
  const callInProgressRef = useRef(false);
  const outboundCallRef = useRef(null);
  const ownedCallRef = useRef(null);
  // A device replaced while a call is ringing or live; destroyed once that call ends.
  const retiredDeviceRef = useRef(null);
  const destroyedDevicesRef = useRef(new WeakSet());
  const deviceIdsRef = useRef(new WeakMap());
  const callDeviceIdsRef = useRef(new WeakMap());
  const deviceSequenceRef = useRef(0);
  const reportCallEvent = useCallback((event, call, details = {}) => {
    // Diagnostic reads can never throw through an SDK event handler.
    try {
      const params = paramsFromCall(call);
      reportVoiceEvent(event, { callSid: params.twilioCallSid || call?.parameters?.CallSid,
        sdkCallSid: call?.parameters?.CallSid, phase: call?.status?.(),
        deviceSequence: callDeviceIdsRef.current.get(call), ...details });
    } catch { /* Preserve the voice connection even if SDK inspection fails. */ }
  }, [reportVoiceEvent]);
  const destroyDevice = useCallback((device, reason) => {
    if (retiredDeviceRef.current === device) retiredDeviceRef.current = null;
    if (destroyedDevicesRef.current.has(device)) return;
    destroyedDevicesRef.current.add(device);
    reportCallEvent('device_destroyed', ownedCallRef.current, { reason, deviceSequence: deviceIdsRef.current.get(device) });
    device.destroy();
  }, [reportCallEvent]);
  // True while a call is ringing, dialing or live. A call the SDK already closed
  // whose terminal event never arrived is finished, not live.
  const callIsLive = useCallback(() => {
    const owned = ownedCallRef.current;
    if (owned?.status?.() === "closed") {
      ownedCallRef.current = null;
      callContinuity.end(owned);
      callInProgressRef.current = false;
      outboundCallRef.current = null;
      setIncomingCall(null);
      setActiveCall(null);
      setDialingCall(null);
      setRemoteStream(null);
      setContact(null);
      setConnectedAt(null);
      setIsMuted(false);
      setIsHeld(false);
      publishAudioLevel("customer", 0, { immediate: true });
    }
    return callInProgressRef.current;
  }, []);
  const destroyRetiredDevice = useCallback(() => {
    if (!retiredDeviceRef.current || callIsLive()) return;
    destroyDevice(retiredDeviceRef.current, 'retired_call_ended');
    retiredDeviceRef.current = null;
  }, [callIsLive, destroyDevice]);

  const fetchTokenBundle = useCallback(async () => {
    const clerkToken = await getTokenRef.current().catch(() => null);
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
  }, [agentId]);

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
    if (["transcription_error", "transcription_health"].includes(message.type)) {
      setTranscriptionHealth(previous => updateTranscriptionHealth(previous, message));
      return;
    }
    if (message.type !== "transcript" || typeof message.text !== "string") return;
    setTranscriptionHealth(previous => updateTranscriptionHealth(previous, message));
    const entry = {
      ...message,
      timestamp: message.timestamp ?? Date.now(),
      isFinal: Boolean(message.isFinal),
    };
    if (message.speaker === "agent") {
      setAgentTranscript(prev => updateLiveTranscript(prev, entry));
      return;
    }
    if (message.speaker === "customer") setCustomerTranscript(prev => updateLiveTranscript(prev, entry));
  }, []);

  const connectAgentSocket = useCallback((bundle) => {
    if (!phoneConnectionRef.current) {
      phoneConnectionRef.current = createAgentPhoneConnection({
        onMessage: handleTranscriptMessage, onPresenceReady: reportPhoneReady,
        refreshBundle: fetchTokenBundle,
      });
    }
    phoneConnectionRef.current.setReady(phoneReadyRef.current);
    phoneConnectionRef.current.start(bundle, fetchTokenBundle);
  }, [handleTranscriptMessage, reportPhoneReady, fetchTokenBundle]);

  // Register the softphone device once identity is resolved.
  useEffect(() => {
    // AvailabilityProvider loads the persisted manual status before the
    // device registers. Registration is connectivity only; it must not
    // promote an offline agent into the routing pool.
    if (
      !registrationReady ||
      !agentId ||
      !TELEPHONY_BASE_URL
    ) return undefined;
    let cancelled = false;
    const deviceIds = deviceIdsRef.current;
    let wsRefreshTimer = null;
    let tokenRefreshInFlight = null;
    const setPhoneReady = (ready) => {
      phoneReadyRef.current = ready;
      phoneConnectionRef.current?.setReady(ready);
    };
    const handlePageHide = () => phoneConnectionRef.current?.stop();
    const handlePageShow = (event) => {
      if (event.persisted && !cancelled && tokenBundleRef.current) {
        void refreshTokens({ reason: "pageshow", device: deviceRef.current });
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    const scheduleWebSocketRefresh = (delay = WS_TOKEN_REFRESH_MS) => {
      if (wsRefreshTimer) window.clearTimeout(wsRefreshTimer);
      wsRefreshTimer = window.setTimeout(() => {
        void refreshTokens({ reason: "proactive" });
      }, delay);
    };

    const refreshTokens = ({ device = null } = {}) => {
      if (tokenRefreshInFlight) return tokenRefreshInFlight;
      tokenRefreshInFlight = (async () => {
        try {
          const fresh = await fetchTokenBundle();
          if (cancelled) return;
          device?.updateToken(fresh.token);
          // start() establishes the replacement socket while the connection
          // helper keeps the old socket alive until presence-ready arrives.
          connectAgentSocket(fresh);
          scheduleWebSocketRefresh();
        } catch {
          if (!cancelled) {
            reportCallEvent('token_refresh_failed', ownedCallRef.current);
            debugLog("context/InboundCallContext.jsx error");
            scheduleWebSocketRefresh(WS_TOKEN_REFRESH_RETRY_MS);
          }
        } finally {
          tokenRefreshInFlight = null;
        }
      })();
      return tokenRefreshInFlight;
    };

    async function register() {
      // A rebuilt device starts clean unless a call is still on the retired one.
      callIsLive();
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
        const deviceSequence = ++deviceSequenceRef.current;
        deviceIds.set(device, deviceSequence);
        reportVoiceEvent('device_created', { deviceSequence });

        device.on("registered", () => {
          reportCallEvent('registered', ownedCallRef.current, { deviceSequence });
          if (cancelled) return;
          setPhoneReady(true);
          setDeviceStatus("registered");
        });
        device.on("unregistered", () => {
          reportCallEvent('unregistered', ownedCallRef.current, { deviceSequence });
          setPhoneReady(false);
          setDeviceStatus("offline");
        });
        device.on("error", (deviceError) => {
          reportCallEvent('device_error', ownedCallRef.current, { errorCode: deviceError?.code, deviceSequence });
          debugLog("[InboundCall] device error");
          setError(deviceError?.message || "Softphone error");
          setPhoneReady(false);
          setDeviceStatus("error");
        });
        device.on("tokenWillExpire", async () => {
          await refreshTokens({ reason: "Twilio", device });
        });
        device.on("incoming", (call) => {
          callDeviceIdsRef.current.set(call, deviceSequence);
          if (ownedCallRef.current === call) return;
          // Only an actual ringing/dialing/live call (including an outbound
          // connect in flight) can be busy. Disposition and availability never
          // gate delivery. Reconcile missed terminal events before deciding.
          if (callIsLive()) { reportCallEvent('incoming_rejected_busy', call); call.reject(); return; }
          callInProgressRef.current = true;
          ownedCallRef.current = call;
          callContinuity.begin(call);
          reportCallEvent('incoming', call);
          const params = paramsFromCall(call);
          setIncomingCall({ call, params });
          const finishCall = () => {
            if (ownedCallRef.current !== call) return;
            ownedCallRef.current = null;
            callContinuity.end(call);
            callInProgressRef.current = false;
            destroyRetiredDevice();
            setIncomingCall(null);
            setActiveCall(null);
            setRemoteStream(null);
            setContact(null);
            setConnectedAt(null);
            setIsMuted(false);
            setIsHeld(false);
            publishAudioLevel("customer", 0, { immediate: true });
          };
          call.on("cancel", () => { reportCallEvent('canceled', call); finishCall(); });
          call.on("reject", () => { reportCallEvent('rejected', call); finishCall(); });
          call.on("error", (callError) => {
            reportCallEvent('call_error', call, { errorCode: callError?.code });
            if (ownedCallRef.current !== call) return;
            setError(callError?.message || "Call failed");
            // Recoverable media/network errors are not a hang-up.
            if (call.status?.() === "closed") finishCall();
          });
          // Customer audio: the caller's voice is the call's remote
          // MediaStream. It can lag the accept event by a beat, so
          // retry briefly until Twilio exposes it.
          call.on("accept", () => {
            reportCallEvent('accepted', call);
            if (ownedCallRef.current !== call) return;
            setConnectedAt(Date.now());
            setIsMuted(false);
            setIsHeld(false);
            let attempts = 0;
            const grabStream = () => {
              if (ownedCallRef.current !== call) return;
              const stream = call.getRemoteStream?.();
              if (stream && stream.getAudioTracks().length) {
                debugLog("context/InboundCallContext.jsx info");
                setRemoteStream(stream);
                return;
              }
              attempts += 1;
              if (attempts < 20) {
                window.setTimeout(grabStream, 250);
              } else {
                const message =
                  "Remote customer audio was not exposed by Twilio after 5 seconds; customer transcription cannot start.";
                debugLog("[InboundCall]");
                reportCallEvent('remote_audio_unavailable', call);
                setError(message);
              }
            };
            grabStream();
          });
          call.on("disconnect", () => { reportCallEvent('disconnected', call); finishCall(); });
        });

        deviceRef.current = device;
        await device.register();
        if (cancelled) {
          // Cleanup may already have retired this device to preserve a call
          // while register() was still resolving. Do not destroy it here.
          if (retiredDeviceRef.current === device && callIsLive()) {
            reportCallEvent('registration_canceled', ownedCallRef.current, { reason: 'live_device_preserved', deviceSequence });
            return;
          }
          destroyDevice(device, 'registration_canceled_idle');
          return;
        }
        connectAgentSocket(bundle);
        scheduleWebSocketRefresh();
      } catch (err) {
        if (cancelled) return;
        reportCallEvent('registration_failed', ownedCallRef.current, { errorCode: err?.code });
        debugLog("[InboundCall] registration failed");
        setError(err?.message || "Softphone registration failed");
        setDeviceStatus("error");
      }
    }

    register();

    return () => {
      cancelled = true;
      if (wsRefreshTimer) window.clearTimeout(wsRefreshTimer);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      phoneReadyRef.current = false;
      phoneConnectionRef.current?.stop();
      phoneConnectionRef.current = null;
      const device = deviceRef.current;
      deviceRef.current = null;
      if (device) {
        // destroy() rejects ringing calls and hangs up live ones. A call already
        // on a retired device cannot be on this one.
        if (callIsLive() && !retiredDeviceRef.current) {
          retiredDeviceRef.current = device;
          reportCallEvent('device_retired', ownedCallRef.current, { reason: 'effect_cleanup_live', deviceSequence: deviceIds.get(device) });
        } else destroyDevice(device, retiredDeviceRef.current ? 'effect_cleanup_unused_device' : 'effect_cleanup_idle');
      }
      if (!retiredDeviceRef.current) {
        ownedCallRef.current = null;
        callInProgressRef.current = false;
      }
      setDeviceStatus("offline");
    };
  }, [registrationReady, agentId, fetchTokenBundle, connectAgentSocket, destroyRetiredDevice, callIsLive, destroyDevice, reportCallEvent, reportVoiceEvent]);

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
    if (!incomingCall || ownedCallRef.current !== incomingCall.call) return;
    setAgentTranscript([]);
    setCustomerTranscript([]);
    // Streams start while the agent is ringing. Preserve a failure already
    // reported for this call; discard health left over from another call.
    setTranscriptionHealth(previous => transcriptionHealthForCall(previous, incomingCall.params?.inboundCallId));
    reportCallEvent('accept_requested', incomingCall.call, { reason: 'agent_action' });
    incomingCall.call.accept();
    setActiveCall(incomingCall);
    setIncomingCall(null);
  }, [incomingCall, reportCallEvent]);

  const declineCall = useCallback(() => {
    if (!incomingCall || ownedCallRef.current !== incomingCall.call) return;
    ownedCallRef.current = null;
    callContinuity.end(incomingCall.call);
    reportCallEvent('declined', incomingCall.call, { reason: 'agent_action' });
    incomingCall.call.reject();
    callInProgressRef.current = false;
    destroyRetiredDevice();
    setIncomingCall(null);
  }, [incomingCall, destroyRetiredDevice, reportCallEvent]);

  const hangUp = useCallback(() => {
    reportCallEvent('end_requested', activeCall?.call || dialingCall?.call, { reason: 'agent_action' });
    activeCall?.call?.disconnect();
    dialingCall?.call?.disconnect();
  }, [activeCall, dialingCall, reportCallEvent]);

  // Outbound dial: global dial pad and contact click-to-call both land
  // here. The Voice SDK Device.connect() request is signed and routed
  // to the telephony server's /api/voice/outbound TwiML app; once the
  // callee answers, the call's own "accept" event promotes it to
  // activeCall so the cockpit transition (App.jsx) fires exactly like
  // an accepted inbound call.
  const makeCall = useCallback(
    async ({ phoneNumber, contactId, contactName }) => {
      if (!deviceRef.current) throw new Error("Softphone not registered yet");
      if (callInProgressRef.current) throw new Error("Finish the current call before dialing");
      callInProgressRef.current = true;
      const dialingClaim = {};
      callContinuity.begin(dialingClaim);
      setError("");
      setAgentTranscript([]);
      setCustomerTranscript([]);
      setTranscriptionHealth({});

      const params = {
        callerName: contactName || "",
        callerPhone: phoneNumber,
        contactId: "",
        direction: "outbound",
      };

      let call;
      let dialingDevice;
      try {
        const policy = await checkOutbound(getToken, phoneNumber);
        if (policy.blocked) throw new Error("Do Not Call");
        dialingDevice = deviceRef.current;
        call = await dialingDevice.connect({
          params: { PhoneNumber: phoneNumber, ContactId: contactId || "" },
        });
      } catch (err) {
        callContinuity.end(dialingClaim);
        callInProgressRef.current = false;
        destroyRetiredDevice();
        throw err;
      }
      outboundCallRef.current = call;
      callDeviceIdsRef.current.set(call, deviceIdsRef.current.get(dialingDevice));
      ownedCallRef.current = call;
      callContinuity.replace(dialingClaim, call);
      setDialingCall({ call, params });

      let identityRetryTimer = null;
      let identityRetryDelay = 1000;
      const hydrateCallIdentity = async () => {
        if (ownedCallRef.current !== call) return;
        try {
          const canonical = await canonicalOutbound(getTokenRef.current, call.parameters.CallSid, {
            isCurrent: () => ownedCallRef.current === call,
          });
          if (ownedCallRef.current !== call) return;
          params.contactId = canonical.contactId;
          params.attemptId = canonical.attemptId;
          params.callerPhone = canonical.phoneNumber;
          params.callerName = "";
          setActiveCall(current => current?.call === call ? {...current, params: {...params}} : current);
        } catch {
          if (ownedCallRef.current !== call) return;
          setError("Call connected. Details will sync when your session recovers.");
          identityRetryTimer = window.setTimeout(() => void hydrateCallIdentity(), identityRetryDelay);
          identityRetryDelay = Math.min(60000, identityRetryDelay * 2);
        }
      };
      call.on("accept", () => {
        reportCallEvent('accepted', call);
        if (ownedCallRef.current !== call) return;
        // The audio call is already connected. Metadata/auth failures must never
        // hang it up or hide its controls; attribution stays empty until verified.
        void hydrateCallIdentity();
        setActiveCall({ call, params });
        setDialingCall(null);
        setConnectedAt(Date.now());
        setIsMuted(false);
        setIsHeld(false);
        let attempts = 0;
        const grabStream = () => {
          if (ownedCallRef.current !== call) return;
          const stream = call.getRemoteStream?.();
          if (stream && stream.getAudioTracks().length) {
            setRemoteStream(stream);
            return;
          }
          attempts += 1;
          if (attempts < 20) window.setTimeout(grabStream, 250);
          else {
            const message =
              "Remote customer audio was not exposed by Twilio after 5 seconds; customer transcription cannot start.";
            debugLog("[OutboundCall]");
            setError(message);
          }
        };
        grabStream();
      });
      const finishCall = () => {
        if (ownedCallRef.current !== call) return;
        ownedCallRef.current = null;
        if (identityRetryTimer !== null) window.clearTimeout(identityRetryTimer);
        callContinuity.end(call);
        outboundCallRef.current = null;
        setActiveCall(null);
        setDialingCall(null);
        setRemoteStream(null);
        setContact(null);
        setConnectedAt(null);
        setIsMuted(false);
        setIsHeld(false);
        callInProgressRef.current = false;
        destroyRetiredDevice();
        publishAudioLevel("customer", 0, { immediate: true });
      };
      call.on("disconnect", () => { reportCallEvent('disconnected', call); finishCall(); });
      call.on("cancel", () => { reportCallEvent('canceled', call); finishCall(); });
      call.on("reject", () => { reportCallEvent('rejected', call); finishCall(); });
      call.on("error", (callError) => {
        reportCallEvent('call_error', call, { errorCode: callError?.code });
        if (ownedCallRef.current !== call) return;
        debugLog("[OutboundCall] call error");
        setError(callError?.message || "Call failed");
        if (call.status?.() === "closed") finishCall();
      });

      return call;
    },
    [getToken, destroyRetiredDevice, reportCallEvent]
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

  const hasCallInProgress = useCallback(() => callInProgressRef.current, []);

  const value = useMemo(
    () => ({
      enabled: true,
      agentId,
      deviceStatus,
      error,
      transcriptionError,
      transcriptionHealth,
      incomingCall,
      activeCall,
      dialingCall,
      hasCallInProgress,
      remoteStream,
      contact,
      agentRows,
      agentInterim,
      customerTranscript,
      isMuted,
      isHeld,
      connectedAt,
      acceptCall,
      declineCall,
      hangUp,
      requestingAgentId,
      makeCall,
      sendDigits,
      toggleMute,
      toggleHold,
    }),
    [
      agentId,
      deviceStatus,
      error,
      transcriptionError,
      transcriptionHealth,
      incomingCall,
      activeCall,
      dialingCall,
      hasCallInProgress,
      remoteStream,
      contact,
      agentRows,
      agentInterim,
      customerTranscript,
      isMuted,
      isHeld,
      connectedAt,
      acceptCall,
      declineCall,
      hangUp,
      requestingAgentId,
      makeCall,
      sendDigits,
      toggleMute,
      toggleHold,
    ]
  );

  return <InboundCallContext.Provider value={value}>{children}</InboundCallContext.Provider>;
}

function AuthedInboundCallProvider({ children }) {
  const { user, identityLoaded: isLoaded, callProtected } = useAppAuth();
  const { agents } = useTenantConfig();
  const callAgentId = useRef(null);
  if (!callProtected || !callAgentId.current) callAgentId.current = resolveAgentId(user, agents);
  return (
    <InboundCallProviderCore agentId={callAgentId.current} identityReady={isLoaded}>
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
