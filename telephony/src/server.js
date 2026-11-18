import {createSupervisorWhisperRouter} from './routes/supervisorWhisper.js';
import {createSupervisorWhisper,whisperEnabled} from './supervisorWhisper.js';
import {createSupervisorListenServer,listenEnabled} from './media/supervisorListen.js';
import {withLogContext,inspectInput,securityEvent} from './lib/logger.js';
import {installOperationalTelemetry,scheduledSuccess} from './lib/operationalTelemetry.js';
import {createLogger} from './lib/logger.js';
const logger=createLogger('telephony','server');
import {installSecurityHeaders} from './lib/securityHeaders.js';
import {allowedBrowserOrigin,assertSingleReplica} from './lib/browserBoundary.js';
import {verifyDeploymentConfiguration} from './lib/deploymentRoster.js';
import { featureEnabled } from './lib/deploymentFeatures.js';
import { startEgressMetrics } from './egressMetrics.js';
import {startParagonResidenceWorker} from './paragonResidenceWorker.js';
import {createPostCallStatusHandler} from './postCallStatus.js';
import { startParagonBillingWorker } from "./paragonBilling.js";
import { startPingBillingWorker } from "./ping/billing.js";
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
import { screenerRouter } from "./routes/screener.js";
import { twilioStatusRouter } from "./routes/twilioStatus.js";
import { leadsRouter } from "./routes/leads.js";
import { voiceTokenRouter } from "./routes/voiceToken.js";
import { voiceEventsRouter } from "./routes/voiceEvents.js";
import { voiceOutboundRouter } from "./routes/voiceOutbound.js";
import { vendorPingRouter } from "./routes/vendorPing.js";
import { pingV1Router } from "./routes/pingV1.js";
import { exchangeV1Router } from "./routes/exchangeV1.js";
import { smsRouter } from "./routes/sms.js";
import { handleMediaUpgrade } from "./media/mediaStream.js";
import { handleAgentUpgrade } from "./media/agentSocket.js";
import { createConferenceRouter } from './routes/conferenceCalling.js';
import { conferenceService } from './conferenceCalling.js';
import { createConferenceMedia } from './media/conferenceMedia.js';
import { conferenceRuntime } from './conferenceRuntime.js';

import { expirePhoneSessions } from "./phonePresence.js";

assertSingleReplica();
await verifyDeploymentConfiguration(supabase);
installOperationalTelemetry(supabase);
startEgressMetrics();
setInterval(()=>void supabase.rpc('prune_admission_counters').then(({error})=>{if(error)logger.error('admission_prune_failed');else return scheduledSuccess(supabase,'admission_prune');}).catch(()=>logger.error('admission_prune_failed')),3600000).unref();

// Routing checks lease expiry itself, even if this maintenance job is delayed.
let expiryRunning = false;
async function sweepPresence() {
  if (expiryRunning) return;
  expiryRunning = true;
  try { await expirePhoneSessions();await scheduledSuccess(supabase,"presence_sweep"); }
  catch { logger.error('presence_sweep_failed'); }
  finally { expiryRunning = false; }
}
setInterval(sweepPresence, 15_000).unref();
void sweepPresence();

const app = express();
installSecurityHeaders(app);
app.use((req,res,next)=>withLogContext({service:"telephony"},()=>{res.on("finish",()=>{if(res.statusCode===403)securityEvent("authorization_denied");});next();}));
void reportSupabaseKeySelection(supabase);
app.set("trust proxy", false);

// CORS for the browser softphone (token endpoint). Twilio webhooks and
// the vendor intake are server-to-server and unaffected.
app.use((req, res, next) => {
  const origin=req.header("origin");
  if(!allowedBrowserOrigin(origin))return res.status(403).json({error:"Origin forbidden"});
  if(origin)res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "256kb" }));
