import { WebSocketServer } from "ws";
import { attachPhonePresence } from "../phonePresence.js";
import { verifyAgentWsToken } from "../wsToken.js";
import { activeTenantAgent } from "../availability.js";

// Browser-facing WebSocket. The softphone connects once per shift with
// the signed token from /api/voice/token and receives transcript and
// call status messages for calls routed to that agent.
const socketsByAgent = new Map();

export const agentWss = new WebSocketServer({ noServer: true });

export function handleAgentUpgrade(request, socket, head) {
  const url = new URL(request.url, "http://localhost");
  const claims = verifyAgentWsToken(url.searchParams.get("token"));
  if (!claims) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  agentWss.handleUpgrade(request, socket, head, (ws) => {
    agentWss.emit("connection", ws, request, claims);
  });
}

agentWss.on("connection", async (ws, _request, claims) => {
  const { agentId } = claims;
  try {
    const agent = await activeTenantAgent(agentId, claims.clerkSubject);
    if (!agent || agent.clerk_user_id !== claims.clerkSubject) {
      ws.close(1008, "Agent is no longer active");
      return;
    }
  } catch (error) {
    console.error(`Agent websocket identity check failed (${agentId}):`, error.message);
    ws.close(1011, "Identity check failed");
    return;
  }
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
  ws.on("error", (err) => console.error(`agent ws error (${agentId}):`, err.message));
});

export function sendToAgent(agentId, message) {
  const set = socketsByAgent.get(agentId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
