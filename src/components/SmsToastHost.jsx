import { useCallback, useEffect, useRef, useState } from "react";
import AppToast from "./AppToast";
import { MessageSquare } from "lucide-react";
import { subscribeSms } from "../lib/smsEvents";

const TOAST_TTL_MS = 6000;

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

  return <>{toasts.map((toast) => <AppToast key={toast.id} tone="info" onDismiss={() => dismiss(toast.id)}>
    <div onClick={() => {
      dismiss(toast.id);
      if (toast.contactId) onOpenContactMessages?.(toast.contactId);
    }}>
      <MessageSquare size={14} aria-hidden="true" />
      <span>{toast.label.toUpperCase()}</span>
      <span>{toast.preview}</span>
    </div>
  </AppToast>)}</>;
}
