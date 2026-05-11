import { memo } from "react";
import Waveform from "./copilot/Waveform";

function normalizeLevel(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

const CenterTimerBar = memo(function CenterTimerBar({
  agentLevel = 0,
  customerLevel = 0,
  agentActive = false,
  customerActive = false,
}) {
  const safeAgentLevel = normalizeLevel(agentLevel);
  const safeCustomerLevel = normalizeLevel(customerLevel);
  const agentLive = agentActive || safeAgentLevel > 0.015;
  const customerLive = customerActive || safeCustomerLevel > 0.015;

  return (
    <div className="eg-timer-bar eg-audio-meter-bar" aria-label="Live audio levels">
      <div className="eg-audio-meter-row">
        <span className="eg-audio-meter-label">
          Customer
          <span
            className={`eg-audio-meter-dot${customerLive ? " is-live" : ""}`}
            aria-hidden="true"
          />
        </span>
        <Waveform
          active={customerLive}
          level={safeCustomerLevel}
          width={288}
          height={30}
        />
      </div>
      <div className="eg-audio-meter-row">
        <span className="eg-audio-meter-label">
          Agent
          <span
            className={`eg-audio-meter-dot${agentLive ? " is-live" : ""}`}
            aria-hidden="true"
          />
        </span>
        <Waveform
          active={agentLive}
          level={safeAgentLevel}
          width={288}
          height={30}
        />
      </div>
    </div>
  );
});

export default CenterTimerBar;
