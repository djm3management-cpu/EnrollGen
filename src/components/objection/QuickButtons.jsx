import React from "react";
import { QUICK_OBJECTIONS } from "../../data/objectionData";

export function QuickButtons({ onSelect, disabled }) {
  return (
    <div className="objection-quick-btns">
      {QUICK_OBJECTIONS.map((obj) => (
        <button
          key={obj.label}
          className="objection-quick-btn"
          onClick={() => onSelect(obj.text)}
          disabled={disabled}
        >
          {obj.label}
        </button>
      ))}
    </div>
  );
}
