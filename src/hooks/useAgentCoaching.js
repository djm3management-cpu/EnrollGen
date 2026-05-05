import { useEffect, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";

export function useAgentCoaching(agentName) {
  const { tenantId, supabaseClient, loading: tenantLoading } = useTenantConfig();
  const [state, setState] = useState({
    coaching: null,
    loading: false,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;
    if (tenantLoading) return undefined;
    if (!tenantId || !agentName) {
      setState({ coaching: null, loading: false, error: "" });
      return undefined;
    }

    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const { data, error } = await supabaseClient
          .from("agent_coaching")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("agent_name", agentName)
          .order("period_end", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) setState({ coaching: data || null, loading: false, error: "" });
      } catch (error) {
        if (!cancelled) {
          setState({ coaching: null, loading: false, error: error.message || "Coaching unavailable." });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [agentName, supabaseClient, tenantId, tenantLoading]);

  return state;
}
