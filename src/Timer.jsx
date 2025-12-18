import { useEffect, useState } from "react";

export default function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  let status = "safe";
  if (seconds >= 45) status = "urgent";
  if (seconds >= 60) status = "blocked";

  return (
    <div className={`timer ${status}`}>
      <div className="analog">🕰️</div>
      <div className="digital">
        {String(Math.floor(seconds / 60)).padStart(2, "0")}:
        {String(seconds % 60).padStart(2, "0")}
      </div>
      {status === "blocked" && <p>TPMO REQUIRED</p>}
    </div>
  );
}
