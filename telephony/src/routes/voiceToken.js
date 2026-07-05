import { Router } from "express";
import twilio from "twilio";
import { verifyToken } from "@clerk/backend";
import { config } from "../config.js";
import { agentExists } from "../availability.js";
import { mintAgentWsToken } from "../wsToken.js";

export const voiceTokenRouter = Router();

const TOKEN_TTL_SECONDS = 3600;

async function requireClerkUser(req, res) {
  const header = req.header("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Missing Bearer token" });
    return null;
  }
  try {
    const payload = await verifyToken(header.slice(7).trim(), {
      secretKey: config.clerkSecretKey,
    });
    return payload;
  } catch (err) {
    console.error("Clerk token verification failed:", err.message);
    res.status(401).json({ error: "Invalid or expired Clerk session token" });
    return null;
  }
}

// Issues the Twilio Voice access token for the browser softphone plus
// a signed token for the /agent transcript WebSocket.
// Body: { agent_id: "mark_endres" }
voiceTokenRouter.post("/api/voice/token", async (req, res) => {
  const clerkUser = await requireClerkUser(req, res);
  if (!clerkUser) return;

  const agentId = req.body?.agent_id;
  if (!agentId || !/^[a-z0-9_]+$/.test(agentId)) {
    return res.status(400).json({ error: "agent_id is required (snake_case)" });
  }
  if (!(await agentExists(agentId))) {
    return res.status(404).json({ error: `Unknown agent_id: ${agentId}` });
  }

  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(
    config.twilioAccountSid,
    config.twilioApiKeySid,
    config.twilioApiKeySecret,
    { identity: agentId, ttl: TOKEN_TTL_SECONDS }
  );
  token.addGrant(
    new AccessToken.VoiceGrant({
      incomingAllow: true,
      outgoingApplicationSid: config.twilioTwimlAppSid,
    })
  );

  return res.json({
    token: token.toJwt(),
    identity: agentId,
    expires_in: TOKEN_TTL_SECONDS,
    ws_token: mintAgentWsToken(agentId),
    ws_url: `${config.publicBaseUrl.replace(/^http/, "ws")}/agent`,
  });
});
