import { memo } from "react";
import { useInboundCall } from "../context/InboundCallContext";
import { contactDisplayName } from "../hooks/useContacts";

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "UNKNOWN";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

// Full-width terminal alert bar shown below the top nav while an
// inbound Twilio call is ringing this agent.
const InboundCallBanner = memo(function InboundCallBanner() {
  const inbound = useInboundCall();
  if (!inbound?.incomingCall) return null;

  const { params } = inbound.incomingCall;
  const callerName =
    (inbound.contact && contactDisplayName(inbound.contact)) ||
    params.callerName ||
    "UNKNOWN CALLER";

  return (
    <div className="inbound-call-banner" role="alert">
      <span className="inbound-call-banner__pulse" aria-hidden="true" />
      <span className="inbound-call-banner__tag">INBOUND</span>
      <span className="inbound-call-banner__caller">
        {String(callerName).toUpperCase()}
        <span className="inbound-call-banner__phone">{fmtPhone(params.callerPhone)}</span>
      </span>
      <span className="inbound-call-banner__intel">
        <span>SCORE {params.leadScore || "--"}</span>
        <span>CHURN {(params.churnRisk || "--").toUpperCase()}</span>
        <span>SRC {(params.vendorSource || "--").toUpperCase()}</span>
      </span>
      <span className="inbound-call-banner__actions">
        <button
          type="button"
          className="inbound-call-banner__btn is-accept"
          onClick={inbound.acceptCall}
        >
          ACCEPT
        </button>
        <button
          type="button"
          className="inbound-call-banner__btn is-decline"
          onClick={inbound.declineCall}
        >
          DECLINE
        </button>
      </span>
    </div>
  );
});

export default InboundCallBanner;
