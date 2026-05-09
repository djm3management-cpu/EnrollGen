import { memo } from "react";

/**
 * EnrollmentCTA
 * Bottom-of-center-column CTA. Disabled until all sections complete,
 * activates to a primary green action when ready.
 * Spec: docs/DESIGN_SYSTEM.md Section 5.16.
 */
const EnrollmentCTA = memo(function EnrollmentCTA({
  ready = false,
  remaining = 0,
  total = 8,
  onSubmit,
  buttonLabel = "SUBMIT ENROLLMENT",
}) {
  const description = ready
    ? "All sections complete. Ready to submit."
    : `Complete all ${total} sections to submit${
        remaining ? ` (${remaining} remaining)` : ""
      }`;

  return (
    <div className="enrollment-cta">
      <div>
        <div className="enrollment-cta__label">ENROLLMENT</div>
        <div className="enrollment-cta__description">{description}</div>
      </div>
      <button
        type="button"
        className={`enrollment-cta__submit${ready ? " is-ready" : " is-disabled"}`}
        disabled={!ready}
        onClick={onSubmit}
      >
        {buttonLabel}
      </button>
    </div>
  );
});

export default EnrollmentCTA;
