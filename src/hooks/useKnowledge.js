import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";
import { findKnowledgeEntry, mergeKnowledgeEntries } from "../lib/knowledgeBase";

const knowledgeCache = new Map();

function cacheKeyFor({ tenantId, category, key }) {
  return [tenantId || "global", category || "all", key || "all"].join("::");
}

export function useKnowledge(category, key = null) {
  const { tenantId, supabaseClient, loading: tenantLoading } = useTenantConfig();
  const cacheKey = cacheKeyFor({ tenantId, category, key });
  const cached = knowledgeCache.get(cacheKey);

  const [state, setState] = useState({
    entries: cached?.entries || [],
    loading: !cached,
    error: "",
    fetchedAt: cached?.fetchedAt || null,
  });

  const load = useCallback(async ({ background = false } = {}) => {
    if (!category || tenantLoading) return;

    if (!background) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const { data, error } = await supabaseClient
        .from("knowledge_base")
        .select(
          "id, tenant_id, category, key, title, content, metadata, version, is_active, source_urls, last_verified_at, created_at, updated_at"
        )
        .eq("category", category)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;

      let entries = mergeKnowledgeEntries(data || [], tenantId);
      if (key) {
        const entry = findKnowledgeEntry(entries, key);
        entries = entry ? [entry] : [];
      }

      const next = {
        entries,
        loading: false,
        error: "",
        fetchedAt: Date.now(),
      };
      knowledgeCache.set(cacheKey, next);
      setState(next);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Knowledge base unavailable.",
      }));
    }
  }, [cacheKey, category, key, supabaseClient, tenantId, tenantLoading]);

  useEffect(() => {
    let cancelled = false;
    const cachedValue = knowledgeCache.get(cacheKey);

    if (cachedValue) {
      setState(cachedValue);
    }

    async function hydrate() {
      if (cancelled) return;
      await load({ background: Boolean(cachedValue) });
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, load]);

  const entry = key ? findKnowledgeEntry(state.entries, key) : null;

  return useMemo(() => ({
    entries: state.entries,
    entry,
    loading: state.loading || tenantLoading,
    error: state.error,
    fetchedAt: state.fetchedAt,
    refetch: () => load(),
  }), [entry, load, state.entries, state.error, state.fetchedAt, state.loading, tenantLoading]);
}
