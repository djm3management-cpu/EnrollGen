import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import IncomingCallToast from "./IncomingCallToast";
import ActiveCallBar from "./ActiveCallBar";
import ActiveCallExpanded from "./ActiveCallExpanded";
import DialerPanel from "./DialerPanel";

// GHL-style dropdown phone system: a single nav icon that owns three
// states depending on call activity -
//   idle          -> click opens DialerPanel (Recents/Contacts/Keypad)
//   ringing/live  -> click toggles ActiveCallBar <-> ActiveCallExpanded
// IncomingCallToast is independent of open/closed and always shows
// while a call is ringing in, per spec.
export default function PhoneDropdown({ onOpenMessages }) {
  const inbound = useInboundCall();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  const hasCall = Boolean(inbound?.activeCall || inbound?.dialingCall);

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
    if (hasCall) setIsOpen(false);
  }, [hasCall]);

  if (!inbound?.enabled) return null;

  return (
    <div className="phone-dd" ref={rootRef}>
      <button
        type="button"
        className={`top-bar-settings-button phone-dd__trigger${isOpen ? " is-active" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
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
            <DialerPanel />
          )}
        </div>
      ) : null}
    </div>
  );
}
