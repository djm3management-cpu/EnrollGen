import { useCallback, useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import IncomingCallToast from "./IncomingCallToast";
import ActiveCallBar from "./ActiveCallBar";
import ActiveCallExpanded from "./ActiveCallExpanded";
import DialerPanel from "./DialerPanel";
import CallDispositionBox from "./CallDispositionBox";
import { OPEN_DIALER_EVENT } from "../../lib/dialerUi";

// GHL-style dropdown phone system: a single nav icon that owns three
// states depending on call activity -
//   idle          -> click opens DialerPanel (Recents/Contacts/Keypad)
//   ringing/live  -> click toggles ActiveCallBar <-> ActiveCallExpanded
// IncomingCallToast is independent of open/closed and always shows
// while a call is ringing in, per spec.
export default function PhoneDropdown({ onOpenMessages }) {
  const inbound = useInboundCall();
  const [isOpen, setIsOpen] = useState(false);
  const [dispositionPending, setDispositionPending] = useState(false);
  const [dispositionCollapsed, setDispositionCollapsed] = useState(false);
  const [prefillContact, setPrefillContact] = useState(null);
  const [prefillVersion, setPrefillVersion] = useState(0);
  const rootRef = useRef(null);

  const hasCall = Boolean(inbound?.activeCall || inbound?.dialingCall);
  const pendingDisposition = dispositionPending && !hasCall && !inbound?.incomingCall;
  const panelOpen = isOpen || (pendingDisposition && !dispositionCollapsed);

  useEffect(() => {
    const openPrefilledDialer = (event) => {
      if (!inbound?.enabled || hasCall || !event.detail?.contact?.phone) return;
      setPrefillContact(event.detail.contact);
      setPrefillVersion((current) => current + 1);
      setIsOpen(true);
    };
    window.addEventListener(OPEN_DIALER_EVENT, openPrefilledDialer);
    return () => window.removeEventListener(OPEN_DIALER_EVENT, openPrefilledDialer);
  }, [inbound?.enabled, hasCall]);

  useEffect(() => {
    if (!isOpen && (!pendingDisposition || dispositionCollapsed)) return undefined;

    const handleMouseDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      // With a live call, clicking away only minimizes back to the bar.
      setIsOpen(false);
      setDispositionCollapsed(true);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") { setIsOpen(false); setDispositionCollapsed(true); }
    };

    document.addEventListener("pointerdown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, pendingDisposition, dispositionCollapsed]);

  // Auto-collapse to the minimized bar the moment there's any call to
  // show (ringing out or connected), so the agent always sees the
  // timer/mute/hold/end controls without an extra click. Otherwise a
  // call placed from the open dialer would leave the dropdown open,
  // swapped to an empty ActiveCallExpanded (which needs a connected
  // activeCall, not just a ringing dialingCall).
  useEffect(() => {
    if (hasCall) setIsOpen(inbound?.activeCall?.params?.paragon === 'true');
  }, [hasCall, inbound?.activeCall]);

  const collapseDisposition = useCallback((value) => {
    setDispositionCollapsed(value);
    if (value) setIsOpen(false);
  }, []);

  if (!inbound?.enabled) return null;

  return (
    <div className="phone-dd" ref={rootRef}>
      <button
        type="button"
        className={`top-bar-settings-button phone-dd__trigger${isOpen ? " is-active" : ""}`}
        onClick={() => {
          setPrefillContact(null);
          if (panelOpen) collapseDisposition(true);
          else { setDispositionCollapsed(false); setIsOpen(true); }
        }}
        title={pendingDisposition ? "Phone — disposition pending" : "Phone"}
        aria-label={pendingDisposition ? "Phone dialer, disposition pending" : "Phone dialer"}
      >
        <Phone size={14} />
        {hasCall || pendingDisposition ? <span className={`phone-dd__badge${pendingDisposition ? " phone-dd__badge--pending" : ""}`} aria-hidden="true" /> : null}
      </button>

      <IncomingCallToast />

      {hasCall && !isOpen ? <ActiveCallBar onExpand={() => setIsOpen(true)} /> : null}

      <div className="phone-dd__panel" hidden={!panelOpen} role="dialog" aria-label="Phone">
        <CallDispositionBox phone={inbound} onVisibleChange={setDispositionPending} collapsed={dispositionCollapsed} onCollapsedChange={collapseDisposition} />
        {isOpen ? (hasCall ? (
            <ActiveCallExpanded onOpenMessages={onOpenMessages} />
          ) : (
            <DialerPanel key={prefillContact ? `${prefillContact.id}:${prefillVersion}` : 'manual'} initialContact={prefillContact} />
          )) : null}
        </div>
    </div>
  );
}
