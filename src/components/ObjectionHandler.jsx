import { useState, useRef } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";

const QUICK_OBJECTIONS = [
  { label: "Not interested", text: "I'm not interested" },
  { label: "Already have a plan", text: "I already have coverage" },
  { label: "Happy with current plan", text: "I'm happy with what I have" },
  { label: "Can't afford it", text: "I can't afford a new plan" },
  { label: "Doctor not in network", text: "My doctor isn't in network" },
  { label: "Don't want to be recorded", text: "I don't want to be recorded" },
  { label: "Has VA benefits", text: "I have VA benefits already" },
  { label: "Spouse handles insurance", text: "My spouse handles all this" },
  { label: "Call back later", text: "Can you call me back another time?" },
  { label: "Worried about scam", text: "How do I know this isn't a scam?" },
];

export default function ObjectionHandler() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const { logEntry } = useCopilotLog();

  const handleSubmit = async (objectionText) => {
    const text = objectionText || input.trim();
    if (!text || loading) return;

    setLoading(true);
    setResponse(null);

    try {
      const resp = await fetch("/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 300,
          system: `You are a live call coach for Medicare insurance agents at New Gen Health Solutions.
An agent is on a call right now and needs an exact rebuttal to say to the client.

Respond with ONLY a valid JSON object — no extra text, no markdown:
{
  "rebuttal": "The exact word-for-word sentence the agent should say right now.",
  "followup": "A follow-up question to re-engage the client after the rebuttal.",
  "tip": "One quick tactical note for the agent (not for the client)."
}

Rules:
- "rebuttal" must be warm, natural, conversational — not robotic or salesy
- "rebuttal" should acknowledge the objection before pivoting
- "followup" should be an open-ended question that gets them talking
- "tip" is private coaching for the agent — short, under 10 words
- No markdown, no asterisks, plain text only`,
          messages: [
            {
              role: "user",
              content: `Client just said: "${text}"`,
            },
          ],
        }),
      });

      const data = await resp.json();
      const raw = data.content
        ?.map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("")
        .trim();

      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        setResponse(parsed);
        setHistory((prev) => [
          { objection: text, ...parsed },
          ...prev.slice(0, 4),
        ]);
        setInput("");
        // Log objection + rebuttal to transcript
        logEntry(LOG_TYPES.OBJECTION, "info", parsed.rebuttal, {
          objection: text,
          followup: parsed.followup,
          agentTip: parsed.tip,
        });
      } catch {
        setResponse({ rebuttal: raw, followup: null, tip: null });
        // Log fallback rebuttal
        logEntry(LOG_TYPES.OBJECTION, "info", raw || "Fallback rebuttal used", {
          objection: text,
        });
      }
    } catch (err) {
      console.error("ObjectionHandler error:", err);
      const fallbackRebuttal =
        "I understand completely. Can I ask — what would make this worth a few more minutes of your time?";
      setResponse({
        rebuttal: fallbackRebuttal,
        followup: null,
        tip: null,
      });
      logEntry(LOG_TYPES.OBJECTION, "warn", fallbackRebuttal, {
        objection: text,
        error: true,
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="objection-handler">
      <div className="objection-handler-header">
        <span className="objection-handler-icon">🗣️</span>
        <div>
          <h3 style={{ margin: 0, fontSize: "1em" }}>Objection Handler</h3>
          <span style={{ fontSize: "0.75em", opacity: 0.6 }}>
            Type what the client said → get exact rebuttal
          </span>
        </div>
      </div>

      {/* Quick Objection Buttons */}
      <div className="objection-quick-btns">
        {QUICK_OBJECTIONS.map((obj) => (
          <button
            key={obj.label}
            className="objection-quick-btn"
            onClick={() => handleSubmit(obj.text)}
            disabled={loading}
          >
            {obj.label}
          </button>
        ))}
      </div>

      {/* Custom Input */}
      <div className="objection-input-row">
        <input
          ref={inputRef}
          type="text"
          className="input-dark objection-input"
          placeholder='Or type what the client said... e.g. "My son handles my insurance"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={loading}
        />
        <button
          className="primary objection-submit-btn"
          onClick={() => handleSubmit()}
          disabled={loading || !input.trim()}
        >
          {loading ? "⏳" : "→"}
        </button>
      </div>

      {/* Response */}
      {loading && (
        <div className="objection-loading">
          <span className="prompter-pulse">●</span> Getting rebuttal...
        </div>
      )}

      {response && !loading && (
        <div className="objection-response">
          {/* Main Rebuttal */}
          <div className="objection-rebuttal">
            <div className="objection-rebuttal-label">💬 SAY THIS</div>
            <p className="objection-rebuttal-text">"{response.rebuttal}"</p>
          </div>

          {/* Follow-up */}
          {response.followup && (
            <div className="objection-followup">
              <div className="objection-followup-label">↩ THEN ASK</div>
              <p className="objection-followup-text">"{response.followup}"</p>
            </div>
          )}

          {/* Agent Tip */}
          {response.tip && (
            <div className="objection-tip">
              <span className="objection-tip-label">🎯 AGENT TIP: </span>
              {response.tip}
            </div>
          )}

          {/* Copy button */}
          <button
            className="objection-copy-btn"
            onClick={() =>
              navigator.clipboard.writeText(
                response.rebuttal +
                  (response.followup ? " " + response.followup : "")
              )
            }
          >
            📋 Copy
          </button>
        </div>
      )}

      {/* Recent History */}
      {history.length > 1 && (
        <div className="objection-history">
          <div className="objection-history-label">Recent</div>
          {history.slice(1).map((item, i) => (
            <div
              key={i}
              className="objection-history-item"
              onClick={() => setResponse(item)}
            >
              <span className="objection-history-q">"{item.objection}"</span>
              <span className="objection-history-arrow">→</span>
              <span className="objection-history-a">
                "{item.rebuttal.slice(0, 50)}..."
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
