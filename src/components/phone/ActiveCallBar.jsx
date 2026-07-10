import { memo } from "react";
import { Mic, MicOff, Pause, Phone, PhoneOff, Play } from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import { contactDisplayName } from "../../hooks/useContacts";
import { formatTime } from "../SharedUI";
import { useCallDuration } from "./useCallDuration";

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "UNKNOWN";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

// Slim persistent bar, top-right below the nav, while a call is
// connected or ringing out. Click anywhere except a control button to
// expand into the full dropdown.
const ActiveCallBar = memo(function ActiveCallBar({ onExpand }) {
  const inbound = useInboundCall();
  const call = inbound?.activeCall || inbound?.dialingCall;
  const ringing = !inbound?.activeCall && Boolean(inbound?.dialingCall);
  const elapsedMs = useCallDuration(inbound?.connectedAt);
  if (!call) return null;

  const { params } = call;
  const displayName =
    (inbound.contact && contactDisplayName(inbound.contact)) ||
    params.callerName ||
    fmtPhone(params.callerPhone);

  return (
    <div
      className="phone-active-bar"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onExpand?.();
      }}
    >
      <div className="phone-active-bar__copy">
        <span className="phone-active-bar__name">{displayName.toUpperCase()}</span>
        <span className="phone-active-bar__timer">
          {ringing ? (
            "RINGING..."
          ) : (
            <>
              <span className="phone-active-bar__rec-dot" aria-hidden="true" />
              {formatTime(elapsedMs)}
            </>
          )}
        </span>
      </div>
      <div className="phone-active-bar__controls">
        {!ringing ? (
          <>
            <button
              type="button"
              className={`phone-active-bar__btn${inbound.isMuted ? " is-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                inbound.toggleMute();
              }}
              title={inbound.isMuted ? "Unmute" : "Mute"}
              aria-label={inbound.isMuted ? "Unmute" : "Mute"}
            >
              {inbound.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              type="button"
              className={`phone-active-bar__btn${inbound.isHeld ? " is-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                inbound.toggleHold();
              }}
              title={inbound.isHeld ? "Resume" : "Hold"}
              aria-label={inbound.isHeld ? "Resume" : "Hold"}
            >
              {inbound.isHeld ? <Play size={14} /> : <Pause size={14} />}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="phone-active-bar__btn phone-active-bar__btn--end"
          onClick={(event) => {
            event.stopPropagation();
            inbound.hangUp();
          }}
          title={ringing ? "Cancel" : "End call"}
          aria-label={ringing ? "Cancel call" : "End call"}
        >
          {ringing ? <Phone size={14} /> : <PhoneOff size={14} />}
        </button>
      </div>
    </div>
  );
});

export default ActiveCallBar;
