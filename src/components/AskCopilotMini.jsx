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
  const abortRef = useRef(null);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);

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
        logEntry(LOG_TYPES.COPILOT_MSG, "warn", "Could not reach copilot service.", {
          source: "mini-float",
        });
        return;
      }

      const data = await response.json();
      const raw =
        data?.content?.[0]?.text ||
        data?.completion ||
        data?.choices?.[0]?.message?.content ||
        "";

      if (raw) {
        logEntry(LOG_TYPES.COPILOT_MSG, "info", `Q&A: ${q} → ${raw}`, {
          source: "mini-float",
        });
      } else {
        logEntry(LOG_TYPES.COPILOT_MSG, "warn", "No response received.", {
          source: "mini-float",
        });
      }
      setQuestion("");
    } catch (err) {
      if (err.name === "AbortError") return;
      logEntry(LOG_TYPES.COPILOT_MSG, "warn", "Could not reach copilot service.", {
        source: "mini-float",
      });
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
    <div className="ask-copilot-mini">
      <div
        className="ask-copilot-mini__form"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          className="ask-copilot-mini__input"
          placeholder="Ask Co-Pilot..."
          disabled={loading}
        />
        <button
          className="ask-copilot-mini__send"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: loading ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
          aria-label="Send"
        >
          {loading ? (
            <Loader2 size={11} style={{ animation: "eg-spin 1s linear infinite" }} />
          ) : (
            <Send size={11} />
          )}
        </button>
      </div>
      <style>{`@keyframes eg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});

export default AskCopilotMini;
