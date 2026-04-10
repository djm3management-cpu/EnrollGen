import { requireClerkAuth } from "./_clerkAuth.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AI_REQUEST_TIMEOUT_MS = 45000;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
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

    return jsonResponse(resp.status, data);
  } catch (error) {
    console.error("coach function error:", error);
    return jsonResponse(500, {
      error: "AI request failed",
      detail: error?.message || String(error),
    });
  }
};
