import { SendHorizontal } from "lucide-react";

export function ObjectionInput({ input, setInput, onSubmit, loading, inputRef }) {
  return (
    <div className="objection-input-row">
      <input
        ref={inputRef}
        type="text"
        className="input-dark objection-input"
        placeholder='Or type what the client said... e.g. "My son handles my insurance"'
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        disabled={loading}
      />
      <button
        className="primary objection-submit-btn"
        onClick={() => onSubmit()}
        disabled={loading || !input.trim()}
      >
        {loading ? "..." : <SendHorizontal size={15} />}
      </button>
    </div>
  );
}
