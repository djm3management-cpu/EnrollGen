import WebSocket, { WebSocketServer } from "ws";
import { config } from "../config.js";
import { sendToAgent } from "./agentSocket.js";
import { decodeMulaw, rmsLevel } from "./mulaw.js";

// How often to forward a customer audio level sample to the browser.
// Twilio media packets arrive every 20ms; batching ~5 of them keeps the
// waveform smooth without flooding the agent WebSocket.
const LEVEL_INTERVAL_MS = 100;

// Twilio Media Streams endpoint. Each inbound call opens one stream with
// track="both_tracks": the inbound track is the caller (CUSTOMER) and the
// outbound track is what the caller hears (AGENT). Each track gets its own
// Deepgram live connection so the existing AGENT/CUSTOMER transcript
// convention reaches the browser unchanged.
const DEEPGRAM_URL =
  "wss://api.deepgram.com/v1/listen" +
  "?encoding=mulaw&sample_rate=8000&channels=1&model=nova-2" +
  "&punctuate=true&smart_format=true&interim_results=true" +
  "&utterance_end_ms=1500&vad_events=true";

const TRACK_SPEAKERS = {
  inbound: "customer",
  outbound: "agent",
};

export const mediaWss = new WebSocketServer({ noServer: true });

export function handleMediaUpgrade(request, socket, head) {
  mediaWss.handleUpgrade(request, socket, head, (ws) => {
    mediaWss.emit("connection", ws, request);
  });
}

function openDeepgram({ speaker, getAgentId, getInboundCallId }) {
  const ws = new WebSocket(DEEPGRAM_URL, {
    headers: { Authorization: `Token ${config.deepgramApiKey}` },
  });
  const pending = [];

  ws.on("open", () => {
    for (const chunk of pending.splice(0)) ws.send(chunk);
  });

  const keepAlive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "KeepAlive" }));
    }
  }, 5000);

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (data.type !== "Results") return;
    const text = data.channel?.alternatives?.[0]?.transcript || "";
    if (!text.trim()) return;
    const agentId = getAgentId();
    if (!agentId) return;
    sendToAgent(agentId, {
      type: "transcript",
      inboundCallId: getInboundCallId(),
      speaker,
      text,
      isFinal: Boolean(data.is_final),
      timestamp: Date.now(),
    });
  });

  ws.on("error", (err) => console.error(`deepgram ws error (${speaker}):`, err.message));
  ws.on("close", () => clearInterval(keepAlive));

  return {
    send(chunk) {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      else if (ws.readyState === WebSocket.CONNECTING) pending.push(chunk);
    },
    close() {
      clearInterval(keepAlive);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      ws.close();
    },
  };
}

mediaWss.on("connection", (twilioWs) => {
  let agentId = null;
  let inboundCallId = null;
  const deepgramByTrack = {};
  let customerLevelChunks = [];
  let lastLevelSentAt = 0;

  const getAgentId = () => agentId;
  const getInboundCallId = () => inboundCallId;

  twilioWs.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.event) {
      case "start": {
        const params = message.start?.customParameters || {};
        agentId = params.agentId || null;
        inboundCallId = params.inboundCallId || null;
        for (const track of Object.keys(TRACK_SPEAKERS)) {
          deepgramByTrack[track] = openDeepgram({
            speaker: TRACK_SPEAKERS[track],
            getAgentId,
            getInboundCallId,
          });
        }
        if (agentId) {
          sendToAgent(agentId, {
            type: "call_status",
            inboundCallId,
            status: "stream_started",
          });
        }
        break;
      }
      case "media": {
        const track = message.media?.track;
        const payload = message.media?.payload;
        const target = deepgramByTrack[track];
        if (target && payload) {
          target.send(Buffer.from(payload, "base64"));
        }

        // Customer audio never reaches the browser as a track (it's a
        // server-side Twilio stream), so the CUSTOMER waveform meter is
        // driven from here instead of a local AnalyserNode.
        if (track === "inbound" && payload) {
          customerLevelChunks.push(Buffer.from(payload, "base64"));
          const now = Date.now();
          if (now - lastLevelSentAt >= LEVEL_INTERVAL_MS) {
            lastLevelSentAt = now;
            const combined = Buffer.concat(customerLevelChunks);
            customerLevelChunks = [];
            if (agentId) {
              sendToAgent(agentId, {
                type: "audio_level",
                speaker: "customer",
                level: rmsLevel(decodeMulaw(combined)),
                timestamp: now,
              });
            }
          }
        }
        break;
      }
      case "stop": {
        for (const dg of Object.values(deepgramByTrack)) dg.close();
        if (agentId) {
          sendToAgent(agentId, {
            type: "call_status",
            inboundCallId,
            status: "stream_stopped",
          });
        }
        break;
      }
      default:
        break;
    }
  });

  twilioWs.on("close", () => {
    for (const dg of Object.values(deepgramByTrack)) dg.close();
  });
  twilioWs.on("error", (err) => console.error("twilio media ws error:", err.message));
});
