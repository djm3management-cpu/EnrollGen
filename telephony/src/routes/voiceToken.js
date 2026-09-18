import { Router } from "express";
import twilio from "twilio";
import { config } from "../config.js";
import { agentExists } from "../availability.js";
import { mintAgentWsToken } from "../wsToken.js";
import { requireClerkUser } from "../clerkAuth.js";
import { supabase } from "../supabase.js";

export const voiceTokenRouter = Router();

const TOKEN_TTL_SECONDS = 3600;

// Browser hits during debugging land here as GET; answer with a hint
// instead of Express's bare 404.
voiceTokenRouter.get("/api/voice/token", (_req, res) => {
  res.status(405).json({ error: "Use POST with a Clerk bearer token and { agent_id }" });
});

// Issues the Twilio Voice access token for the browser softphone plus
// a signed token for the /agent transcript WebSocket.
// Body: { agent_id: "mark_endres" }
voiceTokenRouter.post("/api/voice/token", async (req, res) => {
  const clerkUser = await requireClerkUser(req, res);
  if (!clerkUser) return;

  const clerkSubject = clerkUser.sub;
  const clerkSessionId = clerkUser.sid;
  if (!clerkSubject || !clerkSessionId) {
    return res.status(401).json({ error: "Clerk session identity is incomplete" });
  }

  // Never trust an agent identity supplied by the browser. Resolve the
  // telephony identity from the verified Clerk subject instead.
  const { data: tenantAgent, error: agentError } = await supabase
    .from("tenant_agents")
    .select("agent_slug, is_active")
    .eq("clerk_user_id", clerkSubject)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (agentError) {
    console.error("Agent identity lookup failed:", agentError.message);
    return res.status(503).json({ error: "Agent identity unavailable" });
  }

  const agentId = tenantAgent?.agent_slug;
  if (!agentId || !/^[a-z0-9_]+$/.test(agentId)) {
    return res.status(403).json({ error: "No active telephony agent is linked to this Clerk user" });
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
    ws_token: mintAgentWsToken(agentId, clerkSubject, clerkSessionId),
    ws_url: `${config.publicBaseUrl.replace(/^http/, "ws")}/agent`,
  });
});
