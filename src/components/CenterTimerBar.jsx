import { memo } from "react";
import Waveform from "./copilot/Waveform";
import { useAudioLevels } from "../stores/audioLevelStore";

function normalizeLevel(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

const CenterTimerBar = memo(function CenterTimerBar({
  agentActive = false,
  customerActive = false,
}) {
  const { agentLevel, customerLevel, agentPeaks, customerPeaks } = useAudioLevels();
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
          peaks={customerPeaks}
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
          peaks={agentPeaks}
          width={288}
          height={30}
        />
      </div>
    </div>
  );
});

export default CenterTimerBar;
