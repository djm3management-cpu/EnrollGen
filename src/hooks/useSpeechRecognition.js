import { useState, useRef, useCallback, useEffect } from "react";
import { MAX_TRANSCRIPT_LENGTH } from "../data/complianceKnowledge";

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
  const backoffRef = useRef(500); // exponential backoff for restarts
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
    backoffRef.current = 500; // reset backoff on manual start

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
        setTranscript((prev) => {
          const updated = prev + newFinal;
          // Rolling cap: keep only the last MAX_TRANSCRIPT_LENGTH chars
          if (updated.length > MAX_TRANSCRIPT_LENGTH) {
            // Trim at a word boundary
            const trimmed = updated.slice(updated.length - MAX_TRANSCRIPT_LENGTH);
            const firstSpace = trimmed.indexOf(" ");
            return firstSpace > 0 ? trimmed.slice(firstSpace + 1) : trimmed;
          }
          return updated;
        });
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
      console.error("SpeechRecognition error:", e.error);
      if (e.error !== "no-speech") {
        setListening(false);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        // Exponential backoff restart: 500ms → 1s → 2s → 4s (cap 4s)
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 4000);
        setTimeout(() => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
              backoffRef.current = 500; // reset on successful restart
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
    const recentText = transcriptRef.current.trim().slice(-400);
    if (recentText && recentText.includes("?")) {
      const lastChunks = recentText.split(/[.!]\s+/).slice(-3).join(" ").trim();
      if (lastChunks.includes("?")) {
        const lastQMark = lastChunks.lastIndexOf("?");
        const beforeQ = lastChunks.slice(0, lastQMark + 1);
        const sentences = beforeQ.split(/(?<=[.!?])\s+/);
        const qSentences = [];
        for (let i = sentences.length - 1; i >= 0; i--) {
          qSentences.unshift(sentences[i]);
          if (qSentences.join(" ").length > 20) break;
        }
        const spokenQuestion = qSentences.join(" ").trim();
        if (spokenQuestion.length > 10) {
          onSpokenQuestionRef.current?.(spokenQuestion);
        }
      }
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setTranscriptRows([]);
    setInterimText("");
  }, []);

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
    startListening,
    stopListening,
    clearTranscript,
  };
}
