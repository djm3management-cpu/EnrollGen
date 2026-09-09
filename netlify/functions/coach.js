import { complete, completeStream } from "../../src/lib/llm/client.ts";
import { resolveEngine } from "../../src/lib/llm/config.js";
import { coachingFormat } from "../../src/lib/llm/schemas/coaching.js";
import { llmRuntime } from "./_llmTelemetry.js";
import { requireClerkAuth } from "./_clerkAuth.js";
import { createClient } from "@supabase/supabase-js";
import {
  requireActiveSubscription,
  requirePlan,
  resolveTenantIdForOrg,
} from "./_subscriptionGate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };


function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) {
    return auth.response;
  }

  const supabase = getSupabase();
  const tenantId = await resolveTenantIdForOrg(supabase, auth.orgId);
  const subscription = await requireActiveSubscription(supabase, tenantId);
  if (subscription.response) return subscription.response;

  const planGate = requirePlan(subscription, "pro");
  if (planGate.response) return planGate.response;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, {
        error: "Invalid request body",
        detail: "The coach function expects a valid JSON payload.",
      });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResponse(400, {
        error: "Invalid request body",
        detail: "The coach function requires a non-empty messages array.",
      });
    }

    let engine;
    try { engine = resolveEngine(body.engine); }
    catch { return jsonResponse(400, { error: "Unknown Co-Pilot engine" }); }
    if (!['MA', 'MEDSUP', 'ACA', 'U65'].includes(engine)) return jsonResponse(400, { error: 'This engine does not use the live LLM endpoint' });
    const runtime = { ...llmRuntime(supabase, tenantId, context, { endpoint: 'coach', user_id: auth.userId }), signal: request.signal };
    const input = {
      engine, path: 'live', system: body.system || '',
      messages: body.messages, static_messages: body.static_messages,
      max_completion_tokens: 2048,
      tools: body.tools, tool_choice: body.tool_choice,
      ...(body.response_format ? { response_format: coachingFormat } : {}),
    };
    if (body.stream) {
      const encoder = new TextEncoder();
      const events = completeStream(input, runtime);
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            const { value, done } = await events.next();
            if (done) controller.close();
            else controller.enqueue(encoder.encode(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`));
          } catch (error) { controller.error(error); }
        },
        async cancel() { await events.return(); },
      }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    }
    return jsonResponse(200, await complete(input, runtime));
  } catch (error) {
    console.error("coach function error:", error);
    return jsonResponse(500, {
      error: "AI request failed",
      detail: error?.message || String(error),
    });
  }
};
