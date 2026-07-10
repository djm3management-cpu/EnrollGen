import { useEffect, useState } from "react";

// Ticking MM:SS elapsed since connectedAt, shared by the minimized
// active-call bar and the expanded dropdown view.
export function useCallDuration(connectedAt) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!connectedAt) {
      setElapsedMs(0);
      return undefined;
    }
    setElapsedMs(Date.now() - connectedAt);
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - connectedAt);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [connectedAt]);

  return elapsedMs;
}
