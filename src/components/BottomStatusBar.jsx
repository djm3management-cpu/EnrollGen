import { memo, useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const HAS_DEEPGRAM = Boolean(import.meta.env.VITE_DEEPGRAM_API_KEY);
const HAS_CLERK = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function checkDeepgram() {
  return HAS_DEEPGRAM
    ? "up"
    : typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    ? "up"
    : "down";
}

function checkSupabase() {
  return SUPABASE_URL ? "up" : "down";
}

function checkClerk() {
  if (typeof window === "undefined") return "unknown";
  if (window.Clerk?.session) return "up";
  if (HAS_CLERK) return "up";
  return "down";
}

function StatusIndicator({ label, state }) {
  const dotClass = `eg-bottom-bar__dot${state === "up" ? " is-up" : state === "down" ? " is-down" : ""}`;
  return (
    <span className="eg-bottom-bar__indicator">
      {label}
      <span className={dotClass} aria-hidden="true" />
    </span>
  );
}

const BottomStatusBar = memo(function BottomStatusBar({
  agency = "NGHS",
  npn = "21313049",
  states = "22 STATES",
}) {
  const [services, setServices] = useState({
    deepgram: "unknown",
    supabase: "unknown",
    clerk: "unknown",
  });

  useEffect(() => {
    const tick = () =>
      setServices({
        deepgram: checkDeepgram(),
        supabase: checkSupabase(),
        clerk: checkClerk(),
      });
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  const agencyLine = [agency, npn ? `NPN ${npn}` : "", states]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <footer className="eg-bottom-bar" aria-label="System status">
      <div className="eg-bottom-bar__left">{agencyLine}</div>
      <div className="eg-bottom-bar__right">
        <StatusIndicator label="DEEPGRAM" state={services.deepgram} />
        <StatusIndicator label="SUPABASE" state={services.supabase} />
        <StatusIndicator label="CLERK" state={services.clerk} />
      </div>
    </footer>
  );
});

export default BottomStatusBar;
