import { requireClerkAuth } from "./_clerkAuth.js";
import { createClient } from "@supabase/supabase-js";
import {
  logUsageRecord,
  requireActiveSubscription,
  requirePlan,
  resolveTenantIdForOrg,
} from "./_subscriptionGate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AI_REQUEST_TIMEOUT_MS = 45000;

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

function countClaudeTokens(usage = {}) {
  return (
    Number(usage.input_tokens || 0) +
    Number(usage.output_tokens || 0) +
    Number(usage.cache_creation_input_tokens || 0) +
    Number(usage.cache_read_input_tokens || 0)
  );
}

async function readJsonResponse(response) {
  const raw = await response.text().catch(() => "");

  if (!raw) {
    return { data: {}, raw: "" };
  }

  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return {
      data: {
        error: "Invalid AI response",
        detail: raw.slice(0, 2000),
      },
      raw,
    };
  }
}

export default async (request) => {
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is not set");
    return new Response(
      JSON.stringify({
        error: "Server configuration error",
        detail:
          "API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.",
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }

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

    if (!body.model) {
      body.model = "claude-sonnet-4-6";
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResponse(400, {
        error: "Invalid request body",
        detail: "The coach function requires a non-empty messages array.",
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return jsonResponse(504, {
          error: "AI request timed out",
          detail: `Anthropic did not respond within ${AI_REQUEST_TIMEOUT_MS / 1000} seconds.`,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const { data, raw } = await readJsonResponse(resp);

    if (!resp.ok) {
      console.error("Anthropic API error:", resp.status, raw || JSON.stringify(data));
    }

    if (resp.ok) {
      const tokenCount = countClaudeTokens(data.usage);
      await logUsageRecord(supabase, tenantId, "claude_tokens", tokenCount || 1, {
        model: body.model,
        endpoint: "coach",
        user_id: auth.userId,
        status: resp.status,
      });
    }

    return jsonResponse(resp.status, data);
  } catch (error) {
    console.error("coach function error:", error);
    return jsonResponse(500, {
      error: "AI request failed",
      detail: error?.message || String(error),
    });
  }
};
