import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { subscribeSms } from "../lib/smsEvents";

const TOAST_TTL_MS = 8000;

function toastLabel(event) {
  const contact = event?.contact;
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
  return name || contact?.phone || event?.message?.from_number || "Unknown number";
}

// App-wide inbound SMS notifications. Mounted once in the shell so
// toasts appear on every tab, not just CONTACTS. Clicking a toast
// jumps to that contact's MESSAGES tab.
export default function SmsToastHost({ onOpenContactMessages }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSms((event) => {
      if (event?.message?.direction !== "inbound") return;
      const id = event.message.id || `${Date.now()}-${Math.random()}`;
      const toast = {
        id,
        contactId: event.message.contact_id || event.contact?.id || null,
        label: toastLabel(event),
        preview: (event.message.body || "(media message)").slice(0, 90),
      };
      setToasts((current) => [...current.filter((t) => t.id !== id), toast].slice(-4));
      timersRef.current.set(
        id,
        window.setTimeout(() => dismiss(id), TOAST_TTL_MS)
      );
    });
    const timers = timersRef.current;
    return () => {
      unsubscribe();
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [dismiss]);

  if (!toasts.length) return null;

  return (
    <div className="sms-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="sms-toast"
          onClick={() => {
            dismiss(toast.id);
            if (toast.contactId) onOpenContactMessages?.(toast.contactId);
          }}
        >
          <span className="sms-toast__icon" aria-hidden="true">
            <MessageSquare size={14} />
          </span>
          <span className="sms-toast__body">
            <span className="sms-toast__label">{toast.label.toUpperCase()}</span>
            <span className="sms-toast__preview">{toast.preview}</span>
          </span>
          <button
            type="button"
            className="sms-toast__close"
            aria-label="Dismiss notification"
            onClick={(event) => {
              event.stopPropagation();
              dismiss(toast.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
