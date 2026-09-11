import { randomUUID } from "node:crypto";
import { supabase } from "./supabase.js";

export const PHONE_HEARTBEAT_MS = 15_000;

export async function expirePhoneSessions() {
  const { error } = await supabase.rpc("expire_agent_phone_sessions");
  if (error) throw new Error(`Presence expiry failed: ${error.message}`);
}

// Per-socket serialization prevents a slow heartbeat from resurrecting a closed
// session. Native WebSocket pong frames work even in background browser tabs.
export function attachPhonePresence(ws, agentId, {
  rpc = (name, args) => supabase.rpc(name, args),
  interval = setInterval, clear = clearInterval,
} = {}) {
  const sessionId = randomUUID();
  let ready = false;
  let closed = false;
  let alive = true;
  let pending = Promise.resolve();
  function update(isReady) {
    pending = pending.then(async () => {
      const { error } = await rpc("update_agent_phone_session", {
        p_agent_id: agentId, p_session_id: sessionId, p_ready: isReady,
      });
      if (error) throw new Error(error.message);
      if (isReady && !closed && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "presence-ready" }));
      }
    }).catch(err => {
      console.error(`Phone presence failed (${agentId}):`, err.message);
      // Fail closed. A failed disconnect is still bounded by the DB lease.
      if (!closed) ws.terminate();
    });
  }
  ws.on("message", raw => {
    if (closed) return;
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.type !== "phone-ready" || typeof message.ready !== "boolean") return;
    ready = message.ready;
    update(ready);
  });
  ws.on("pong", () => {
    if (closed) return;
    alive = true;
    if (ready) update(true);
  });
  const timer = interval(() => {
    if (!alive) { ws.terminate(); return; }
    alive = false;
    if (ws.readyState === ws.OPEN) ws.ping();
  }, PHONE_HEARTBEAT_MS);
  timer.unref?.();
  ws.on("close", () => {
    closed = true;
    ready = false;
    clear(timer);
    update(false);
  });
  return { settled: () => pending };
}
