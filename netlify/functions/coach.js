import { requireClerkAuth } from "./_clerkAuth.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

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
    const body = await request.json().catch(() => ({}));

    if (!body.model) {
      body.model = "claude-sonnet-4-5-20250929";
    }

    console.log("Authenticated Clerk user:", auth.userId);
    console.log("Calling Anthropic API with model:", body.model);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Anthropic API error:", resp.status, JSON.stringify(data));
    }

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    console.error("coach function error:", error);
    return new Response(
      JSON.stringify({ error: "AI request failed", detail: String(error) }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
};
