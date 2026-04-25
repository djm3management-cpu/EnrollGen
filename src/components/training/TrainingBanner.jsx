import { GraduationCap } from "lucide-react";

export default function TrainingBanner() {
  return (
    <div className="training-banner" role="status">
      <span className="training-banner-icon" aria-hidden="true">
        <GraduationCap size={14} />
      </span>
      <div className="training-banner-copy">
        <span className="training-banner-title">Training Mode</span>
        <span className="training-banner-body">
          No live audio. Practice the flow at your own pace.
        </span>
      </div>
    </div>
  );
}
