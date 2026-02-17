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

const COACHING_DEBOUNCE_MS = 4000;

const ScriptPrompter = memo(function ScriptPrompter() {
  const { activeSection } = useScript();
  const currentStep =
    SECTION_LABELS[activeSection] || `Section ${activeSection}`;

  /* ═══════ speech recognition ═══════ */
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef(null);

  /* ═══════ AI coaching ═══════ */
  const [coaching, setCoaching] = useState(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const debounceRef = useRef(null);

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

    let processedUpTo = 0; // track which results we've already added

    recognition.onresult = (event) => {
      let newFinal = "";
      let interim = "";
      for (let i = processedUpTo; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          newFinal += r[0].transcript + " ";
          processedUpTo = i + 1; // mark as processed
        } else {
          interim += r[0].transcript;
        }
      }
      if (newFinal) {
        setTranscript((prev) => prev + newFinal);
        setInterimText("");
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(
          () => requestCoaching(newFinal),
          COACHING_DEBOUNCE_MS
        );
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      if (e.error !== "no-speech") setListening(false);
    };

    // auto-restart (Chrome stops after ~60 s silence)
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
    let bestIdx = -1;
    let bestScore = 0;
    scriptLines.forEach((line, idx) => {
      const words = line.toLowerCase().split(/\s+/);
      const score = words.filter((w) => spoken.includes(w)).length;
      if (score > bestScore && score >= 3) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      setHighlightIdx(bestIdx);
      if (prompterRef.current?.children[bestIdx]) {
        prompterRef.current.children[bestIdx].scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [transcript, scriptLines.length]);

  /* ─── AI coaching ─── */
  const requestCoaching = async (recentSpeech) => {
    if (!recentSpeech.trim()) return;
    setCoachingLoading(true);

    const systemPrompt = `You are a real-time enrollment compliance coach for Medicare insurance agents.
The agent is currently on step: "${currentStep}".
Based on the agent's recent spoken words, give ONE short, actionable coaching tip (1-2 sentences max).
Focus on compliance, tone, or script adherence. Be encouraging. Never repeat the transcript back.`;

    try {
      const response = await fetch("/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",

          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Agent just said: "${recentSpeech.trim().slice(-300)}"`,
            },
          ],
        }),
      });
      const data = await response.json();
      const tip =
        data.content
          ?.map((b) => (b.type === "text" ? b.text : ""))
          .filter(Boolean)
          .join("") || "Keep going — you're doing great!";
      setCoaching(tip);
    } catch (err) {
      console.error("Coaching API error:", err);
      setCoaching("Stay on script and keep your energy positive.");
    } finally {
      setCoachingLoading(false);
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterimText("");
    setHighlightIdx(-1);
    setCoaching(null);
  };

  /* ═══════ RENDER ═══════ */
  return (
    <section className="card prompter-card">
      {/* Header — always visible, click to collapse */}
      <div className="prompter-header" onClick={() => setExpanded((p) => !p)}>
        <div className="prompter-header-left">
          <span className="prompter-mic-icon">{listening ? "🔴" : "🎙️"}</span>
          <div>
            <h2 style={{ margin: 0 }}>AI Script Prompter</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              {currentStep} · Speech recognition + AI coaching
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
              onClick={() => requestCoaching(transcript.slice(-500))}
            >
              {coachingLoading ? "Thinking…" : "Ask AI Coach"}
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
                <span className="prompter-interim">{interimText}</span>
              )}
            </div>
          </div>

          {/* AI Coach */}
          <div className="prompter-coaching">
            <div className="prompter-section-label">
              AI Coach{" "}
              {coachingLoading && <span className="prompter-pulse">●</span>}
            </div>
            <div className="prompter-coaching-text">
              {coaching || (
                <span style={{ opacity: 0.4 }}>
                  Coaching tips appear here as you speak…
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

export default ScriptPrompter;
