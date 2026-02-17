exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is not set");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Server configuration error",
        detail:
          "API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.",
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Ensure we always use a valid model
    if (!body.model) {
      body.model = "claude-sonnet-4-5-20250929";
    }

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

    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("coach function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "AI request failed", detail: String(err) }),
    };
  }
};
