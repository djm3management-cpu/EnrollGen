import { startParagonBillingWorker } from "./paragonBilling.js";
import { startCallStatusRecoveryWorker } from "./callStatusRecovery.js";
import { startRecordingWorker } from "./recordings.js";
import { recordingMediaRouter } from "./routes/recordingMedia.js";
import { createRecordingServiceClient, supabase } from "./supabase.js";
import { reportSupabaseKeySelection } from "./lib/supabaseKeys.js";
import { startTranscriptWorker } from "./transcripts.js";
import process from "node:process";
import http from "node:http";
import express from "express";
import { config } from "./config.js";
import { twilioVoiceRouter } from "./routes/twilioVoice.js";
import { twilioStatusRouter } from "./routes/twilioStatus.js";
import { leadsRouter } from "./routes/leads.js";
import { voiceTokenRouter } from "./routes/voiceToken.js";
import { voiceEventsRouter } from "./routes/voiceEvents.js";
import { voiceOutboundRouter } from "./routes/voiceOutbound.js";
import { vendorPingRouter } from "./routes/vendorPing.js";
import { smsRouter } from "./routes/sms.js";
import { handleMediaUpgrade } from "./media/mediaStream.js";
import { handleAgentUpgrade } from "./media/agentSocket.js";
import { createConferenceRouter } from './routes/conferenceCalling.js';
import { conferenceService } from './conferenceCalling.js';
import { createConferenceMedia } from './media/conferenceMedia.js';
import { conferenceRuntime } from './conferenceRuntime.js';

import { expirePhoneSessions } from "./phonePresence.js";

// Routing checks lease expiry itself, even if this maintenance job is delayed.
let expiryRunning = false;
async function sweepPresence() {
  if (expiryRunning) return;
  expiryRunning = true;
  try { await expirePhoneSessions(); }
  catch (err) { console.error(err.message); }
  finally { expiryRunning = false; }
}
setInterval(sweepPresence, 15_000).unref();
void sweepPresence();

const app = express();
void reportSupabaseKeySelection(supabase);
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
app.use(vendorPingRouter);
app.use(voiceTokenRouter);
app.use(voiceEventsRouter);
app.use(voiceOutboundRouter);
app.use(createConferenceRouter());
app.use(smsRouter);
app.use(recordingMediaRouter);
startRecordingWorker({ db: createRecordingServiceClient(), config });
startParagonBillingWorker({ db: createRecordingServiceClient(), config });
startCallStatusRecoveryWorker({ db: createRecordingServiceClient(), config });

startTranscriptWorker({ db: createRecordingServiceClient(),
  scoringUrl: process.env.TRANSCRIPT_SCORING_URL, secret: process.env.SCORE_CALL_JOB_SECRET });

const server = http.createServer(app);
const conferenceMedia = createConferenceMedia();
let conferenceRecoveryRunning = false;
const recoverConferences = async () => {
  if (conferenceRecoveryRunning) return;
  conferenceRecoveryRunning = true;
  try { await conferenceService().tick(); }
  catch (error) { if (!['42P01', 'PGRST205'].includes(error.code)) console.error('Conference recovery pending'); }
  finally { conferenceRecoveryRunning = false; }
};
setInterval(() => void recoverConferences(), 15000).unref();
// Discover drain state before accepting callbacks after a flag-off restart.
// Otherwise an already-converted call could enter the legacy release path.
try { conferenceRuntime.draining = (await conferenceService().store.active()).length > 0; }
catch (error) { if (!['42P01', 'PGRST205'].includes(error.code)) throw error; }
void recoverConferences();

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname.startsWith('/conference-media/')) return conferenceMedia.handleUpgrade(request, socket, head);
  if (pathname === "/media" || pathname.startsWith("/media/")) return handleMediaUpgrade(request, socket, head);
  if (pathname === "/agent") return handleAgentUpgrade(request, socket, head);
  socket.destroy();
});

server.listen(config.port, () => {
  console.log(`EnrollGen telephony service listening on :${config.port}`);
  console.log(`Public base URL: ${config.publicBaseUrl}`);
});
