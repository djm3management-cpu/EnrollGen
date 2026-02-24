import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { SECTION_LABELS } from "../context/scriptReducer";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
/**
 * ScriptPrompter — AI Script Prompter with Speech Recognition
 *
 * Drop into: src/components/ScriptPrompter.jsx
 * Then import in ScriptFlow.jsx and render above the sections:
 *
 *   import ScriptPrompter from "./ScriptPrompter";
 *   // inside return, after <MainTimer>:
 *   <ScriptPrompter />
 */

const COACHING_DEBOUNCE_MS = 6000; // wait 6s of silence before analyzing
const COACHING_COOLDOWN_MS = 20000; // minimum 20s between AI messages
const MIN_NEW_CHARS = 120; // need at least ~120 new chars since last analysis

/* ── level → style map ── */
const LEVEL_STYLE = {
  info: {
    icon: "💡",
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.08)",
    border: "rgba(56,189,248,0.25)",
  },
  remind: {
    icon: "🔔",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.25)",
  },
  tip: {
    icon: "✅",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.25)",
  },
  warn: {
    icon: "⚠️",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.35)",
  },
  critical: {
    icon: "🚨",
    color: "#f87171",
    bg: "rgba(248,113,113,0.1)",
    border: "rgba(248,113,113,0.5)",
  },
};

