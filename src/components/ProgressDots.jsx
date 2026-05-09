import { memo } from "react";

/**
 * ProgressDots
 * Row of dots showing section progress, with the active section's dot
 * elongated into a 20px pill. Spec: docs/DESIGN_SYSTEM.md Section 5.11.
 */
const ProgressDots = memo(function ProgressDots({
  sections = [],
  onSelect,
}) {
  return (
    <div className="progress-dots" role="tablist" aria-label="Section progress">
      {sections.map((section, index) => {
        const status = section.status || "pending";
        const isActive = status === "active";
        return (
          <button
            key={section.key ?? section.label ?? index}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={section.label || `Section ${index + 1}`}
            title={section.label || `Section ${index + 1}`}
            onClick={() => onSelect?.(section, index)}
            className={`progress-dot is-${status}${isActive ? " is-active" : ""}`}
            style={{ border: "none", padding: 0, background: "transparent" }}
          >
            <span aria-hidden="true" className={`progress-dot__pill is-${status}`} />
          </button>
        );
      })}
    </div>
  );
});

export default ProgressDots;
