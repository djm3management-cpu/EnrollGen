import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppAuth } from "../context/AuthContext";
import { getAuthSupabase, supabase } from "../lib/supabase";
import {
  fetchTenantAgents,
  fetchTenantConfig,
} from "../lib/postCallPipeline";

const tenantCache = new Map();

function decodeJwtPayload(token) {
  try {
    const payload = token?.split(".")?.[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

async function getSupabaseToken(getToken) {
  try {
    const token = await getToken({ template: "supabase" });
    if (token) return token;
  } catch {
    // Fall back to the default Clerk token for local/dev JWT setups.
  }

  try {
    return (await getToken()) || null;
  } catch {
    return null;
  }
}

async function getTenantBundle(getToken) {
  const token = await getSupabaseToken(getToken);
  const payload = decodeJwtPayload(token);
  const cacheKey = payload.org_id || token?.slice(-24) || "default";
  const client = token ? getAuthSupabase(token) : supabase;
  const tenant = await fetchTenantConfig(client);
  const agents = tenant?.id ? await fetchTenantAgents(client, tenant.id) : [];

  return {
    cacheKey,
    client,
    tenant,
    agents,
  };
}

export function useTenantConfig() {
  const { getToken } = useAppAuth();
  const [state, setState] = useState({
    tenant: null,
    agents: [],
    supabaseClient: supabase,
    loading: true,
    error: "",
  });

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const bundle = await getTenantBundle(getToken);
      tenantCache.set(bundle.cacheKey, bundle);
      setState({
        tenant: bundle.tenant,
        agents: bundle.agents,
        supabaseClient: bundle.client,
        loading: false,
        error: "",
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Tenant configuration unavailable.",
      }));
    }
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const cached = tenantCache.get("default") || Array.from(tenantCache.values())[0];
      if (cached && !cancelled) {
        setState({
          tenant: cached.tenant,
          agents: cached.agents,
          supabaseClient: cached.client,
          loading: false,
          error: "",
        });
      }

      try {
        const bundle = await getTenantBundle(getToken);
        tenantCache.set(bundle.cacheKey, bundle);
        if (!cancelled) {
          setState({
            tenant: bundle.tenant,
            agents: bundle.agents,
            supabaseClient: bundle.client,
            loading: false,
            error: "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error?.message || "Tenant configuration unavailable.",
          }));
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return useMemo(() => ({
    tenant: state.tenant,
    tenantId: state.tenant?.id || null,
    tenantConfig: state.tenant,
    agents: state.agents,
    carrierOptions: state.tenant?.carrier_options || [],
    coopRates: state.tenant?.coop_rates || {},
    agencyDisplayName: state.tenant?.agency_display_name || state.tenant?.name || "",
    supabaseClient: state.supabaseClient,
    loading: state.loading,
    error: state.error,
    refetch: () => load(),
  }), [load, state]);
}
