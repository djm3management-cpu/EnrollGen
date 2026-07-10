import { useCallback, useEffect, useState } from "react";
import { Phone, Delete, Search } from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import { useContactsList, contactDisplayName } from "../../hooks/useContacts";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import { normalizePhoneE164 } from "../../lib/phone";
import { playDtmfTone } from "../../audio/dtmfTones";

// The line calls actually go out on (telephony/src/config.js
// TWILIO_PHONE_NUMBER, falls back to this same number in
// voiceOutbound.js). Not exposed to the frontend anywhere, so it's
// mirrored here for display only.
const CALLING_FROM_LABEL = "NGHS MAIN DID";
const CALLING_FROM_NUMBER = "+16098065996";

const TABS = ["RECENTS", "CONTACTS", "KEYPAD"];
const DIALABLE_RE = /^[0-9*#]$/;

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

function initialsFor(contact) {
  const first = String(contact?.first_name || "").trim()[0];
  const last = String(contact?.last_name || "").trim()[0];
  const initials = `${first || ""}${last || ""}`.trim();
  if (initials) return initials.toUpperCase();
  return String(contact?.phone || "?").slice(-2);
}

function RecentsTab({ onCall, disabled }) {
  const { supabaseClient } = useTenantConfig();
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (!supabaseClient) return undefined;
    let cancelled = false;
    supabaseClient
      .from("v_call_log")
      .select("log_id, occurred_at, direction, contact_id, contact_name, contact_phone")
      .order("occurred_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setRecent(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseClient]);

  if (!recent.length) {
    return <div className="phone-dialer__empty">No recent calls</div>;
  }

  return (
    <div className="phone-dialer__list">
      {recent.map((row) => (
        <button
          type="button"
          key={row.log_id}
          className="phone-dialer__row"
          disabled={disabled || !row.contact_phone}
          onClick={() => onCall(row.contact_phone, row.contact_id, row.contact_name)}
        >
          <span className={`phone-dialer__dir is-${row.direction}`}>
            {row.direction === "inbound" ? "IN" : "OUT"}
          </span>
          <span className="phone-dialer__row-copy">
            <span className="phone-dialer__row-name">
              {row.contact_name || fmtPhone(row.contact_phone) || "UNKNOWN"}
            </span>
            <span className="phone-dialer__row-sub">{fmtWhen(row.occurred_at)}</span>
          </span>
          <Phone size={13} />
        </button>
      ))}
    </div>
  );
}

function ContactsTabPanel({ onCall, disabled }) {
  const [search, setSearch] = useState("");
  const { contacts, loading } = useContactsList(search);

  return (
    <div className="phone-dialer__contacts">
      <div className="phone-dialer__search">
        <Search size={13} />
        <input
          type="search"
          placeholder="Search contacts"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {loading ? (
        <div className="phone-dialer__empty">Loading contacts...</div>
      ) : !contacts.length ? (
        <div className="phone-dialer__empty">No contacts found</div>
      ) : (
        <div className="phone-dialer__list">
          {contacts.map((contact) => (
            <div key={contact.id} className="phone-dialer__row phone-dialer__row--contact">
              <span className="phone-dialer__avatar">{initialsFor(contact)}</span>
              <span className="phone-dialer__row-copy">
                <span className="phone-dialer__row-name">{contactDisplayName(contact)}</span>
                <span className="phone-dialer__row-sub">{fmtPhone(contact.phone)}</span>
              </span>
              <button
                type="button"
                className="phone-dialer__call-icon"
                disabled={disabled || !contact.phone || contact.do_not_call}
                title={contact.do_not_call ? "Do not call" : `Call ${contact.phone}`}
                onClick={() => onCall(contact.phone, contact.id, contactDisplayName(contact))}
              >
                <Phone size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeypadTab({ onCall, disabled }) {
  const [input, setInput] = useState("");

  const handleKey = useCallback((digit) => {
    playDtmfTone(digit);
    setInput((prev) => (prev + digit).slice(0, 20));
  }, []);

  const handleInputChange = useCallback((event) => {
    const next = event.target.value;
    if (next.length === input.length + 1 && next.startsWith(input)) {
      const typed = next.slice(-1);
      if (DIALABLE_RE.test(typed)) playDtmfTone(typed);
    }
    setInput(next);
  }, [input]);

  return (
    <div className="phone-dialer__keypad">
      <input
        type="tel"
        className="phone-dialer__input"
        placeholder="(555) 123-4567"
        value={input}
        onChange={handleInputChange}
      />
      <div className="phone-dialer__keys">
        {KEYS.map(([digit, letters]) => (
          <button type="button" key={digit} className="phone-dialer__key" onClick={() => handleKey(digit)}>
            <span className="phone-dialer__key-digit">{digit}</span>
            {letters ? <span className="phone-dialer__key-letters">{letters}</span> : null}
          </button>
        ))}
      </div>
      <div className="phone-dialer__keypad-actions">
        <button
          type="button"
          className="phone-dialer__backspace"
          disabled={!input}
          onClick={() => setInput((prev) => prev.slice(0, -1))}
          aria-label="Backspace"
        >
          <Delete size={14} />
        </button>
        <button
          type="button"
          className="phone-dialer__call-btn"
          disabled={disabled || !input}
          onClick={() => onCall(input, null, null)}
        >
          <Phone size={14} />
          CALL
        </button>
      </div>
    </div>
  );
}

export default function DialerPanel() {
  const inbound = useInboundCall();
  const [tab, setTab] = useState("KEYPAD");
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState("");

  const handleCall = useCallback(
    async (rawNumber, contactId, contactName) => {
      const number = normalizePhoneE164(rawNumber);
      if (!number) {
        setCallError("Enter a valid phone number.");
        return;
      }
      setCallError("");
      setCalling(true);
      try {
        await inbound?.makeCall({ phoneNumber: number, contactId, contactName });
      } catch (err) {
        console.error("[DialerPanel] call failed:", err);
        setCallError(err?.message || "Could not place call.");
      } finally {
        setCalling(false);
      }
    },
    [inbound]
  );

  const disabled = calling || inbound?.deviceStatus !== "registered";

  return (
    <div className="phone-dialer">
      <div className="phone-dialer__header">
        <span className="phone-dialer__header-label">CALLING FROM</span>
        <span className="phone-dialer__header-number">
          {CALLING_FROM_LABEL} {fmtPhone(CALLING_FROM_NUMBER)}
        </span>
      </div>

      <div className="phone-dialer__tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            className={`phone-dialer__tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {callError ? <div className="phone-dialer__error">{callError}</div> : null}
      {disabled && !calling ? (
        <div className="phone-dialer__hint">Softphone status: {inbound?.deviceStatus || "offline"}</div>
      ) : null}

      <div className="phone-dialer__body">
        {tab === "RECENTS" ? <RecentsTab onCall={handleCall} disabled={disabled} /> : null}
        {tab === "CONTACTS" ? <ContactsTabPanel onCall={handleCall} disabled={disabled} /> : null}
        {tab === "KEYPAD" ? <KeypadTab onCall={handleCall} disabled={disabled} /> : null}
      </div>
    </div>
  );
}
