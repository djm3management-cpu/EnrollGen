import React from "react";
import {
  MessageSquareQuote,
  CornerDownLeft,
  Target,
  Copy,
} from "lucide-react";

export function ResponseCard({ response, onCopy }) {
  if (!response) return null;

  return (
    <div className="objection-response">
      {/* Main Rebuttal */}
      <div className="objection-rebuttal">
        <div className="objection-rebuttal-label">
          <MessageSquareQuote size={13} />
          SAY THIS
        </div>
        <p className="objection-rebuttal-text">"{response.rebuttal}"</p>
      </div>

      {/* Follow-up */}
      {response.followup && (
        <div className="objection-followup">
          <div className="objection-followup-label">
            <CornerDownLeft size={13} />
            THEN ASK
          </div>
          <p className="objection-followup-text">"{response.followup}"</p>
        </div>
      )}

      {/* Agent Tip */}
      {response.tip && (
        <div className="objection-tip">
          <span className="objection-tip-label">
            <Target size={13} />
            AGENT TIP:
          </span>{" "}
          {response.tip}
        </div>
      )}

      {/* Copy button */}
      <button className="objection-copy-btn" onClick={onCopy}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Copy size={13} />
          Copy
        </span>
      </button>
    </div>
  );
}
