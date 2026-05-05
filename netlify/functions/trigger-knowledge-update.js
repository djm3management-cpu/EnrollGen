import { requireClerkAuth } from "./_clerkAuth.js";
import { isAdminAuth, runKnowledgeUpdate } from "./_knowledgeUpdate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  if (!isAdminAuth(auth)) {
    return json(403, {
      error: "Forbidden",
      detail: "Only organization admins can trigger knowledge updates.",
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const category = String(body.category || "").trim();
    const key = String(body.key || "").trim();

    if (!category) {
      return json(400, {
        error: "Invalid request",
        detail: "category is required.",
      });
    }

    const result = await runKnowledgeUpdate({
      category,
      key: key || null,
      limit: key ? 1 : Number(body.limit || 6),
    });

    return json(200, result);
  } catch (error) {
    console.error("[trigger-knowledge-update]", error);
    return json(500, {
      error: "Knowledge update failed",
      detail: error?.message || String(error),
    });
  }
};
