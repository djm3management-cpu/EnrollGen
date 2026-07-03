import { useState, useRef, useCallback, useEffect } from "react";
import { useCallStore } from "../stores/callStore";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import { waitForActiveSessionMetadata } from "./useSessionTracker";
import { computeRmsLevel, computeWaveformPeaks } from "../audio/audioPeaks";
import { publishAudioLevel } from "../stores/audioLevelStore";

/**
 * useCustomerAudio - captures customer audio from a shared browser tab
 * via getDisplayMedia and streams it to Deepgram for real-time transcription.
 *
 * Flow: getDisplayMedia -> AudioContext -> ScriptProcessorNode -> Deepgram WebSocket
 * Output: customerTranscript array with { text, timestamp, isFinal, speaker: 'customer' }
 */

const DEEPGRAM_WS_URL =
  "wss://api.deepgram.com/v1/listen?" +
  "encoding=linear16&sample_rate=16000&channels=1&model=nova-2" +
  "&punctuate=true&interim_results=true&utterance_end_ms=1500&vad_events=true" +
  "&sentiment=true";

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;
const DEEPGRAM_TOKEN_ENDPOINT = "/api/deepgram-token";

async function requestCustomerAudioStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Browser screen audio capture is not supported.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      channelCount: 1,
      sampleRate: TARGET_SAMPLE_RATE,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  return stream;
}

async function fetchDeepgramToken(getToken) {
  const response = await fetchWithClerk(getToken, DEEPGRAM_TOKEN_ENDPOINT, {
    method: "POST",
  });

  const raw = await response.text().catch(() => "");
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.access_token) {
    const nestedError =
      typeof data?.error === "object" && data.error
        ? data.error.message || data.error.type
        : data?.error;
    const detail =
      data?.detail ||
      nestedError ||
      data?.message ||
      (raw && !raw.trim().startsWith("<") ? raw.trim() : "");

    if (response.status === 404) {
      throw new Error(
        "Customer audio is unavailable because the Deepgram token function is not running. Use Netlify dev or disable customer audio."
      );
    }

    throw new Error(
      detail || `Deepgram token request failed with HTTP ${response.status}.`
    );
  }

  return data.access_token;
}

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
  const { getToken } = useAppAuth();
  const [isCapturing, setIsCapturing] = useState(false);
  const [customerTranscript, setCustomerTranscript] = useState([]);
  const [error, setError] = useState(null);

  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const silentGainRef = useRef(null);
  const sourceRef = useRef(null);
  const wsRef = useRef(null);
  const cleaningUpRef = useRef(false);
  const interimRef = useRef("");

  const cleanup = useCallback(() => {
    if (cleaningUpRef.current) return;
    cleaningUpRef.current = true;

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
        }
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        /* ignore */
      }
      processorRef.current = null;
    }

    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {
        /* ignore */
      }
      silentGainRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        /* ignore */
      }
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      mediaStreamRef.current = null;
    }

    setIsCapturing(false);
    publishAudioLevel("customer", 0, { immediate: true });
    cleaningUpRef.current = false;
  }, []);

  const startCapture = useCallback(async () => {
    setError(null);

    let stream;
    try {
      stream = await requestCustomerAudioStream();
    } catch (err) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Tab sharing was denied by user."
          : `Could not open the browser audio picker: ${err?.message || "unknown error"}`;
      setError(msg);
      throw new Error(msg);
    }

    mediaStreamRef.current = stream;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      const msg =
        "No audio track in the shared tab. Make sure to check 'Share tab audio' when selecting.";
      setError(msg);
      cleanup();
      throw new Error(msg);
    }

    audioTracks[0].onended = () => {
      cleanup();
    };

    let deepgramToken;
    try {
      deepgramToken = await fetchDeepgramToken(getToken);
    } catch (err) {
      const msg = err.message || "Deepgram token service is not configured.";
      setError(msg);
      cleanup();
      throw new Error(msg);
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;
    try {
      if (audioContext.state === "suspended") await audioContext.resume();
    } catch {
      cleanup();
      throw new Error("Customer audio processing could not start.");
    }

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    const ws = new WebSocket(DEEPGRAM_WS_URL, ["token", deepgramToken]);
    wsRef.current = ws;

    ws.onopen = () => {
      void (async () => {
        const { agentId, sessionId } = await waitForActiveSessionMetadata();
        if (ws.readyState === WebSocket.OPEN) {
          useCallStore.getState().startCall(agentId, sessionId);
        }
      })();

      void (async () => {
        if (audioContext.audioWorklet && typeof AudioWorkletNode !== "undefined") {
          try {
            await audioContext.audioWorklet.addModule(
              new URL("../audio/pcmCaptureProcessor.worklet.js", import.meta.url)
            );
            if (ws.readyState !== WebSocket.OPEN) return;

            const processor = new AudioWorkletNode(
              audioContext,
              "pcm-capture-processor",
              {
                processorOptions: {
                  targetSampleRate: TARGET_SAMPLE_RATE,
                  bufferSize: BUFFER_SIZE,
                },
              }
            );
            const silentGain = audioContext.createGain();
            silentGain.gain.value = 0;
            processor.port.onmessage = ({ data }) => {
              publishAudioLevel("customer", data.level || 0, { peaks: data.peaks });
              if (ws.readyState === WebSocket.OPEN && data.pcm) ws.send(data.pcm);
            };
            processorRef.current = processor;
            silentGainRef.current = silentGain;
            source.connect(processor);
            processor.connect(silentGain);
            silentGain.connect(audioContext.destination);
            return;
          } catch {
            // Older browsers and restrictive policies use the fallback below.
          }
        }

        const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        processor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          publishAudioLevel("customer", computeRmsLevel(inputData), {
            peaks: computeWaveformPeaks(inputData),
          });
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(downsampleToInt16(inputData, audioContext.sampleRate).buffer);
          }
        };
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(audioContext.destination);
      })().catch(() => {
        setError("Customer audio processing could not start.");
        cleanup();
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "Results" && data.channel?.alternatives?.[0]) {
          const alt = data.channel.alternatives[0];
          const text = (alt.transcript || "").trim();
          if (!text) return;

          const timestamp = Date.now();

          if (data.is_final) {
            interimRef.current = "";
            setCustomerTranscript((prev) => [
              ...prev,
              { text, timestamp, isFinal: true, speaker: "customer" },
            ]);
          } else {
            interimRef.current = text;
            setCustomerTranscript((prev) => {
              const copy = [...prev];
              const entry = { text, timestamp, isFinal: false, speaker: "customer" };
              if (copy.length > 0 && !copy[copy.length - 1].isFinal) {
                copy[copy.length - 1] = entry;
              } else {
                copy.push(entry);
              }
              return copy;
            });
          }
        }
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onerror = () => {
      setError("Deepgram connection error. Check your API key and network.");
      cleanup();
    };

    ws.onclose = (event) => {
      void useCallStore.getState().endCall();

      if (isCapturing && !cleaningUpRef.current && event.code !== 1000) {
        setError("Deepgram connection closed unexpectedly. You may need to restart capture.");
        cleanup();
      }
    };

    setIsCapturing(true);
  }, [cleanup, getToken, isCapturing]);

  const stopCapture = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const clearTranscript = useCallback(() => {
    setCustomerTranscript([]);
    interimRef.current = "";
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    startCapture,
    stopCapture,
    clearTranscript,
    isCapturing,
    customerTranscript,
    error,
  };
}
