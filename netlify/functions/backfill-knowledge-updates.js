import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
const logger=createLogger('netlify','backfill_knowledge_updates');
import {AdmissionError,admissionResponse} from './_admission.js';
import {
  runAllKnowledgeCategoryUpdates,
} from "./_knowledgeUpdate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isAuthorized(request) {
  const secret = process.env.BACKFILL_SECRET || process.env.KNOWLEDGE_UPDATE_SECRET;
  if (!secret) return false;
  return request.headers.get("x-backfill-secret") === secret
    || request.headers.get("x-knowledge-update-secret") === secret;
}

async function parseBody(request) {
  if (request.method !== "POST") return {};
  return request.json().catch(() => ({}));
}

export default serverRequest('backfill-knowledge-updates',async (request) => {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isAuthorized(request)) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  try {
    const body = await parseBody(request);
    const result = await runAllKnowledgeCategoryUpdates({
      limitPerCategory: Number(body.limitPerCategory || body.limit || 6),
    });

    return json(200, {
      ok: true,
      ...result,
    });
  } catch(error) {
    if(error instanceof AdmissionError)return admissionResponse(error);
    logger.error("backfill_knowledge_updates_failed", 'request_failed');
    return json(500, {
      ok: false,
      error: 'request_failed',
    });
  }
});
