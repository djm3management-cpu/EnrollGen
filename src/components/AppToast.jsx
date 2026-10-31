import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function toastHost() {
  let host = document.getElementById('app-toast-stack');
  if (!host) {
    host = document.createElement('div');
    host.id = 'app-toast-stack';
    host.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(host);
  }
  return host;
}

export default function AppToast({ children, message, tone = 'info', onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  const [host, setHost] = useState(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const stack = toastHost();
    setHost(stack);
    const position = () => {
      const bars = document.querySelectorAll('.top-bar-shell, .contacts-subviews');
      let bottom = 48;
      bars.forEach(bar => {
        if (bar.getClientRects().length) bottom = Math.max(bottom, bar.getBoundingClientRect().bottom);
      });
      stack.style.top = `${Math.max(0, bottom) + 12}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(document.body);
    document.querySelectorAll('.top-bar-shell, .contacts-subviews').forEach(bar => observer.observe(bar));
    const mutations = new MutationObserver(position);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, []);
  useEffect(() => {
    setDismissed(false);
    if (tone !== 'info' && tone !== 'success') return undefined;
    const timer = window.setTimeout(() => { setDismissed(true); dismissRef.current?.(); }, 6000);
    return () => window.clearTimeout(timer);
  }, [message, tone]);
  if (!host || dismissed || (!message && !children)) return null;
  return createPortal(<div className={`app-toast app-toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <span className="app-toast__dot" aria-hidden="true" />
    <div className="app-toast__content">{message || children}</div>
    <button data-key-role="secondary" type="button" className="app-toast__close" aria-label="Dismiss notification" onClick={() => { setDismissed(true); dismissRef.current?.(); }}>×</button>
  </div>, host);
}
