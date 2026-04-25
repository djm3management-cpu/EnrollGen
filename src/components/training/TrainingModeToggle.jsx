import { useTrainingMode } from "../../context/TrainingModeContext";

export default function TrainingModeToggle() {
  const { enabled, toggle } = useTrainingMode();

  return (
    <button
      type="button"
      className={`training-mode-toggle${enabled ? " is-training" : ""}`}
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? "Switch to live call mode" : "Switch to training mode"}
    >
      <span className={`training-mode-toggle-dot${enabled ? " is-training" : ""}`} />
      <span className="training-mode-toggle-label">
        {enabled ? "TRAINING" : "LIVE"}
      </span>
    </button>
  );
}
