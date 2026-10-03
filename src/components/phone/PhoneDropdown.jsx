import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import IncomingCallToast from "./IncomingCallToast";
import ActiveCallBar from "./ActiveCallBar";
import ActiveCallExpanded from "./ActiveCallExpanded";
import DialerPanel from "./DialerPanel";
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
  const [prefillContact, setPrefillContact] = useState(null);
  const [prefillVersion, setPrefillVersion] = useState(0);
  const rootRef = useRef(null);

  const hasCall = Boolean(inbound?.activeCall || inbound?.dialingCall);

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
    if (!isOpen) return undefined;

    const handleMouseDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      // With a live call, clicking away only minimizes back to the bar.
      setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Auto-collapse to the minimized bar the moment there's any call to
  // show (ringing out or connected), so the agent always sees the
  // timer/mute/hold/end controls without an extra click. Otherwise a
  // call placed from the open dialer would leave the dropdown open,
  // swapped to an empty ActiveCallExpanded (which needs a connected
  // activeCall, not just a ringing dialingCall).
  useEffect(() => {
    if (hasCall) setIsOpen(inbound?.activeCall?.params?.paragon === 'true');
  }, [hasCall, inbound?.activeCall]);

  if (!inbound?.enabled) return null;

  return (
    <div className="phone-dd" ref={rootRef}>
      <button
        type="button"
        className={`top-bar-settings-button phone-dd__trigger${isOpen ? " is-active" : ""}`}
        onClick={() => { setPrefillContact(null); setIsOpen((current) => !current); }}
        title="Phone"
        aria-label="Phone dialer"
      >
        <Phone size={14} />
        {hasCall ? <span className="phone-dd__badge" aria-hidden="true" /> : null}
      </button>

      <IncomingCallToast />

      {hasCall && !isOpen ? <ActiveCallBar onExpand={() => setIsOpen(true)} /> : null}

      {isOpen ? (
        <div className="phone-dd__panel" role="dialog" aria-label="Phone">
          {hasCall ? (
            <ActiveCallExpanded onOpenMessages={onOpenMessages} />
          ) : (
            <DialerPanel key={prefillContact ? `${prefillContact.id}:${prefillVersion}` : 'manual'} initialContact={prefillContact} />
          )}
        </div>
      ) : null}
    </div>
  );
}
