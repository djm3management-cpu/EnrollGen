import { useState, useRef, useEffect, useCallback, memo } from "react";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";

function levelColor(level) {
  if (level === "critical") return "#ef4444";
  if (level === "warn") return "#f97316";
  if (level === "remind") return "#fbbf24";
  if (level === "tip") return "#34d399";
  return "#94a3b8";
}

const CopilotMiniFloat = memo(function CopilotMiniFloat() {
  const { entries, logEntry } = useCopilotLog();
  const { getToken } = useAppAuth();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const feedRef = useRef(null);
  const abortRef = useRef(null);

  // Show last 5 copilot messages
  const recentEntries = entries
    .filter((e) => e.logType === LOG_TYPES.COPILOT_MSG)
    .slice(-5);

  // Auto-scroll feed on new entries
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [recentEntries.length]);

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
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 16,
        padding: "10px 12px 12px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 10px 24px rgba(0, 0, 0, 0.36)",
        width: 230,
        marginBottom: 8,
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <MessageSquare size={12} style={{ color: "#a855f7" }} />
        <span
          style={{
            fontSize: "0.68em",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#a855f7",
          }}
        >
          Co-Pilot
        </span>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        style={{
          maxHeight: 120,
          overflowY: "auto",
          marginBottom: 8,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.08) transparent",
        }}
      >
        {recentEntries.length === 0 && !answer && (
          <div
            style={{
              fontSize: "0.6em",
              color: "#475569",
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            No copilot messages yet
          </div>
        )}
        {recentEntries.map((entry) => {
          const msg =
            entry.message?.length > 120
              ? entry.message.slice(0, 117) + "…"
              : entry.message;
          return (
            <div
              key={entry.id}
              style={{
                fontSize: "0.58em",
                color: "#94a3b8",
                marginBottom: 4,
                lineHeight: 1.4,
                display: "flex",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 4,
                  minWidth: 4,
                  borderRadius: 2,
                  background: levelColor(entry.level),
                  flexShrink: 0,
                  marginTop: 2,
                  alignSelf: "stretch",
                }}
              />
              <span>{msg}</span>
            </div>
          );
        })}
        {answer && (
          <div
            style={{
              fontSize: "0.58em",
              color: "#c4b5fd",
              marginBottom: 4,
              lineHeight: 1.4,
              display: "flex",
              gap: 5,
              background: "rgba(168,85,247,0.06)",
              borderRadius: 6,
              padding: "4px 6px",
            }}
          >
            <span
              style={{
                width: 4,
                minWidth: 4,
                borderRadius: 2,
                background: "#a855f7",
                flexShrink: 0,
                marginTop: 2,
                alignSelf: "stretch",
              }}
            />
            <span>{answer}</span>
          </div>
        )}
      </div>

      {/* Ask input */}
      <div
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
          placeholder="Ask Co-Pilot…"
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

export default CopilotMiniFloat;
