import { useCallback, useState } from "react";
import { Send } from "lucide-react";

export default function SimulatedTranscriptInput({
  transcript = "",
  onAppendUtterance,
  onClear,
}) {
  const [draft, setDraft] = useState("");

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onAppendUtterance?.(text);
    setDraft("");
  }, [draft, onAppendUtterance]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="simulated-transcript">
      <div className="simulated-transcript-head">
        <span className="simulated-transcript-kicker">Simulated Transcript</span>
        {transcript ? (
          <button
            type="button"
            className="simulated-transcript-clear"
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="simulated-transcript-feed" aria-live="polite">
        {transcript ? (
          <p className="simulated-transcript-feed-text">{transcript}</p>
        ) : (
          <p className="simulated-transcript-feed-empty">
            Type what you would say on a live call. The Co-Pilot reacts to each utterance.
          </p>
        )}
      </div>

      <div className="simulated-transcript-input-row">
        <textarea
          className="simulated-transcript-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type an utterance, then press Send (Ctrl+Enter)…"
          rows={2}
        />
        <button
          type="button"
          className="simulated-transcript-send"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send utterance"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
