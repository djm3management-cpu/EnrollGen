import http from "node:http";
import express from "express";
import { config } from "./config.js";
import { twilioVoiceRouter } from "./routes/twilioVoice.js";
import { twilioStatusRouter } from "./routes/twilioStatus.js";
import { leadsRouter } from "./routes/leads.js";
import { voiceTokenRouter } from "./routes/voiceToken.js";
import { handleMediaUpgrade } from "./media/mediaStream.js";
import { handleAgentUpgrade } from "./media/agentSocket.js";

const app = express();
app.set("trust proxy", true);

// CORS for the browser softphone (token endpoint). Twilio webhooks and
// the vendor intake are server-to-server and unaffected.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use(twilioVoiceRouter);
app.use(twilioStatusRouter);
app.use(leadsRouter);
app.use(voiceTokenRouter);

const server = http.createServer(app);

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname === "/media") return handleMediaUpgrade(request, socket, head);
  if (pathname === "/agent") return handleAgentUpgrade(request, socket, head);
  socket.destroy();
});

server.listen(config.port, () => {
  console.log(`EnrollGen telephony service listening on :${config.port}`);
  console.log(`Public base URL: ${config.publicBaseUrl}`);
});
