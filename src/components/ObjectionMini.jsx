import { useState, useRef, useCallback, memo } from "react";
import { Send, Loader2, ShieldAlert } from "lucide-react";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";

const SYSTEM_PROMPT = `You are an expert Medicare enrollment objection handler. An agent is on a live call and a beneficiary has raised an objection or concern. Give a concise, compliant rebuttal the agent can use immediately.

Rules:
Keep responses under 3 sentences. The agent needs to respond fast.
Never make guarantees about coverage or costs.
Stay CMS-compliant. No misleading statements.
Be empathetic but redirect toward the value of reviewing options.
If the objection is about a specific plan feature, suggest the agent confirm details with the beneficiary.

CRITICAL FORMATTING: Use PLAIN TEXT ONLY. No dashes, no bullet points, no asterisks, no bold, no markdown, no emojis, no special characters. Write in natural conversational sentences the agent can read aloud or reference at a glance. Separate thoughts with periods or new sentences, never with dashes or symbols.`;

const ObjectionMini = memo(function ObjectionMini() {
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
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Beneficiary objection: "${q}"` }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        setAnswer("Could not reach objection service.");
        return;
      }

      const data = await response.json();
      const raw =
        data?.content?.[0]?.text ||
        data?.completion ||
        data?.choices?.[0]?.message?.content ||
        "";

      setAnswer(raw || "No response received.");
      setQuestion("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setAnswer("Could not reach objection service.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }, [question, loading, getToken]);

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
        <ShieldAlert size={12} style={{ color: "#f97316" }} />
        <span
          style={{
            fontSize: "0.68em",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#f97316",
          }}
        >
          Objections
        </span>
      </div>

      {/* Answer area */}
      {answer && (
        <div
          style={{
            maxHeight: 120,
            overflowY: "auto",
            marginBottom: 8,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.08) transparent",
          }}
        >
          <div
            style={{
              fontSize: "0.58em",
              color: "#fed7aa",
              lineHeight: 1.5,
              background: "rgba(249,115,22,0.06)",
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
          placeholder="What's the objection?"
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
              ? "rgba(249,115,22,0.15)"
              : "rgba(249,115,22,0.25)",
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
              style={{ color: "#f97316", animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Send size={11} style={{ color: "#f97316" }} />
          )}
        </button>
      </div>
    </div>
  );
});

export default ObjectionMini;
