import { useState, useRef, useCallback, useEffect } from "react";
import { MAX_TRANSCRIPT_LENGTH } from "../data/complianceKnowledge";

const QUESTION_START_RE =
  /^(who|what|when|where|why|how|which|can|could|would|will|should|do|does|did|is|are|am|have|has|had|may)\b/i;

function capTranscript(value) {
  if (value.length <= MAX_TRANSCRIPT_LENGTH) return value;
  const trimmed = value.slice(value.length - MAX_TRANSCRIPT_LENGTH);
  const firstSpace = trimmed.indexOf(" ");
  return firstSpace > 0 ? trimmed.slice(firstSpace + 1) : trimmed;
}

function normalizeUtterance(value) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSpokenQuestion(lastChunk, transcript) {
  const candidates = [lastChunk, transcript.slice(-220)]
    .map(normalizeUtterance)
    .filter(Boolean);

  for (const candidate of candidates) {
    const segments = candidate
      .split(/[.!]\s+|\n+/)
      .map(normalizeUtterance)
      .filter(Boolean);
    const segment = segments.at(-1) || candidate;
    if (segment.length > 10 && (segment.includes("?") || QUESTION_START_RE.test(segment))) {
      return segment.endsWith("?") ? segment : `${segment}?`;
    }
  }

  return "";
}

/**
 * useSpeechRecognition — manages browser speech recognition with:
 * - Automatic restart with exponential backoff on errors
 * - Rolling transcript cap to prevent unbounded growth
 * - Spoken question detection on mute
 * - Interim text display
 */
export function useSpeechRecognition({ onNewFinal, onSpokenQuestion, externalTranscriptRef }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptRows, setTranscriptRows] = useState([]);
  const [interimText, setInterimText] = useState("");

  const recognitionRef = useRef(null);
  const internalRef = useRef("");
  const transcriptRef = externalTranscriptRef || internalRef;
  const backoffRef = useRef(300); // exponential backoff for restarts
  const lastFinalChunkRef = useRef("");
  const onNewFinalRef = useRef(onNewFinal);
  const onSpokenQuestionRef = useRef(onSpokenQuestion);

  // Keep callback refs current
  useEffect(() => { onNewFinalRef.current = onNewFinal; }, [onNewFinal]);
  useEffect(() => { onSpokenQuestionRef.current = onSpokenQuestion; }, [onSpokenQuestion]);

  // Keep transcriptRef in sync
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const supportsRecognition =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = useCallback(() => {
    if (!supportsRecognition) return;
    backoffRef.current = 300; // reset backoff on manual start

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
        } else {
          interim += r[0].transcript;
        }
      }
      if (newFinal) {
        const updatedTranscript = capTranscript(`${transcriptRef.current || ""}${newFinal}`);
        transcriptRef.current = updatedTranscript;
        lastFinalChunkRef.current = newFinal.trim();
        setTranscript(updatedTranscript);
        const rowTs = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setTranscriptRows((prev) => [
          ...prev.slice(-49),
          { id: Date.now(), ts: rowTs, text: newFinal.trim() },
        ]);
        setInterimText("");
        onNewFinalRef.current?.(newFinal);
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (e) => {
      // no-speech and aborted are normal — don't log as errors
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("SpeechRecognition error:", e.error);
      }
      // Only truly stop for permission denial — everything else will auto-restart via onend
      if (e.error === "not-allowed") {
        setListening(false);
        recognitionRef.current = null;
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        // Quick restart: 300ms → 600ms → 1.2s (cap 1.2s)
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 1200);
        setTimeout(() => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
              backoffRef.current = 300; // reset on successful restart
            } catch {
              /* already running */
            }
          }
        }, delay);
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

    // Detect spoken questions on mute
    const spokenQuestion = extractSpokenQuestion(
      lastFinalChunkRef.current,
      transcriptRef.current.trim()
    );
    if (spokenQuestion) {
      onSpokenQuestionRef.current?.(spokenQuestion);
    }
  }, []);

  const clearTranscript = useCallback(() => {
    transcriptRef.current = "";
    lastFinalChunkRef.current = "";
    setTranscript("");
    setTranscriptRows([]);
    setInterimText("");
  }, [transcriptRef]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  return {
    listening,
    transcript,
    transcriptRef,
    transcriptRows,
    interimText,
    supportsRecognition,
    start: startListening,
    stop: stopListening,
    startListening,
    stopListening,
    clearTranscript,
  };
}
