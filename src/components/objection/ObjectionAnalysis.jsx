import { useState } from "react";
import {
  Brain, MessageSquareQuote, HelpCircle, CornerDownRight,
  AlertTriangle, XCircle,
} from "lucide-react";

export function ObjectionAnalysis({ objection }) {
  const [mode, setMode] = useState("full"); // "oneline" | "full"

  if (!objection) {
    return (
      <div className="objection-analysis objection-analysis-empty">
        <Brain size={32} strokeWidth={1} />
        <p>Select an objection to see the full diagnostic breakdown</p>
      </div>
    );
  }

  return (
    <div className="objection-analysis">
      <div className="objection-analysis-header">
        <div className="objection-analysis-trigger">
          <span className="objection-trigger-quote">"{objection.trigger}"</span>
        </div>

        <div className="objection-mode-toggle">
          <button
            className={`objection-mode-btn${mode === "oneline" ? " active" : ""}`}
            onClick={() => setMode("oneline")}
          >
            One-liner
          </button>
          <button
            className={`objection-mode-btn${mode === "full" ? " active" : ""}`}
            onClick={() => setMode("full")}
          >
            Full
          </button>
        </div>
      </div>

      {/* Likely meaning */}
      <div className="objection-dx-block">
        <div className="objection-dx-label">
          <Brain size={12} /> DIAGNOSIS
        </div>
        <p className="objection-dx-text">{objection.likelyMeaning}</p>
      </div>

      {/* Response */}
      <div className="objection-dx-block objection-dx-rebuttal">
        <div className="objection-dx-label rebuttal-label">
          <MessageSquareQuote size={12} /> SAY THIS
        </div>
        <p className="objection-dx-quote">
          "{mode === "oneline" ? objection.oneLiner : objection.fullResponse}"
        </p>
      </div>

      {/* Best question */}
      <div className="objection-dx-block objection-dx-question">
        <div className="objection-dx-label question-label">
          <HelpCircle size={12} /> THEN ASK
        </div>
        <p className="objection-dx-quote">"{objection.bestQuestion}"</p>
      </div>

      {/* Alternative */}
      <div className="objection-dx-block objection-dx-alt">
        <div className="objection-dx-label alt-label">
          <CornerDownRight size={12} /> ALTERNATIVE
        </div>
        <p className="objection-dx-quote">"{objection.alternativeResponse}"</p>
      </div>

      {/* Compliance */}
      <div className="objection-dx-block objection-dx-compliance">
        <div className="objection-dx-label compliance-label">
          <AlertTriangle size={12} /> COMPLIANCE
        </div>
        <p className="objection-dx-text">{objection.complianceNote}</p>
      </div>

      {/* Unrecoverable exit */}
      <div className="objection-dx-block objection-dx-exit">
        <div className="objection-dx-label exit-label">
          <XCircle size={12} /> IF UNRECOVERABLE
        </div>
        <p className="objection-dx-quote">"{objection.exitScript}"</p>
      </div>
    </div>
  );
}
