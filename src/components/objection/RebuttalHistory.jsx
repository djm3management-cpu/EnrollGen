import React from "react";

export function RebuttalHistory({ history, onSelect }) {
  if (history.length <= 1) return null;

  return (
    <div className="objection-history">
      <div className="objection-history-label">Recent</div>
      {history.slice(1).map((item, i) => (
        <div key={i} className="objection-history-item" onClick={() => onSelect(item)}>
          <span className="objection-history-q">"{item.objection}"</span>
          <span className="objection-history-arrow">&rarr;</span>
          <span className="objection-history-a">
            "{item.rebuttal.slice(0, 50)}..."
          </span>
        </div>
      ))}
    </div>
  );
}