app.use((req,_res,next)=>{if(req.body)inspectInput(req.body);next();});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.post('/internal/post-call-status',createPostCallStatusHandler({db:supabase,config}));
app.use(twilioVoiceRouter);
app.use(screenerRouter);
app.use(twilioStatusRouter);
app.use(leadsRouter);
app.use(vendorPingRouter);
// Generic ping platform; answers 503 unless PING_PLATFORM_ENABLED.
app.use(await pingV1Router());
// Ping exchange; answers 503 unless PING_PLATFORM_ENABLED and PING_EXCHANGE_ENABLED.
app.use(await exchangeV1Router());
app.use(voiceTokenRouter);
app.use(voiceEventsRouter);
// Keep removal/recovery for durable coach legs after disabling new admission.
const whisper=createSupervisorWhisper({conference:conferenceService(),settings:config});
conferenceRuntime.whisper=whisper;
if(whisperEnabled())app.use(createSupervisorWhisperRouter({service:whisper}));
app.use(voiceOutboundRouter);
app.use(createConferenceRouter());
app.use(smsRouter);
app.use(recordingMediaRouter);
if (featureEnabled('PARAGON_ENABLED')) startParagonResidenceWorker({db:createRecordingServiceClient(),recordSuccess:()=>scheduledSuccess(supabase,'paragon_residence')});
startRecordingWorker({ db: createRecordingServiceClient(), config,recordSuccess:()=>scheduledSuccess(supabase,'recording_worker') });
if (featureEnabled('PARAGON_ENABLED')) startParagonBillingWorker({ db: createRecordingServiceClient(), config,recordSuccess:()=>scheduledSuccess(supabase,'paragon_billing') });
if (featureEnabled('PING_PLATFORM_ENABLED')) startPingBillingWorker({ db: createRecordingServiceClient(), config });
startCallStatusRecoveryWorker({ db: createRecordingServiceClient(), config,recordSuccess:()=>scheduledSuccess(supabase,'call_status_recovery') });

startTranscriptWorker({ db: createRecordingServiceClient(),recordSuccess:()=>scheduledSuccess(supabase,'transcript_worker'),
  scoringUrl: process.env.TRANSCRIPT_SCORING_URL, secret: process.env.SCORE_CALL_JOB_SECRET });

const server = http.createServer(app);
const conferenceMedia = createConferenceMedia();
let conferenceRecoveryRunning = false;
const recoverConferences = async () => {
  if (conferenceRecoveryRunning) return;
  conferenceRecoveryRunning = true;
  try {
    // A coach reconciliation error must not suppress ordinary call recovery.
    try{await whisper.sweep();}catch{logger.error('supervisor_whisper_cleanup_failed');}
    if(featureEnabled('CONFERENCE_CALLING_ENABLED')){await conferenceService().tick();await scheduledSuccess(supabase,'conference_recovery');}
  }
  catch (error) { if (!['42P01', 'PGRST205'].includes(error.code)) logger.error("server_conference_recovery_pending"); }
  finally { conferenceRecoveryRunning = false; }
};
setInterval(() => void recoverConferences(), 15000).unref();
// Discover existing conferences only while enabled. A flag-off startup must
// neither query conference work nor resume its provider-side recovery.
try { if (featureEnabled('CONFERENCE_CALLING_ENABLED')) conferenceRuntime.draining = (await conferenceService().store.active()).length > 0; }
catch (error) { if (!['42P01', 'PGRST205'].includes(error.code)) throw error; }
void recoverConferences();

const supervisorListen=listenEnabled()?createSupervisorListenServer():null;
server.on("upgrade", (request, socket, head) => withLogContext({service:"telephony"},()=>{
  const { pathname } = new URL(request.url, "http://localhost");
  if(supervisorListen&&pathname==='/supervisor-listen')return supervisorListen.handleUpgrade(request,socket,head);
  if (pathname.startsWith('/conference-media/')) return conferenceMedia.handleUpgrade(request, socket, head);
  if (pathname === "/media" || pathname.startsWith("/media/")) return handleMediaUpgrade(request, socket, head);
  if (pathname === "/agent") return handleAgentUpgrade(request, socket, head);
  socket.destroy();
}));

server.listen(config.port, () => {
  logger.info("server_enrollgen_telephony_service_listening_on");
  logger.info("server_public_base_url");
});
