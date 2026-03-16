import React, { useState, useCallback } from "react";
import {
  GitBranch, Copy, CheckCheck, MessageSquareQuote,
  CornerDownLeft, Target, ArrowRight,
} from "lucide-react";

function TreeBranch({ branch, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="objection-tree-branch">
      <button
        className={`objection-tree-trigger${expanded ? " expanded" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="objection-tree-if">IF:</span>
        <span className="objection-tree-client">"{branch.clientSays}"</span>
      </button>

      {expanded && (
        <div className="objection-tree-response">
          <div className="objection-tree-say">
            <MessageSquareQuote size={11} />
            <span>"{branch.response}"</span>
          </div>
          <div className="objection-tree-next">
            <ArrowRight size={11} />
            <span>{branch.nextStep}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function RebuttalPanel({ objection, aiResponse, aiLoading, onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (text) => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    []
  );

  if (!objection) {
    return (
      <div className="objection-rebuttal-panel objection-rebuttal-panel-empty">
        <GitBranch size={32} strokeWidth={1} />
        <p>Response tree and next steps will appear here</p>
      </div>
    );
  }

  return (
    <div className="objection-rebuttal-panel">
      <div className="objection-col-label">
        <GitBranch size={13} /> Response Tree
      </div>

      {/* Decision tree */}
      <div className="objection-tree">
        <div className="objection-tree-label">What do they say next?</div>
        {objection.tree.map((branch, i) => (
          <TreeBranch key={i} branch={branch} index={i} />
        ))}
      </div>

      {/* Quick copy section */}
      <div className="objection-quick-copy">
        <div className="objection-tree-label">Quick Copy</div>
        <button
          className="objection-copy-line"
          onClick={() => handleCopy(objection.oneLiner)}
        >
          <Copy size={11} />
          <span>One-liner</span>
        </button>
        <button
          className="objection-copy-line"
          onClick={() => handleCopy(objection.fullResponse)}
        >
          <Copy size={11} />
          <span>Full response</span>
        </button>
        <button
          className="objection-copy-line"
          onClick={() => handleCopy(objection.bestQuestion)}
        >
          <Copy size={11} />
          <span>Follow-up question</span>
        </button>
        {copied && (
          <span className="objection-copied-toast">
            <CheckCheck size={12} /> Copied
          </span>
        )}
      </div>

      {/* AI response (if they used custom input) */}
      {aiLoading && (
        <div className="objection-ai-section">
          <div className="objection-tree-label">AI Coach</div>
          <div className="objection-loading">
            <span className="prompter-pulse">&bull;</span> Getting rebuttal...
          </div>
        </div>
      )}

      {!aiLoading && aiResponse && (
        <div className="objection-ai-section">
          <div className="objection-tree-label">AI Coach Response</div>

          <div className="objection-ai-rebuttal">
            <div className="objection-dx-label rebuttal-label">
              <MessageSquareQuote size={12} /> SAY THIS
            </div>
            <p className="objection-dx-quote">"{aiResponse.rebuttal}"</p>
          </div>

          {aiResponse.followup && (
            <div className="objection-ai-followup">
              <div className="objection-dx-label question-label">
                <CornerDownLeft size={12} /> THEN ASK
              </div>
              <p className="objection-dx-quote">"{aiResponse.followup}"</p>
            </div>
          )}

          {aiResponse.tip && (
            <div className="objection-ai-tip">
              <span className="objection-tip-label">
                <Target size={12} /> TIP:
              </span>{" "}
              {aiResponse.tip}
            </div>
          )}

          <button
            className="objection-copy-line"
            onClick={() => {
              const text = aiResponse.rebuttal + (aiResponse.followup ? " " + aiResponse.followup : "");
              handleCopy(text);
              if (onCopy) onCopy();
            }}
          >
            <Copy size={11} />
            <span>Copy AI response</span>
          </button>
        </div>
      )}
    </div>
  );
}
