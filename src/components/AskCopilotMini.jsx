import { useState, useRef, useCallback, memo } from "react";
import { Send, Loader2 } from "lucide-react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";

const AskCopilotMini = memo(function AskCopilotMini() {
  const { logEntry } = useCopilotLog();
  const { getToken } = useAppAuth();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const abortRef = useRef(null);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setAnswer(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          system: "You are a helpful Medicare enrollment copilot assistant. Give concise, actionable answers to agent questions. Keep responses under 3 sentences. CRITICAL FORMATTING: Use PLAIN TEXT ONLY. No dashes, no bullet points, no asterisks, no bold, no markdown, no emojis, no special characters. Write in natural conversational sentences the agent can read at a glance. Separate thoughts with periods, never with dashes or symbols.",
          messages: [{ role: "user", content: q }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        setAnswer("Could not reach copilot service.");
        return;
      }

      const data = await response.json();
      const raw =
        data?.content?.[0]?.text ||
        data?.completion ||
        data?.choices?.[0]?.message?.content ||
        "";

      if (raw) {
        setAnswer(raw);
        logEntry(LOG_TYPES.COPILOT_MSG, "info", `Q&A: ${q} → ${raw}`, {
          source: "mini-float",
        });
      } else {
        setAnswer("No response received.");
      }
      setQuestion("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setAnswer("Could not reach copilot service.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }, [question, loading, getToken, logEntry]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAsk();
      }
    },
    [handleAsk]
  );

  return (
    <div className="ask-copilot-mini" style={{ padding: "6px 10px 8px" }}>
      {/* Answer area */}
      {answer && (
        <div
          className="right-rail-scroll ask-copilot-mini__answer-scroll"
          style={{
            maxHeight: 110,
            overflowY: "auto",
            marginBottom: 8,
          }}
        >
          <div
            className="ask-copilot-mini__answer"
            style={{
              fontSize: "0.62rem",
              color: "#c4b5fd",
              lineHeight: 1.5,
              background: "rgba(168,85,247,0.06)",
              borderRadius: 6,
              padding: "5px 7px",
            }}
          >
            {answer}
          </div>
        </div>
      )}

      {/* Ask input */}
      <div
        className="ask-copilot-mini__form"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "4px 6px 4px 10px",
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          className="ask-copilot-mini__input"
          placeholder="Ask Co-Pilot..."
          disabled={loading}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontSize: "0.62em",
            fontFamily: "'Inter', sans-serif",
            padding: "4px 0",
          }}
        />
        <button
          className="ask-copilot-mini__send"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          style={{
            background: loading
              ? "rgba(168,85,247,0.15)"
              : "rgba(168,85,247,0.25)",
            border: "none",
            borderRadius: 7,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          {loading ? (
            <Loader2
              size={11}
              style={{ color: "#a855f7", animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Send size={11} style={{ color: "#a855f7" }} />
          )}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});

export default AskCopilotMini;
