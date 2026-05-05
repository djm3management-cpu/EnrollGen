export function slugKnowledgeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getKnowledgeStaticKey(entry) {
  return (
    entry?.metadata?.static_key ||
    entry?.metadata?.state_code ||
    entry?.title ||
    entry?.key ||
    ""
  );
}

export function getKnowledgeStructuredValue(entry) {
  const structured = entry?.metadata?.structured;
  if (structured && typeof structured === "object") return structured;

  const content = (entry?.content || "").trim();
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeKnowledgeEntries(rows = [], tenantId = null) {
  const byKey = new Map();

  for (const row of rows || []) {
    const staticKey = getKnowledgeStaticKey(row);
    const normalizedKey = slugKnowledgeKey(staticKey || row.key);
    if (!normalizedKey) continue;

    const tenantPriority = row.tenant_id && row.tenant_id === tenantId ? 2 : 1;
    const current = byKey.get(normalizedKey);
    const currentPriority = current?._tenantPriority || 0;
    const rowVersion = Number(row.version || 0);
    const currentVersion = Number(current?.version || 0);
    const rowTime = Date.parse(row.updated_at || row.created_at || "") || 0;
    const currentTime = Date.parse(current?.updated_at || current?.created_at || "") || 0;

    if (
      !current ||
      tenantPriority > currentPriority ||
      (tenantPriority === currentPriority && rowVersion > currentVersion) ||
      (
        tenantPriority === currentPriority &&
        rowVersion === currentVersion &&
        rowTime > currentTime
      )
    ) {
      byKey.set(normalizedKey, { ...row, _tenantPriority: tenantPriority });
    }
  }

  return Array.from(byKey.values()).map((row) => (
    Object.fromEntries(
      Object.entries(row).filter(([property]) => property !== "_tenantPriority")
    )
  ));
}

export function findKnowledgeEntry(entries = [], key) {
  const normalized = slugKnowledgeKey(key);
  return (entries || []).find((entry) => {
    const candidates = [
      entry.key,
      entry.title,
      entry.metadata?.static_key,
      entry.metadata?.state_code,
    ];
    return candidates.some((candidate) => slugKnowledgeKey(candidate) === normalized);
  }) || null;
}

export function mergeStructuredKnowledgeMap(fallbackMap = {}, entries = []) {
  const merged = { ...fallbackMap };

  for (const entry of entries || []) {
    const staticKey = getKnowledgeStaticKey(entry);
    const value = getKnowledgeStructuredValue(entry);
    if (!staticKey || !value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    merged[staticKey] = value;
  }

  return merged;
}

export function mergeStructuredStateMap(fallbackMap = {}, entries = []) {
  const merged = { ...fallbackMap };

  for (const entry of entries || []) {
    const code = String(entry?.metadata?.state_code || entry?.metadata?.static_key || entry?.key || "")
      .trim()
      .toUpperCase();
    const value = getKnowledgeStructuredValue(entry);
    if (!code || !value || typeof value !== "object" || Array.isArray(value)) continue;
    merged[code] = value;
  }

  return merged;
}

export function mergeStructuredList(fallbackList = [], entries = [], getKey) {
  const byKey = new Map();
  for (const item of fallbackList || []) {
    const key = slugKnowledgeKey(getKey(item));
    if (key) byKey.set(key, item);
  }

  for (const entry of entries || []) {
    const value = getKnowledgeStructuredValue(entry);
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const key = slugKnowledgeKey(getKey(value) || getKnowledgeStaticKey(entry));
    if (key) byKey.set(key, value);
  }

  return Array.from(byKey.values());
}

export function formatKnowledgeEntriesForPrompt(entries = [], {
  heading = "DATABASE KNOWLEDGE BASE CONTEXT",
  maxEntries = 12,
  maxCharsPerEntry = 1800,
} = {}) {
  const selected = (entries || []).slice(0, maxEntries);
  if (!selected.length) return "";

  return [
    "════════════════════════════════════════════════════════",
    heading,
    "════════════════════════════════════════════════════════",
    ...selected.map((entry) => [
      `## ${entry.title || entry.key}`,
      (entry.content || "").slice(0, maxCharsPerEntry),
      entry.source_urls?.length ? `Sources: ${entry.source_urls.join(", ")}` : null,
      entry.last_verified_at ? `Last verified: ${entry.last_verified_at}` : null,
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}
