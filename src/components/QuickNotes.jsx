import { memo } from "react";
import { StickyNote } from "lucide-react";

const QuickNotes = memo(function QuickNotes({
  value = "",
  onChange,
  title = "Agent Notes",
  placeholder = "Type notes here...",
}) {
  return (
    <div className="agent-notes-widget agent-notes-widget--separated">
      <div className="agent-notes-widget-header">
        <div className="agent-notes-widget-title-group">
          <span className="agent-notes-widget-icon" aria-hidden="true">
            <StickyNote size={11} />
          </span>
          <span className="agent-notes-widget-title">{title}</span>
        </div>
      </div>

      <div className="agent-notes-widget-body agent-notes-widget-body--counted">
        <textarea
          className="agent-notes-widget-input right-rail-scroll"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          aria-label={title}
        />
        <span className="agent-notes-char-count">{value.length}</span>
      </div>
    </div>
  );
});

export default QuickNotes;
