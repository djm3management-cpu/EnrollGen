import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {admit,AdmissionError} from './_admission.js';
import { complete } from '../../src/lib/llm/client.ts';
import { knowledgeUpdateFormat } from '../../src/lib/llm/schemas/jobs.js';
import { llmRuntime } from './_llmTelemetry.js';
import { createSupabaseClient as createClient, supabaseSecretKey } from "../../integrations/supabase.js";

const SOURCE_FETCH_TIMEOUT_MS = 15000;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = supabaseSecretKey();
  if (!url || !serviceRoleKey) throw new Error("Supabase service-role env vars not configured");
  return createClient(url, serviceRoleKey);
}

function truncate(value, maxChars) {
  const text = String(value || "");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[TRUNCATED]` : text;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url, timeoutMs = SOURCE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "EnrollGen-KnowledgeUpdater/1.0" },
    });
    const raw = await response.text();
    const contentType = response.headers.get("content-type") || "";
    return {
      url,
      ok: response.ok,
      status: response.status,
      content: contentType.includes("text/html") ? stripHtml(raw) : raw,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSourceMaterial(sourceUrls = []) {
  const results = [];
  for (const url of sourceUrls.filter(Boolean).slice(0, 4)) {
    try {
      const result = await fetchWithTimeout(url);
      results.push(result);
    } catch (error) {
      results.push({
        url,
        ok: false,
        status: 0,
        content: `FETCH_ERROR: ${error?.message || String(error)}`,
      });
    }
  }

  return results
    .map((result) => [
      `Source: ${result.url}`,
      `HTTP: ${result.status || "error"}`,
      truncate(result.content, 12000),
    ].join("\n"))
    .join("\n\n---\n\n");
}

export async function generateKnowledgeUpdate(entry, sourceMaterial, runtime = {}) {
  const result = await complete({
    engine:'MA', path:'summary', task:'knowledge_update', max_completion_tokens:5000,
    system: 'You are a Medicare compliance knowledge base editor. Return only the requested update format.',
    messages:[{role:'user',content:`You are a Medicare compliance knowledge base editor. Compare the existing knowledge entry below with the latest source material. If there are meaningful changes (new regulations, updated guidance, changed dates, new carriers, etc.), produce an updated version of the knowledge entry. If no changes are needed, set changed to false.\n\nExisting entry:\n${truncate(entry.content, 18000)}\n\nSource material:\n${truncate(sourceMaterial, 28000)}\n\nRespond with JSON: changed (boolean), summary (1-2 sentence summary of what changed), confidence (0.0-1.0 how confident you are this update is correct), updatedContent (the full updated entry content). For no changes use an empty summary and updatedContent and confidence 0.`}],
    response_format:knowledgeUpdateFormat,
  },runtime);
  if (result.tool_calls.length || !result.parsed || (result.parsed.changed && (!result.parsed.updatedContent.trim() || !result.parsed.summary.trim()))) {
    throw Object.assign(new Error('Invalid knowledge update output'),{code:'schema_validation'});
  }
  return result.parsed;
}

async function logKnowledgeUpdate(supabase, entryId, payload) {
  const { error } = await supabase
    .from("knowledge_updates")
    .insert({
      knowledge_base_id: entryId,
      previous_content: payload.previousContent || null,
      new_content: payload.newContent || null,
      change_summary: payload.summary || null,
      change_source: payload.changeSource || "agentic_auto",
      confidence_score: payload.confidence ?? null,
      status: payload.status,
      reviewed_by: payload.reviewedBy || null,
    });
  if (error) throw error;
}

async function processEntry(supabase, entry, { fetchSources, generateUpdate, budgetSubject, runtime }) {
  if (!entry.source_urls?.length) {
    return { id: entry.id, key: entry.key, result: "skipped_no_sources" };
  }

  const sourceMaterial = await fetchSources(entry.source_urls);
  await admit(supabase,'summary',budgetSubject);
  const parsed = await generateUpdate(entry, sourceMaterial, runtime);
  if (!parsed.changed) return { id: entry.id, key: entry.key, result: "no_changes" };

  // Confidence is informational only. No agentic proposal can publish live knowledge.
  await logKnowledgeUpdate(supabase, entry.id, {
    previousContent: entry.content,
    newContent: parsed.updatedContent || parsed.raw,
    summary: parsed.summary || "Changes detected but updated content was not parseable.",
    changeSource: "agentic_auto",
    confidence: parsed.confidence,
    status: "pending_review",
  });
  return { id: entry.id, key: entry.key, result: "pending_review", confidence: parsed.confidence };
}

async function fetchEntries(supabase, { category, key, limit, tenantId }) {
  let query = supabase
    .from("knowledge_base")
    .select("id, tenant_id, category, key, title, content, metadata, version, source_urls")
    .eq("is_active", true)
    .order("updated_at", { ascending: true });

  query = tenantId ? query.eq('tenant_id',tenantId) : query.is('tenant_id',null);
  if (category) query = query.eq("category", category);

  if (key) query = query.eq("key", key);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((entry) => entry.source_urls?.length);
}

export async function listKnowledgeCategories() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("category, source_urls").is("tenant_id",null)
    .eq("is_active", true)
    .order("category", { ascending: true });

  if (error) throw error;

  return Array.from(new Set(
    (data || [])
      .filter((entry) => entry.category && entry.source_urls?.length)
      .map((entry) => entry.category)
  )).sort();
}

export async function runKnowledgeUpdate(
  { category = null, key = null, limit = 12, tenantId = null, budgetSubject = 'service:knowledge-update' } = {},
  { getDb = getSupabase, fetchSources = fetchSourceMaterial, generateUpdate = generateKnowledgeUpdate, runtime = {} } = {},
) {
  if (process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED !== "true") return { status: "disabled" };
  const supabase = getDb();
  const entries = await fetchEntries(supabase, { category, key, limit, tenantId });
  const results = [];

  for (const entry of entries) {
    try {
      results.push(await processEntry(supabase, entry, { fetchSources, generateUpdate, budgetSubject, runtime: {...llmRuntime(supabase,entry.tenant_id || tenantId || deploymentProfile().tenantId,null,{endpoint:'knowledge-update',entry_id:entry.id}),...runtime} }));
    } catch (error) {
      if(error instanceof AdmissionError)throw error;
      await logKnowledgeUpdate(supabase, entry.id, {
        previousContent: entry.content,
        newContent: null,
        summary: error?.code === 'model_setting_required' ? error.message : 'Agentic update failed.',
        changeSource: "agentic_auto",
        confidence: 0,
        status: "draft",
      }).catch(() => {});
      results.push({
        id: entry.id,
        key: entry.key,
        result: "error",
        error: error.code === 'model_setting_required' ? error.message : 'request_failed',
      });
    }
  }

  return {
    checked: entries.length,
    results,
  };
}

export async function runAllKnowledgeCategoryUpdates({ limitPerCategory = 6 } = {}) {
  if (process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED !== "true") return { status: "disabled" };
  const categories = await listKnowledgeCategories();
  const results = [];

  for (const category of categories) {
    try {
      const result = await runKnowledgeUpdate({
        category,
        limit: limitPerCategory,
      });
      results.push({ category, ...result });
    } catch(error) {
      if(error instanceof AdmissionError)throw error;
      results.push({
        category,
        checked: 0,
        results: [],
        error: 'request_failed',
      });
    }
  }

  return {
    categories: categories.length,
    results,
  };
}

export function isAdminAuth(auth) {
  const payload = auth?.tokenPayload || {};
  const role =
    payload.org_role ||
    payload.role ||
    payload.public_metadata?.role ||
    payload.private_metadata?.role ||
    payload.metadata?.role;
  return role === "admin" || role === "org:admin" || payload.public_metadata?.isAdmin === true;
}
