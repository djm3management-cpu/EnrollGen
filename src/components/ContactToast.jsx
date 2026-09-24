import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ContactToast({ message, onDismiss, error = false }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  return message ? createPortal(
    <div className={`contact-toast${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
      <span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
    </div>, document.body
  ) : null;
}
