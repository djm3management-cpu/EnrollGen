import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useScript } from "../context/ScriptContext";
import { SECTION_LABELS } from "../context/scriptReducer";

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

const COACHING_DEBOUNCE_MS = 3500;

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
  const showFloat = useCallback((level, text) => {
    if (level !== "warn" && level !== "critical") return;
    clearTimeout(floatTimeout.current);
    setFloatingAlert({ level, text });
    floatTimeout.current = setTimeout(
      () => setFloatingAlert(null),
      level === "critical" ? 10000 : 6000
    );
  }, []);

  /* ─── AI co-pilot ─── */
  const requestCoaching = useCallback(async () => {
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) return;
    setCoachingLoading(true);

    const systemPrompt = `You are a helpful real-time co-pilot assistant for a Medicare insurance agent at New Gen Health Solutions. You are listening to the live call transcript and your job is to proactively help the agent — like a knowledgeable colleague whispering in their ear.

Current section: "${currentStep}"

Your job is to:
- Remind the agent of things they might forget (callback number, spelling of name, pharmacy preference, etc.)
- Flag things the client said that need action (mentioned a specialist, said they travel, mentioned Tricare, said they have a spouse, etc.)
- Warn if something compliance-critical is happening or was missed
- Give encouragement and positive reinforcement when things are going well
- Suggest the next natural thing to ask or say
- Keep the agent moving forward without rushing

Respond ONLY with a JSON object — no extra text:
{
  "level": "info | remind | tip | warn | critical",
  "message": "Short, conversational message. Max 2 sentences. No markdown."
}

Level guide:
- info: general helpful observation or next step suggestion
- remind: something specific the agent should do or ask right now
- tip: positive reinforcement or a good technique to use
- warn: something was missed or needs attention soon
- critical: compliance issue that needs immediate action (wrong wording, disqualifying coverage mentioned, no consent given, etc.)

Be like a helpful colleague, not a compliance robot. Be warm, specific, and practical.`;

    try {
      const response = await fetch("/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 150,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Full transcript so far:\n"${fullTranscript.slice(
                -1200
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
        message = raw || "Keep going — you're doing great!";
      }

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
      }
    } catch (err) {
      console.error("Coaching API error:", err);
    } finally {
      setCoachingLoading(false);
    }
  }, [currentStep, coachingLoading, showFloat]);

  const clearTranscript = () => {
    setTranscript("");
    setInterimText("");
    setHighlightIdx(-1);
    setMessages([]);
    setFloatingAlert(null);
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
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 9999,
                maxWidth: 480,
                width: "90%",
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
                {currentStep} · Live transcript + real-time assistant
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