const ScriptPrompter = memo(function ScriptPrompter() {
  const { activeSection } = useScript();
  const { logEntry } = useCopilotLog();
  const currentStep =
    SECTION_LABELS[activeSection] || `Section ${activeSection}`;

  /* ═══════ speech recognition ═══════ */
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef(null);
  const transcriptRef = useRef(""); // always current for async callbacks

  /* ═══════ AI assistant feed ═══════ */
  const [messages, setMessages] = useState([]); // [{id, level, text, ts}]
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [floatingAlert, setFloatingAlert] = useState(null); // {level, text}
  const debounceRef = useRef(null);
  const floatTimeout = useRef(null);
  const feedRef = useRef(null);
  const lastCoachingTime = useRef(0); // timestamp of last AI response
  const lastAnalyzedLength = useRef(0); // transcript length at last analysis

  /* ═══════ teleprompter ═══════ */
  const [scriptText, setScriptText] = useState("");
  const prompterRef = useRef(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  /* ═══════ collapsible ═══════ */
  const [expanded, setExpanded] = useState(true);

  /* ═══════ script file loader ═══════ */
  const handleScriptFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setScriptText(ev.target.result);
    reader.readAsText(file);
  };

  /* ─── keep transcriptRef in sync ─── */
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  /* ─── browser support ─── */
  const supportsRecognition =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /* ─── start / stop ─── */
  const startListening = useCallback(() => {
    if (!supportsRecognition) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let processedUpTo = 0;

    recognition.onresult = (event) => {
      let newFinal = "";
      let interim = "";
      for (let i = processedUpTo; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          newFinal += r[0].transcript + " ";
          processedUpTo = i + 1;
        } else interim += r[0].transcript;
      }
      if (newFinal) {
        setTranscript((prev) => prev + newFinal);
        setInterimText("");
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(
          () => requestCoaching(),
          COACHING_DEBOUNCE_MS
        );
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      if (e.error !== "no-speech") setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          /* already running */
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [supportsRecognition]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  /* ─── auto-scroll feed ─── */
  useEffect(() => {
    if (feedRef.current)
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  /* ─── script highlighting ─── */
  const scriptLines = scriptText
    ? scriptText.split("\n").filter((l) => l.trim())
    : [];

  useEffect(() => {
    if (!transcript || scriptLines.length === 0) return;
    const spoken = transcript
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .slice(-10)
      .join(" ");
    let bestIdx = -1,
      bestScore = 0;
    scriptLines.forEach((line, idx) => {
      const score = line
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => spoken.includes(w)).length;
      if (score > bestScore && score >= 3) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      setHighlightIdx(bestIdx);
      prompterRef.current?.children[bestIdx]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [transcript, scriptLines.length]);

  /* ─── show floating alert for warn/critical ─── */
  const showFloat = useCallback(
    (level, text) => {
      if (level !== "warn" && level !== "critical") return;
      clearTimeout(floatTimeout.current);
      setFloatingAlert({ level, text });
      // Log floating alert to transcript
      logEntry(LOG_TYPES.FLOATING_ALERT, level, text, { section: currentStep });
      floatTimeout.current = setTimeout(
        () => setFloatingAlert(null),
        level === "critical" ? 10000 : 6000
      );
    },
    [logEntry, currentStep]
  );

  /* ─── AI co-pilot ─── */
  const requestCoaching = useCallback(async () => {
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) return;

    // ── Cooldown: don't fire if we responded recently ──
    const now = Date.now();
    if (now - lastCoachingTime.current < COACHING_COOLDOWN_MS) return;

    // ── Minimum new content: skip if agent hasn't said enough new stuff ──
    const newChars = fullTranscript.length - lastAnalyzedLength.current;
    if (newChars < MIN_NEW_CHARS) return;

    setCoachingLoading(true);
    lastAnalyzedLength.current = fullTranscript.length;

    const systemPrompt = `You are a compliance-focused co-pilot for a Medicare insurance agent at New Gen Health Solutions. You monitor a LIVE enrollment call in real time.

════════════════════════════════════════════════════════
CRITICAL AUDIO CONSTRAINT — READ THIS CAREFULLY
════════════════════════════════════════════════════════
You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words. You CANNOT hear the client/beneficiary AT ALL. You have ZERO visibility into what the client says.

What this means for you:
- You can ONLY judge compliance based on what the AGENT said or failed to say
- If the agent repeats something back (e.g. "So your Part B started in March 2010..."), that tells you what the client likely said — but you are evaluating the AGENT, not the client
- NEVER flag things like "the client didn't give consent" — you can't hear them
- Instead flag things like "I didn't hear you read the recording disclosure yet" or "Make sure you ask for verbal consent"
- When the agent paraphrases or confirms client info back to them, that's good practice — acknowledge it specifically

════════════════════════════════════════════════════════
YOUR PRIMARY OBJECTIVE: COMPLIANCE MONITORING
════════════════════════════════════════════════════════
Your #1 job is catching compliance issues. You are NOT a chatbot. You are NOT here to comment on everything the agent says. You are a silent compliance monitor who ONLY speaks up when:

1. **The agent missed a required disclosure** — they skipped something legally required for this section
2. **The agent said something non-compliant** — they made a promise they can't make, gave wrong info, or violated CMS rules
3. **The agent is about to move on without completing a requirement** — they're wrapping up the section but forgot a key item
4. **The agent did something notably well** — OCCASIONALLY (not every time) give brief positive reinforcement

If the agent is doing fine and following the script correctly, DO NOT RESPOND. Stay silent. No "keep going" or "sounds good" filler. Silence means everything is fine.

════════════════════════════════════════════════════════
CURRENT SECTION: "${currentStep}"
════════════════════════════════════════════════════════

Section-specific compliance requirements to monitor:
- Recording Disclosure: Agent must state they are a licensed agent, state they are on a recorded line, ask for permission to continue
- TPMO Disclaimer: Agent must read the full TPMO disclaimer, collect ZIP code, provide org/plan counts for their area
- SNP Disclosure: If applicable, agent must verify Medicaid/chronic condition eligibility, read SNP-specific disclosure
- POA & Scope of Appointment: Agent must list ALL available product types (MA, Med Supp, PDP, ancillary), get verbal consent for which to discuss
- Qualifications: Agent must verify Part A/B dates, check for employer coverage, VA benefits, Medicaid status, confirm enrollment period eligibility
- NEADS Assessment: Agent must assess doctors, medications, pharmacy preference, specialists, current coverage gaps
- Plan Selection & SOB: Agent must present plan details, state MOOP, review formulary, compare to current coverage, explain network type
- Enrollment: Agent must state full plan name and contract number, get separate verbal confirmations, state effective date, read enrollment disclaimers
- Wrap-Up: Agent must set mail expectations, provide member services number, reinforce the decision, offer ancillary products ONLY after MA enrollment is complete

════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════
Respond ONLY with a JSON object — no extra text, no markdown:
{
  "level": "silent | info | remind | tip | warn | critical",
  "message": "Your message here — or empty string if silent."
}

LEVEL GUIDE:
- **silent**: Nothing to flag. Agent is doing fine. USE THIS MOST OF THE TIME. This is your default.
- **info**: A helpful observation or next-step suggestion — use sparingly, only when genuinely useful
- **remind**: The agent needs to say or do something specific that they haven't done yet in this section
- **tip**: Positive reinforcement — the agent nailed a key disclosure or handled something well. Be SPECIFIC about what they did well. Use this occasionally, NOT after every statement.
- **warn**: The agent missed something they were supposed to say, or made an error that needs correcting
- **critical**: The agent said something non-compliant, skipped a legally required disclosure, or made a statement that could result in a CMS violation

WHEN YOU DO RESPOND (non-silent), your message MUST:
- Reference SPECIFIC words or phrases the agent actually said (e.g. "You said 'this plan will save you money' — be careful, you can't guarantee savings...")
- Be 2-4 sentences for warn/critical levels so the agent understands exactly what happened and what to do
- Be 1-2 sentences for tip/info/remind levels
- Never be generic. Never say "keep it up" or "sounds good" without referencing what specifically was good
- For warn/critical: tell the agent exactly what to say to fix it RIGHT NOW

EXAMPLES OF GOOD RESPONSES:
- tip: "Nice job reading back their Part B date to confirm — that's exactly the verification CMS wants to see."
- warn: "You mentioned the plan has dental coverage but didn't specify whether it's comprehensive or preventive-only. Clarify: 'This plan includes preventive dental — cleanings, X-rays, and exams. Comprehensive dental like crowns or root canals would be separate.'"
- critical: "You said 'this plan is better than what you have' — that's a comparative statement you can't make without presenting both plans side by side. Walk it back: 'Let me show you exactly how this plan compares to your current coverage so you can decide.'"
- remind: "You haven't asked about their pharmacy preference yet. Before moving to plan selection, ask: 'Which pharmacy do you usually go to for your prescriptions?'"
- silent response: {"level": "silent", "message": ""}

EXAMPLES OF BAD RESPONSES (never do these):
- "Great job, keep going!" (too generic, no reference to what was said)
- "The agent is doing well in this section." (you're talking TO the agent, not about them)
- "Make sure the client understands." (you can't hear the client)
- Any response when the agent is simply doing their job correctly (use silent instead)

Remember: You are a compliance safety net, not a play-by-play commentator. Silence is your default state. Only break silence when it genuinely matters.`;

    try {
      const response = await fetch("/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 300,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `AGENT-ONLY transcript (you CANNOT hear the client — only the agent's words appear below):\n\n"${fullTranscript.slice(
                -2000
              )}"`,
            },
          ],
        }),
      });
      const data = await response.json();
      const raw = data.content
        ?.map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("")
        .trim();

      let level = "info",
        message = "";
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        level = parsed.level || "info";
        message = parsed.message || "";
      } catch {
        message = raw || "";
      }

      // ── If the AI chose "silent" or returned empty, skip display entirely ──
      if (level === "silent" || !message || !message.trim()) {
        // No intervention needed — agent is doing fine
        lastCoachingTime.current = Date.now();
        setCoachingLoading(false);
        return;
      }

      lastCoachingTime.current = Date.now();

      if (message) {
        const entry = {
          id: Date.now(),
          level,
          text: message,
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev.slice(-19), entry]); // keep last 20
        showFloat(level, message);
        // Log co-pilot message to transcript
        logEntry(LOG_TYPES.COPILOT_MSG, level, message, {
          section: currentStep,
        });
      }
    } catch (err) {
      console.error("Coaching API error:", err);
    } finally {
      setCoachingLoading(false);
    }
  }, [currentStep, coachingLoading, showFloat, logEntry]);

  const clearTranscript = () => {
    setTranscript("");
    setInterimText("");
    setHighlightIdx(-1);
    setMessages([]);
    setFloatingAlert(null);
    lastCoachingTime.current = 0;
    lastAnalyzedLength.current = 0;
  };

  /* ═══════ RENDER ═══════ */
  return (
    <>
      {/* ── Floating Alert ── */}
      {floatingAlert &&
        (() => {
          const s = LEVEL_STYLE[floatingAlert.level] || LEVEL_STYLE.info;
          return (
            <div
              onClick={() => setFloatingAlert(null)}
              style={{
                position: "fixed",
                top: 80,
                right: 20,
                zIndex: 9999,
                maxWidth: 380,
                width: "auto",
                background: s.bg,
                border: `2px solid ${s.border}`,
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                animation: "slideDown 0.25s ease",
              }}
            >
              <span style={{ fontSize: "1.3em", lineHeight: 1 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "0.7em",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: s.color,
                    marginBottom: 3,
                  }}
                >
                  {floatingAlert.level.toUpperCase()} — tap to dismiss
                </div>
                <div
                  style={{
                    fontSize: "0.9em",
                    color: "#e8edf5",
                    lineHeight: 1.4,
                  }}
                >
                  {floatingAlert.text}
                </div>
              </div>
            </div>
          );
        })()}

      <section className="card prompter-card">
        {/* Header */}
        <div className="prompter-header" onClick={() => setExpanded((p) => !p)}>
          <div className="prompter-header-left">
            <span className="prompter-mic-icon">{listening ? "🔴" : "⎇"}</span>
            <div>
              <h2 style={{ margin: 0 }}>AI Co-Pilot</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {currentStep} · Real-time assistant
              </span>
            </div>
          </div>
          <span className="prompter-toggle">{expanded ? "▲" : "▼"}</span>
        </div>

        {expanded && (
          <div className="prompter-body">
            {/* Controls */}
            <div className="prompter-controls">
              <button
                className="primary prompter-listen-btn"
                onClick={listening ? stopListening : startListening}
                disabled={!supportsRecognition}
                style={{
                  background: listening ? "#e74c3c" : "#2ecc71",
                  color: "#fff",
                  borderColor: listening ? "#c0392b" : "#27ae60",
                }}
              >
                {!supportsRecognition
                  ? "Browser Not Supported"
                  : listening
                  ? "■  Stop Listening"
                  : "●  Start Listening"}
              </button>
              <button className="primary" onClick={clearTranscript}>
                Clear
              </button>
              <button
                className="primary"
                disabled={!transcript.trim() || coachingLoading}
                onClick={requestCoaching}
              >
                {coachingLoading ? "Thinking…" : "Ask Co-Pilot"}
              </button>
            </div>

            {/* Script file loader */}
            {scriptLines.length === 0 && (
              <div style={{ margin: "8px 0" }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Load a .txt script for teleprompter mode:
                </span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleScriptFile}
                  style={{ fontSize: 12, marginTop: 4, display: "block" }}
                />
              </div>
            )}

            {/* Teleprompter */}
            {scriptLines.length > 0 && (
              <div className="prompter-teleprompter" ref={prompterRef}>
                {scriptLines.map((line, i) => (
                  <p
                    key={i}
                    className={
                      "prompter-line" +
                      (i === highlightIdx ? " prompter-line-active" : "") +
                      (i < highlightIdx ? " prompter-line-past" : "")
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Live Transcript */}
            <div className="prompter-transcript">
              <div className="prompter-section-label">Live Transcript</div>
              <div className="prompter-transcript-text">
                {transcript || (
                  <span style={{ opacity: 0.4 }}>
                    {listening
                      ? "Listening… start speaking"
                      : "Press Start Listening to begin"}
                  </span>
                )}
                {interimText && (
                  <span className="prompter-interim"> {interimText}</span>
                )}
              </div>
            </div>

            {/* AI Co-Pilot Feed */}
            <div className="prompter-coaching">
              <div
                className="prompter-section-label"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                AI Co-Pilot
                {coachingLoading && (
                  <span
                    className="prompter-pulse"
                    style={{ fontSize: "0.7em" }}
                  >
                    ● thinking…
                  </span>
                )}
              </div>
              <div
                ref={feedRef}
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  paddingTop: 4,
                }}
              >
                {messages.length === 0 && (
                  <span style={{ opacity: 0.4, fontSize: "0.85em" }}>
                    Co-pilot will give reminders and suggestions as you speak…
                  </span>
                )}
                {messages.map((msg) => {
                  const s = LEVEL_STYLE[msg.level] || LEVEL_STYLE.info;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                        borderRadius: 6,
                        padding: "7px 10px",
                        animation: "fadeIn 0.2s ease",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1em",
                          lineHeight: 1.4,
                          flexShrink: 0,
                        }}
                      >
                        {s.icon}
                      </span>
                      <div style={{ flex: 1 }}>
                        <span
                          style={{
                            fontSize: "0.85em",
                            color: "#e8edf5",
                            lineHeight: 1.4,
                          }}
                        >
                          {msg.text}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.65em",
                          color: "#5a6a80",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {msg.ts}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
});

export default ScriptPrompter;
