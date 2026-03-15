/*
  Custom hook for the Objection Handler AI coach.
  Manages objection submission, response parsing, and history.
*/

import { useState, useRef, useCallback } from "react";
import { useAppAuth } from "../context/AuthContext";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { useScript } from "../context/ScriptContext";
import { SECTION_LABELS } from "../context/scriptReducer";

function buildSystemPrompt(currentSection, state) {
  return `You are a live call coach for Medicare insurance agents at New Gen Health Solutions.
An agent is on a call right now and needs an exact rebuttal to say to the client.

CALL CONTEXT (use this to tailor your response):
- Current section: "${currentSection}"
- Plan being discussed: ${state.notes?.planName || "not yet selected"}
- Plan type / SNP: ${state.snpType || "standard MA"}
- Agent name: ${state.agentName || "not set"}

Respond with ONLY a valid JSON object — no extra text, no markdown:
{
  "rebuttal": "The exact word-for-word sentence the agent should say right now.",
  "followup": "A follow-up question to re-engage the client after the rebuttal.",
  "tip": "One quick tactical note for the agent (not for the client)."
}

Rules:
- Tailor the rebuttal to the current section and plan context — not a generic response
- "rebuttal" must be warm, natural, conversational — not robotic or salesy
- "rebuttal" should acknowledge the objection before pivoting
- "followup" should be an open-ended question that gets them talking
- "tip" is private coaching for the agent — short, under 10 words
- No markdown, no asterisks, plain text only`;
}

const FALLBACK_REBUTTAL =
  "I understand completely. Can I ask — what would make this worth a few more minutes of your time?";

export function useObjectionHandler() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const { logEntry } = useCopilotLog();
  const { getToken } = useAppAuth();
  const { state, activeSection } = useScript();
  const currentSection = SECTION_LABELS[activeSection] || `Section ${activeSection}`;

  const handleSubmit = useCallback(
    async (objectionText) => {
      const text = objectionText || input.trim();
      if (!text || loading) return;

      setLoading(true);
      setResponse(null);

      try {
        const resp = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 350,
            system: buildSystemPrompt(currentSection, state),
            messages: [{ role: "user", content: `Client just said: "${text}"` }],
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
          setHistory((prev) => [{ objection: text, ...parsed }, ...prev.slice(0, 4)]);
          setInput("");
          logEntry(LOG_TYPES.OBJECTION, "info", parsed.rebuttal, {
            objection: text,
            followup: parsed.followup,
            agentTip: parsed.tip,
          });
        } catch {
          setResponse({ rebuttal: raw, followup: null, tip: null });
          logEntry(LOG_TYPES.OBJECTION, "info", raw || "Fallback rebuttal used", {
            objection: text,
          });
        }
      } catch (err) {
        console.error("ObjectionHandler error:", err);
        setResponse({ rebuttal: FALLBACK_REBUTTAL, followup: null, tip: null });
        logEntry(LOG_TYPES.OBJECTION, "warn", FALLBACK_REBUTTAL, {
          objection: text,
          error: true,
        });
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, getToken, currentSection, state, logEntry]
  );

  const copyRebuttal = useCallback(() => {
    if (!response) return;
    navigator.clipboard.writeText(
      response.rebuttal + (response.followup ? " " + response.followup : "")
    );
  }, [response]);

  return {
    input,
    setInput,
    response,
    setResponse,
    loading,
    history,
    inputRef,
    handleSubmit,
    copyRebuttal,
  };
}
