import { useState, useRef, useCallback, useEffect } from "react";
import { useCallStore } from "../stores/callStore";
import { waitForActiveSessionMetadata } from "./useSessionTracker";

/**
 * useCustomerAudio — captures customer audio from a shared browser tab
 * via getDisplayMedia and streams it to Deepgram for real-time transcription.
 *
 * Flow: getDisplayMedia → AudioContext → ScriptProcessorNode → Deepgram WebSocket
 * Output: customerTranscript array with { text, timestamp, isFinal, speaker: 'customer' }
 */

const DEEPGRAM_WS_URL =
  "wss://api.deepgram.com/v1/listen?" +
  "encoding=linear16&sample_rate=16000&channels=1&model=nova-2" +
  "&punctuate=true&interim_results=true&utterance_end_ms=1500&vad_events=true";

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

/** Downsample Float32 audio from source rate to 16kHz and convert to Int16 PCM */
function downsampleToInt16(float32Array, sourceSampleRate) {
  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const newLength = Math.round(float32Array.length / ratio);
  const result = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = Math.round(i * ratio);
    const sample = Math.max(-1, Math.min(1, float32Array[srcIdx] || 0));
    result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return result;
}

export function useCustomerAudio() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [customerTranscript, setCustomerTranscript] = useState([]);
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const wsRef = useRef(null);
  const cleaningUpRef = useRef(false);
  const interimRef = useRef("");

  const cleanup = useCallback(() => {
    if (cleaningUpRef.current) return;
    cleaningUpRef.current = true;

    // Close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          // Send close message to Deepgram
          wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
        }
        wsRef.current.close();
      } catch { /* ignore */ }
      wsRef.current = null;
    }

    // Disconnect audio processing
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch { /* ignore */ }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }

    // Stop all media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      mediaStreamRef.current = null;
    }

    setIsCapturing(false);
    setAudioLevel(0);
    cleaningUpRef.current = false;
  }, []);

  const startCapture = useCallback(async () => {
    setError(null);

    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
    if (!apiKey) {
      setError("Deepgram API key not configured. Set VITE_DEEPGRAM_API_KEY in .env");
      return;
    }

    let stream;
    try {
      // Try audio-only first
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      try {
        // Some browsers require video: true — capture it and discard
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            channelCount: 1,
            sampleRate: TARGET_SAMPLE_RATE,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        // Discard video track
        stream.getVideoTracks().forEach((track) => track.stop());
      } catch (err) {
        // Re-throw user denial so unified START handler can catch silently
        if (err.name === "NotAllowedError") {
          throw new Error("Tab sharing was denied by user.");
        }
        const msg = `Could not capture tab audio: ${err.message}`;
        setError(msg);
        return;
      }
    }

    // Verify we got an audio track
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("No audio track in the shared tab. Make sure to check 'Share tab audio' when selecting.");
    }

    mediaStreamRef.current = stream;

    // Auto-cleanup when user stops sharing via browser UI
    audioTracks[0].onended = () => {
      cleanup();
    };

    // Set up AudioContext and processing
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    // Use ScriptProcessorNode for PCM extraction
    // (AudioWorklet would be ideal but requires a separate file; this is simpler and still works)
    const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorRef.current = processor;

    // Open Deepgram WebSocket
    const ws = new WebSocket(DEEPGRAM_WS_URL, ["token", apiKey]);
    wsRef.current = ws;

    ws.onopen = () => {
      void (async () => {
        const { agentId, sessionId } = await waitForActiveSessionMetadata();
        if (ws.readyState === WebSocket.OPEN) {
          useCallStore.getState().startCall(agentId, sessionId);
        }
      })();

      // Wire up audio processing once WebSocket is ready
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate audio level for the UI meter
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setAudioLevel(Math.min(1, rms * 5)); // Amplify for visual

        // Downsample and convert to Int16 PCM
        if (ws.readyState === WebSocket.OPEN) {
          const pcm = downsampleToInt16(inputData, audioContext.sampleRate);
          ws.send(pcm.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "Results" && data.channel?.alternatives?.[0]) {
          const alt = data.channel.alternatives[0];
          const text = (alt.transcript || "").trim();
          if (!text) return;

          const isFinal = data.is_final;
          const timestamp = Date.now();

          if (isFinal) {
            interimRef.current = "";
            setCustomerTranscript((prev) => [
              ...prev,
              { text, timestamp, isFinal: true, speaker: "customer" },
            ]);
          } else {
            interimRef.current = text;
            // Update the last interim entry or add new one
            setCustomerTranscript((prev) => {
              const copy = [...prev];
              // Replace the last interim entry if it exists
              if (copy.length > 0 && !copy[copy.length - 1].isFinal) {
                copy[copy.length - 1] = { text, timestamp, isFinal: false, speaker: "customer" };
              } else {
                copy.push({ text, timestamp, isFinal: false, speaker: "customer" });
              }
              return copy;
            });
          }
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => {
      setError("Deepgram connection error. Check your API key and network.");
      cleanup();
    };

    ws.onclose = (event) => {
      void useCallStore.getState().endCall();

      // Only set error if we didn't initiate the close
      if (isCapturing && !cleaningUpRef.current && event.code !== 1000) {
        setError("Deepgram connection closed unexpectedly. You may need to restart capture.");
        cleanup();
      }
    };

    setIsCapturing(true);
  }, [cleanup, isCapturing]);

  const stopCapture = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const clearTranscript = useCallback(() => {
    setCustomerTranscript([]);
    interimRef.current = "";
  }, []);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return {
    startCapture,
    stopCapture,
    clearTranscript,
    isCapturing,
    customerTranscript,
    audioLevel,
    error,
  };
}
