import { fetchWithClerk } from "../lib/clerkFetch.js";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppAuth } from "../context/AuthContext";

const tenantRequests = new Map();
const TenantConfigContext = createContext(null);

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

async function getSupabaseToken(getToken, options = {}) {
  try {
    const token = await getToken({ ...options, template: "supabase" });
    if (token) return token;
  } catch {
    // Fall back to the default Clerk token for local/dev JWT setups.
  }

  try {
    return (await getToken(options)) || null;
  } catch {
    return null;
  }
}

async function getTenantBundle(getToken) {
  const token = await getSupabaseToken(getToken);
  if (!token) throw new Error("Session expired. Sign in after this call.");
  const payload = decodeJwtPayload(token);
  const cacheKey = [payload.sub, payload.org_id || payload.o?.id || ""].join(":");
  if (tenantRequests.has(cacheKey)) return tenantRequests.get(cacheKey);

  const request = (async () => {
    const [supabaseModule, pipelineModule] = await Promise.all([
      import("../lib/supabase"),
      import("../lib/postCallPipeline"),
    ]);
    const { registerClerkTokenGetter, getClerkSupabase, supabase } = supabaseModule;
    const { fetchTenantConfig } = pipelineModule;
    // Fresh-token client: re-resolves the Clerk token per request so it
    // never goes stale (Clerk tokens expire in about 60 seconds).
    registerClerkTokenGetter(options => getSupabaseToken(getToken, options));
    const client = getClerkSupabase() || supabase;
    const tenant = await fetchTenantConfig(client);
    const rosterResponse=await fetchWithClerk(getToken,'/api/deployment-roster');
    if(!rosterResponse.ok)throw Error('Deployment roster unavailable.');
    const {roster:agents}=await rosterResponse.json();

    const response = await fetchWithClerk(getToken, '/api/deployment-features');
    if (!response.ok) throw new Error('Deployment features unavailable.');
    const { features, entitlement } = await response.json();
    return { client, tenant, agents, features, entitlement };
  })();

  tenantRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    tenantRequests.delete(cacheKey);
  }
}

export function TenantConfigProvider({ children }) {
  const { getToken } = useAppAuth();
  const [state, setState] = useState({
    tenant: null,
    agents: [],
    supabaseClient: null,
    loading: true,
    error: "",
  });

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const bundle = await getTenantBundle(getToken);
      setState({
        features: bundle.features, entitlement: bundle.entitlement,
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

  const hydrateTenant = useCallback(async (tenant, agents = []) => {
    if (!tenant?.id) return;
    // Never hydrate a tenant with a null client: that renders the app
    // in a permanent loading state. Fall back to the fresh-token client.
    let client = state.supabaseClient;
    if (!client) {
      const { getClerkSupabase, supabase } = await import("../lib/supabase");
      client = getClerkSupabase() || supabase;
    }
    setState((current) => ({
      ...current,
      tenant,
      agents,
      supabaseClient: current.supabaseClient || client,
      loading: false,
      error: "",
    }));
  }, [state.supabaseClient]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const bundle = await getTenantBundle(getToken);
        if (!cancelled) {
          setState({
            features: bundle.features, entitlement: bundle.entitlement,
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

  const value = useMemo(() => ({
    features: state.features || {},
    billingEntitlement: state.entitlement || null,
    tenant: state.tenant,
    tenantId: state.tenant?.id || null,
    tenantConfig: state.tenant,
    agents: state.agents,
    carrierOptions: state.tenant?.carrier_options || [],
    coopRates: state.tenant?.coop_rates || {},
    agencyDisplayName: state.tenant?.agency_display_name || state.tenant?.name || "",
    agencyNpn: state.tenant?.agency_npn || "",
    licensedStates: state.tenant?.licensed_states || [],
    complianceConfig: state.tenant?.compliance_config || {},
    supabaseClient: state.supabaseClient,
    loading: state.loading,
    error: state.error,
    refetch: load,
    hydrateTenant,
  }), [hydrateTenant, load, state]);

  return createElement(TenantConfigContext.Provider, { value }, children);
}

export function useTenantConfig() {
  const context = useContext(TenantConfigContext);
  if (!context) {
    throw new Error("useTenantConfig must be used within <TenantConfigProvider>");
  }
  return context;
}
