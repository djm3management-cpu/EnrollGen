import { memo } from "react";

/**
 * CustomerAudioCapture — UI controls for capturing customer audio
 * from a shared browser tab via getDisplayMedia + Deepgram.
 *
 * States: IDLE → CAPTURING → ERROR
 * Matches the F1 pit wall dark theme used throughout EnrollGen.
 */

const CustomerAudioCapture = memo(function CustomerAudioCapture({
  isCapturing,
  audioLevel = 0,
  error,
  onStart,
  onStop,
  hasDeepgramKey,
}) {
  const featureEnabled = import.meta.env.VITE_ENABLE_CUSTOMER_AUDIO !== "false";
  if (!featureEnabled) return null;

  // ERROR state
  if (error) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
        border: "1px solid rgba(232,0,45,0.2)", borderRadius: 50, padding: "4px 10px",
      }}>
        <span style={{ fontSize: "0.65rem", color: "#FF8FA3", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={error}
        >
          {error}
        </span>
        <button
          onClick={onStart}
          style={{
            background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
            border: "1px solid rgba(255,165,0,0.3)", color: "#FFB347", borderRadius: 50,
            padding: "3px 10px", fontSize: "0.65rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
            boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          RETRY
        </button>
      </div>
    );
  }

  // CAPTURING state
  if (isCapturing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Audio level meter */}
        <div style={{
          display: "flex", alignItems: "center", gap: 3,
          background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
          border: "1px solid rgba(0,255,65,0.15)", borderRadius: 50, padding: "4px 10px",
          boxShadow: "inset 3px 3px 6px rgba(0,0,0,0.4), inset -2px -2px 5px rgba(255,255,255,0.018)",
        }}>
          {/* Pulsing live indicator */}
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#00ff41", flexShrink: 0,
            boxShadow: "0 0 6px rgba(0,255,65,0.7)",
            animation: "customerPulse 1.5s ease-in-out infinite",
          }} />

          {/* Level bars */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 12 }}>
            {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((threshold, i) => (
              <div
                key={i}
                style={{
                  width: 2,
                  height: 3 + i * 1.5,
                  borderRadius: 1,
                  background: audioLevel > threshold ? "#00ff41" : "rgba(255,255,255,0.08)",
                  transition: "background 0.1s",
                }}
              />
            ))}
          </div>

          <span style={{
            fontSize: "0.62rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            letterSpacing: "0.04em", color: "#00ff41", whiteSpace: "nowrap",
          }}>
            CUSTOMER LIVE
          </span>
        </div>

        <button
          onClick={onStop}
          style={{
            background: "linear-gradient(145deg, rgba(232,0,45,0.12) 0%, rgba(180,0,35,0.08) 100%)",
            border: "1px solid rgba(232,0,45,0.2)", color: "#FF8FA3", borderRadius: 50,
            padding: "4px 10px", fontSize: "0.65rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
            boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          STOP
        </button>
      </div>
    );
  }

  // IDLE state
  return (
    <button
      onClick={onStart}
      disabled={!hasDeepgramKey}
      title={
        !hasDeepgramKey
          ? "Set VITE_DEEPGRAM_API_KEY in .env to enable customer audio capture"
          : "Share your dialer tab to capture customer audio for compliance review"
      }
      style={{
        background: "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
        border: "1px solid rgba(255,255,255,0.07)", color: "#7a7f8e", borderRadius: 50,
        padding: "4px 12px", fontSize: "0.68rem", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
        cursor: hasDeepgramKey ? "pointer" : "not-allowed",
        opacity: hasDeepgramKey ? 1 : 0.45,
        whiteSpace: "nowrap", transition: "all 0.15s",
        boxShadow: "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      + CUSTOMER AUDIO
    </button>
  );
});

export default CustomerAudioCapture;
