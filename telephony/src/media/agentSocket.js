import {createLogger} from '../lib/logger.js';
const logger=createLogger('telephony','agentsocket');
import {createSocketAdmission} from '../lib/admission.js';
import {allowedBrowserOrigin} from '../lib/browserBoundary.js';
const reserveSocket=createSocketAdmission();
import { egressMetrics } from '../egressMetrics.js';
import { WebSocketServer } from "ws";
import { attachPhonePresence } from "../phonePresence.js";
import { inspectAgentWsToken } from "../wsToken.js";
import { activeTenantAgent } from "../availability.js";

// Browser-facing WebSocket. The softphone connects once per shift with
// the signed token from /api/voice/token and receives transcript and
// call status messages for calls routed to that agent.
const socketsByAgent = new Map();

export const agentWss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });
agentWss.on('wsClientError', (_error, socket) => {
  logger.warn("agentsocket_rejected_invalid_websocket_handshake");
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

export function handleAgentUpgrade(request, socket, head) {
  if(!allowedBrowserOrigin(request.headers?.origin)){socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");return;}
  let result;
  try {
    const url = new URL(request.url, "http://localhost");
    result = inspectAgentWsToken(url.searchParams.get("token"));
  } catch { result = { claims: null, reason: "invalid_url" }; }
  const { claims, reason } = result;
  if (!claims) {
    logger.warn('agent_upgrade_rejected',{reason});
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  let release;
  try{release=reserveSocket(claims.clerkSubject);}catch(error){socket.end(`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${error.retryAfter}\r\nConnection: close\r\n\r\n`);return;}
  socket.once("close",release);
  agentWss.handleUpgrade(request, socket, head, (ws) => {
    ws.once("close",release);
    agentWss.emit("connection", ws, request, claims);
  });
}

agentWss.on("connection", async (ws, _request, claims) => {
  const releaseSocket = egressMetrics.acquire('browser');
  ws.once('close', releaseSocket);
  ws.on('error', () => ws.terminate());
  const { agentId } = claims;
  try {
    const agent = await activeTenantAgent(agentId, claims.clerkSubject);
    if (!agent || agent.clerk_user_id !== claims.clerkSubject) {
      logger.warn("agentsocket_rejected_inactive_identity");
      ws.close(1008, "Agent is no longer active");
      return;
    }
  } catch {
    logger.warn("agentsocket_rejected_identity_check_unavailable");
    ws.close(1011, "Identity check failed");
    return;
  }
  if (ws.readyState !== ws.OPEN) return;
  attachPhonePresence(ws, agentId);
  if (!socketsByAgent.has(agentId)) socketsByAgent.set(agentId, new Set());
  socketsByAgent.get(agentId).add(ws);
  ws.send(JSON.stringify({ type: "connected", agentId }));

  ws.on("close", () => {
    const set = socketsByAgent.get(agentId);
    if (set) {
      set.delete(ws);
      if (!set.size) socketsByAgent.delete(agentId);
    }
  });
  ws.on("error", () => logger.warn("agentsocket_transport_error"));
});

export function sendToAgent(agentId, message) {
  const set = socketsByAgent.get(agentId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      if (ws.bufferedAmount > 256 * 1024) ws.terminate();
      else ws.send(data);
    }
  }
}
