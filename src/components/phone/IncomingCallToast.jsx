import { memo } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import { contactDisplayName } from "../../hooks/useContacts";

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "UNKNOWN";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

// Compact toast/pill, top-right below the nav, for a ringing inbound
// call. Independent of the dropdown's open/closed state.
const IncomingCallToast = memo(function IncomingCallToast() {
  const inbound = useInboundCall();
  if (!inbound?.incomingCall) return null;

  const { params } = inbound.incomingCall;
  const callerName =
    (inbound.contact && contactDisplayName(inbound.contact)) ||
    params.callerName ||
    null;

  return (
    <div className="phone-toast" role="alert">
      <div className="phone-toast__copy">
        <span className="phone-toast__label">INCOMING CALL</span>
        <span className="phone-toast__name">
          {callerName ? callerName.toUpperCase() : fmtPhone(params.callerPhone)}
        </span>
        {callerName ? (
          <span className="phone-toast__phone">{fmtPhone(params.callerPhone)}</span>
        ) : null}
      </div>
      <div className="phone-toast__actions">
        <button
          type="button"
          className="phone-toast__btn phone-toast__btn--decline"
          onClick={inbound.declineCall}
          aria-label="Decline call"
          title="Decline"
        >
          <PhoneOff size={16} />
        </button>
        <button
          type="button"
          className="phone-toast__btn phone-toast__btn--answer"
          onClick={inbound.acceptCall}
          aria-label="Answer call"
          title="Answer"
        >
          <span className="phone-toast__pulse" aria-hidden="true" />
          <Phone size={16} />
        </button>
      </div>
    </div>
  );
});

export default IncomingCallToast;
