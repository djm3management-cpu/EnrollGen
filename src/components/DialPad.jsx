import { useCallback, useEffect, useState } from "react";
import { X, Phone, Delete } from "lucide-react";
import { useInboundCall } from "../context/InboundCallContext";
import { useTenantConfig } from "../hooks/useTenantConfig";
import { normalizePhoneE164 } from "../lib/phone";

const KEYS = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["*", ""], ["0", "+"], ["#", ""],
];

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

function fmtWhen(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function DialPad({ open, onClose }) {
  const inbound = useInboundCall();
  const { supabaseClient } = useTenantConfig();
  const [input, setInput] = useState("");
  const [recent, setRecent] = useState([]);
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState("");

  useEffect(() => {
    if (!open || !supabaseClient) return;
    let cancelled = false;
    supabaseClient
      .from("v_call_log")
      .select("log_id, occurred_at, direction, contact_id, contact_name, contact_phone")
      .order("occurred_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!cancelled) setRecent(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [open, supabaseClient]);

  const handleKey = useCallback((digit) => {
    setInput((prev) => (prev + digit).slice(0, 20));
  }, []);

  const handleBackspace = useCallback(() => {
    setInput((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(
    async (rawNumber, contactId, contactName) => {
      const number = normalizePhoneE164(rawNumber || input);
      if (!number) {
        setCallError("Enter a valid phone number.");
        return;
      }
      setCallError("");
      setCalling(true);
      try {
        await inbound?.makeCall({ phoneNumber: number, contactId, contactName });
        onClose?.();
      } catch (err) {
        console.error("[DialPad] call failed:", err);
        setCallError(err?.message || "Could not place call.");
      } finally {
        setCalling(false);
      }
    },
    [input, inbound, onClose]
  );

  if (!open) return null;

  return (
    <div className="dial-pad-modal" role="dialog" aria-modal="true" aria-label="Dialer">
      <div className="dial-pad-panel">
        <div className="dial-pad-head">
          <span className="dial-pad-title">DIALER</span>
          <button type="button" className="dial-pad-close" onClick={onClose} aria-label="Close dialer">
            <X size={16} />
          </button>
        </div>

        <input
          type="tel"
          className="dial-pad-input"
          placeholder="(555) 123-4567"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />

        <div className="dial-pad-keys">
          {KEYS.map(([digit, letters]) => (
            <button
              key={digit}
              type="button"
              className="dial-pad-key"
              onClick={() => handleKey(digit)}
            >
              <span className="dial-pad-key__digit">{digit}</span>
              {letters ? <span className="dial-pad-key__letters">{letters}</span> : null}
            </button>
          ))}
        </div>

        <div className="dial-pad-actions">
          <button
            type="button"
            className="dial-pad-backspace"
            onClick={handleBackspace}
            disabled={!input}
            aria-label="Backspace"
          >
            <Delete size={14} />
          </button>
          <button
            type="button"
            className="dial-pad-call-btn"
            onClick={() => handleCall(input, null, null)}
            disabled={calling || inbound?.deviceStatus !== "registered"}
          >
            <Phone size={14} />
            {calling ? "CALLING..." : "CALL"}
          </button>
        </div>

        {callError ? <div className="dial-pad-error">{callError}</div> : null}
        {inbound?.deviceStatus !== "registered" ? (
          <div className="dial-pad-hint">Softphone status: {inbound?.deviceStatus || "offline"}</div>
        ) : null}

        {recent.length > 0 ? (
          <div className="dial-pad-recent">
            <div className="dial-pad-recent__label">RECENT</div>
            {recent.map((row) => (
              <button
                type="button"
                key={row.log_id}
                className="dial-pad-recent__row"
                onClick={() => handleCall(row.contact_phone, row.contact_id, row.contact_name)}
                disabled={calling || !row.contact_phone}
              >
                <span className={`dial-pad-recent__dir is-${row.direction}`}>
                  {row.direction === "inbound" ? "IN" : "OUT"}
                </span>
                <span className="dial-pad-recent__name">
                  {row.contact_name || fmtPhone(row.contact_phone) || "UNKNOWN"}
                </span>
                <span className="dial-pad-recent__time">{fmtWhen(row.occurred_at)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
