export const COPILOT_PILL_BASE = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  borderRadius: 50,
  padding: "4px 0",
  fontSize: "0.58rem",
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  letterSpacing: "0.06em",
  lineHeight: "normal",
  textTransform: "uppercase",
  border: "1px solid rgba(255,255,255,0.07)",
  cursor: "pointer",
  transition: "all 0.15s",
  background:
    "linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%)",
};

export const COPILOT_CONTROL_STRIP_WIDTH = 296;
export const COPILOT_CONTROL_STRIP_HORIZONTAL_PADDING = 10;
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
