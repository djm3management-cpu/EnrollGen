import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import { useInboundCall } from "../context/InboundCallContext";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

// In-call keypad for navigating IVRs or entering PINs. Only meaningful
// once the softphone has an active Twilio connection to send tones on.
export default function DtmfKeypad() {
  const inbound = useInboundCall();
  const [open, setOpen] = useState(false);

  if (!inbound?.activeCall) return null;

  return (
    <div className="dtmf-keypad-wrap">
      <button
        type="button"
        className={`copilot-pill-button dtmf-toggle-btn${open ? " is-active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title="Send DTMF tones"
        aria-label="Toggle keypad"
      >
        <Grid3x3 size={12} />
      </button>
      {open ? (
        <div className="dtmf-keypad-popover">
          {DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              className="dtmf-keypad-key"
              onClick={() => inbound.sendDigits(digit)}
            >
              {digit}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
