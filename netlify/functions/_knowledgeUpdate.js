import { createClient } from "@supabase/supabase-js";

const SOURCE_FETCH_TIMEOUT_MS = 15000;
const AI_TIMEOUT_MS = 60000;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function parseClaudeText(data) {
  return data?.content
    ?.map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("")
    .trim() || "";
}

function parseUpdateResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || /^NO_CHANGES\b/i.test(trimmed)) {
    return { changed: false, raw: trimmed };
  }

  const summaryMatch = /Summary:\s*([\s\S]*?)(?:\nConfidence:|\nUpdated content:|$)/i.exec(trimmed);
  const confidenceMatch = /Confidence:\s*([0-9.]+)/i.exec(trimmed);
  const contentMatch = /Updated content:\s*([\s\S]*)/i.exec(trimmed);
  const confidence = confidenceMatch ? Number(confidenceMatch[1]) : 0;
  const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence;

  return {
    changed: /CHANGES_DETECTED/i.test(trimmed) || Boolean(contentMatch),
    summary: summaryMatch?.[1]?.trim() || "Knowledge update detected.",
    confidence: Number.isFinite(normalizedConfidence) ? normalizedConfidence : 0,
    updatedContent: contentMatch?.[1]?.trim() || "",
    raw: trimmed,
  };
}

async function callClaude(entry, sourceMaterial) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.KNOWLEDGE_UPDATE_MODEL || "claude-sonnet-4-6",
        max_tokens: 5000,
        system: "You are a Medicare compliance knowledge base editor. Return only the requested update format.",
        messages: [
          {
            role: "user",
            content: `You are a Medicare compliance knowledge base editor. Compare the existing knowledge entry below with the latest source material. If there are meaningful changes (new regulations, updated guidance, changed dates, new carriers, etc.), produce an updated version of the knowledge entry. If no changes are needed, respond with "NO_CHANGES".\n\nExisting entry:\n${truncate(entry.content, 18000)}\n\nSource material:\n${truncate(sourceMaterial, 28000)}\n\nIf changes are needed, respond with:\nCHANGES_DETECTED\nSummary: [1-2 sentence summary of what changed]\nConfidence: [0.0-1.0 how confident you are this update is correct]\n\nUpdated content:\n[the full updated entry content]`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `Anthropic request failed with HTTP ${response.status}`);
    }
    return parseUpdateResponse(parseClaudeText(data));
  } finally {
    clearTimeout(timeout);
  }
}

async function publishUpdatedEntry(supabase, entry, parsed) {
  const nextVersion = Number(entry.version || 1) + 1;

  const { error: deactivateError } = await supabase
    .from("knowledge_base")
    .update({ is_active: false })
    .eq("id", entry.id);
  if (deactivateError) throw deactivateError;

  const { data: inserted, error: insertError } = await supabase
    .from("knowledge_base")
    .insert({
      tenant_id: entry.tenant_id,
      category: entry.category,
      key: entry.key,
      title: entry.title,
      content: parsed.updatedContent,
      metadata: {
        ...(entry.metadata || {}),
        last_agentic_update_summary: parsed.summary,
      },
      version: nextVersion,
      is_active: true,
      source_urls: entry.source_urls || [],
      last_verified_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  return inserted;
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

async function processEntry(supabase, entry) {
  if (!entry.source_urls?.length) {
    return { id: entry.id, key: entry.key, result: "skipped_no_sources" };
  }

  const sourceMaterial = await fetchSourceMaterial(entry.source_urls);
  const parsed = await callClaude(entry, sourceMaterial);

  if (!parsed.changed) {
    await logKnowledgeUpdate(supabase, entry.id, {
      previousContent: entry.content,
      newContent: entry.content,
      summary: "No meaningful source changes detected.",
      changeSource: "agentic_auto",
      confidence: null,
      status: "published",
    });
    return { id: entry.id, key: entry.key, result: "no_changes" };
  }

  if (!parsed.updatedContent) {
    await logKnowledgeUpdate(supabase, entry.id, {
      previousContent: entry.content,
      newContent: parsed.raw,
      summary: parsed.summary || "Changes detected but updated content was not parseable.",
      changeSource: "agentic_auto",
      confidence: parsed.confidence,
      status: "draft",
    });
    return { id: entry.id, key: entry.key, result: "draft" };
  }

  if (parsed.confidence >= 0.85) {
    await publishUpdatedEntry(supabase, entry, parsed);
    await logKnowledgeUpdate(supabase, entry.id, {
      previousContent: entry.content,
      newContent: parsed.updatedContent,
      summary: parsed.summary,
      changeSource: "agentic_auto",
      confidence: parsed.confidence,
      status: "published",
    });
    return { id: entry.id, key: entry.key, result: "published", confidence: parsed.confidence };
  }

  const status = parsed.confidence >= 0.6 ? "pending_review" : "draft";
  await logKnowledgeUpdate(supabase, entry.id, {
    previousContent: entry.content,
    newContent: parsed.updatedContent,
    summary: parsed.summary,
    changeSource: "agentic_auto",
    confidence: parsed.confidence,
    status,
  });
  return { id: entry.id, key: entry.key, result: status, confidence: parsed.confidence };
}

async function fetchEntries(supabase, { category, key, limit }) {
  let query = supabase
    .from("knowledge_base")
    .select("id, tenant_id, category, key, title, content, metadata, version, source_urls")
    .eq("is_active", true)
    .order("updated_at", { ascending: true });

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
    .select("category, source_urls")
    .eq("is_active", true)
    .order("category", { ascending: true });

  if (error) throw error;

  return Array.from(new Set(
    (data || [])
      .filter((entry) => entry.category && entry.source_urls?.length)
      .map((entry) => entry.category)
  )).sort();
}

export async function runKnowledgeUpdate({ category = null, key = null, limit = 12 } = {}) {
  const supabase = getSupabase();
  const entries = await fetchEntries(supabase, { category, key, limit });
  const results = [];

  for (const entry of entries) {
    try {
      results.push(await processEntry(supabase, entry));
    } catch (error) {
      await logKnowledgeUpdate(supabase, entry.id, {
        previousContent: entry.content,
        newContent: null,
        summary: error?.message || "Agentic update failed.",
        changeSource: "agentic_auto",
        confidence: 0,
        status: "draft",
      }).catch(() => {});
      results.push({
        id: entry.id,
        key: entry.key,
        result: "error",
        error: error?.message || String(error),
      });
    }
  }

  return {
    checked: entries.length,
    results,
  };
}

export async function runAllKnowledgeCategoryUpdates({ limitPerCategory = 6 } = {}) {
  const categories = await listKnowledgeCategories();
  const results = [];

  for (const category of categories) {
    try {
      const result = await runKnowledgeUpdate({
        category,
        limit: limitPerCategory,
      });
      results.push({ category, ...result });
    } catch (error) {
      results.push({
        category,
        checked: 0,
        results: [],
        error: error?.message || String(error),
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
