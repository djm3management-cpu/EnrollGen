import { useEffect, useMemo, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";

const insightCache = new Map();
const STALE_MS = 60000;

function cacheKey(tenantId, insightType, startDate, endDate) {
  return [tenantId || "none", insightType || "all", startDate || "", endDate || ""].join(":");
}

export function useCallInsights({ insightType = null, startDate = null, endDate = null } = {}) {
  const { tenantId, supabaseClient, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const [state, setState] = useState({
    insights: [],
    loading: true,
    error: "",
  });

  const key = useMemo(
    () => cacheKey(tenantId, insightType, startDate, endDate),
    [tenantId, insightType, startDate, endDate]
  );

  useEffect(() => {
    let cancelled = false;
    if (tenantLoading) return undefined;
    if (!tenantId) {
      setState({ insights: [], loading: false, error: tenantError || "Tenant unavailable." });
      return undefined;
    }

    const cached = insightCache.get(key);
    if (cached) {
      setState({ insights: cached.data, loading: Date.now() - cached.ts > STALE_MS, error: "" });
      if (Date.now() - cached.ts <= STALE_MS) return undefined;
    } else {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    async function load() {
      try {
        let query = supabaseClient
          .from("call_insights")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("computed_at", { ascending: false });

        if (insightType) query = query.eq("insight_type", insightType);
        if (startDate) query = query.gte("period_end", startDate);
        if (endDate) query = query.lte("period_end", endDate);

        const { data, error } = await query;
        if (error) throw error;
        const insights = data || [];
        insightCache.set(key, { data: insights, ts: Date.now() });
        if (!cancelled) setState({ insights, loading: false, error: "" });
      } catch (error) {
        if (!cancelled) {
          setState({ insights: cached?.data || [], loading: false, error: error.message || "Insights unavailable." });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [endDate, insightType, key, startDate, supabaseClient, tenantError, tenantId, tenantLoading]);

  return state;
}
