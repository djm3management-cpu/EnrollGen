/* v3 design system: copilot pill buttons inherit styling from
   the .copilot-pill-button class in styles/v3-overrides.css.
   This object is kept for components that still spread it; it
   no longer carries gradients or shadows. */
export const COPILOT_PILL_BASE = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  borderRadius: 5,
  padding: "6px 10px",
  fontFamily: "var(--eg-font-mono)",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.04em",
  lineHeight: 1.2,
  textTransform: "uppercase",
  border: "1px solid var(--eg-border)",
  background: "transparent",
  color: "var(--eg-text-dim)",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

export const COPILOT_CONTROL_STRIP_WIDTH = 310;
export const COPILOT_CONTROL_STRIP_HORIZONTAL_PADDING = 12;
export const COPILOT_CONTROL_STRIP_BORDER_WIDTH = 1;
export const COPILOT_CONTROL_STRIP_BUTTON_GAP = 4;
export const COPILOT_CONTROL_STRIP_CONTENT_WIDTH =
  COPILOT_CONTROL_STRIP_WIDTH -
  COPILOT_CONTROL_STRIP_HORIZONTAL_PADDING * 2 -
  COPILOT_CONTROL_STRIP_BORDER_WIDTH * 2;

export const COPILOT_CONTROL_STRIP_BUTTON_WIDTH =
  (COPILOT_CONTROL_STRIP_CONTENT_WIDTH -
    COPILOT_CONTROL_STRIP_BUTTON_GAP * 2) /
  3;
