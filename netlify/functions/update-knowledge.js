import { runKnowledgeUpdate } from "./_knowledgeUpdate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const config = {
  schedule: "0 9 * * 1",
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function isAuthorized(request) {
  const secret = process.env.KNOWLEDGE_UPDATE_SECRET;
  if (!secret) return true;
  return request.headers.get("x-knowledge-update-secret") === secret;
}

export default async (request) => {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isAuthorized(request)) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    let body = {};
    if (request.method === "POST") {
      body = await request.json().catch(() => ({}));
    }

    const result = await runKnowledgeUpdate({
      category: body.category || null,
      key: body.key || null,
      limit: Number(body.limit || 12),
    });

    return json(200, result);
  } catch (error) {
    console.error("[update-knowledge]", error);
    return json(500, {
      error: "Knowledge update failed",
      detail: error?.message || String(error),
    });
  }
};
