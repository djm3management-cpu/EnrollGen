export default function PanelIdleSpinner({
  variant = "telemetry",
  compact = false,
  active = true,
}) {
  const stateClass =
    variant === "copilot"
      ? "panel-empty--ai"
      : active
        ? "panel-empty--listening"
        : "panel-empty--input";
  const label =
    variant === "copilot" ? "Co-Pilot feed waiting" : "Live telemetry waiting";

  return (
    <div
      className={`${compact ? "panel-empty-compact" : "panel-empty"} ${stateClass}`}
      role="status"
      aria-label={label}
    >
      <div className="panel-empty-dots">
        <span className="panel-empty-dot" />
        <span className="panel-empty-dot" />
        <span className="panel-empty-dot" />
      </div>
    </div>
  );
}
