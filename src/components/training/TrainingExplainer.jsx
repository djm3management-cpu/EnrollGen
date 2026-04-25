import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TRAINING_GATE_EXPLAINERS } from "../../data/trainingGateExplainers";

export default function TrainingExplainer({ section }) {
  const [open, setOpen] = useState(false);
  const explainer = TRAINING_GATE_EXPLAINERS[section];

  if (!explainer) return null;

  return (
    <div className="training-explainer">
      <button
        type="button"
        className="training-explainer-trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown
          size={11}
          className={`training-explainer-chevron${open ? " is-open" : ""}`}
        />
        <span className="training-explainer-label">
          Why this matters · {explainer.title}
        </span>
      </button>
      {open ? (
        <p className="training-explainer-body">{explainer.body}</p>
      ) : null}
    </div>
  );
}
