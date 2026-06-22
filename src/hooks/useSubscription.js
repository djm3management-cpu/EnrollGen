import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTenantConfig } from "./useTenantConfig";

const subscriptionCache = new Map();
const subscriptionRequests = new Map();
const SubscriptionContext = createContext(null);

function currentMonthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function emptyUsage() {
  return {
    deepgram_minutes: 0,
    claude_tokens: 0,
    call_completed: 0,
    compliance_score: 0,
  };
}

function summarizeUsage(rows = []) {
  const totals = emptyUsage();
  for (const row of rows) {
    if (row?.record_type in totals) {
      totals[row.record_type] += Number(row.quantity || 0);
    }
  }
  return totals;
}

export function SubscriptionProvider({ children }) {
  const { tenantId, supabaseClient, loading: tenantLoading } = useTenantConfig();
  const [state, setState] = useState({
    subscription: null,
    usage: emptyUsage(),
    loading: true,
    error: "",
  });

  const load = useCallback(async ({ background = false } = {}) => {
    if (!tenantId || tenantLoading) {
      if (!tenantLoading && !tenantId) {
        setState((current) => ({
          ...current,
          subscription: null,
          usage: emptyUsage(),
          loading: false,
        }));
      }
      return;
    }

    if (!background) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      let request = subscriptionRequests.get(tenantId);
      if (!request) {
        request = Promise.all([
          supabaseClient
            .from("subscriptions")
            .select("*")
            .eq("tenant_id", tenantId)
            .maybeSingle(),
          supabaseClient
            .from("usage_records")
            .select("record_type, quantity")
            .eq("tenant_id", tenantId)
            .gte("recorded_at", currentMonthStartIso()),
        ]);
        subscriptionRequests.set(tenantId, request);
      }
      const [subscriptionResult, usageResult] = await request.finally(() => {
        if (subscriptionRequests.get(tenantId) === request) {
          subscriptionRequests.delete(tenantId);
        }
      });

      if (subscriptionResult.error) throw subscriptionResult.error;
      if (usageResult.error) throw usageResult.error;

      const nextState = {
        subscription: subscriptionResult.data || null,
        usage: summarizeUsage(usageResult.data || []),
        loading: false,
        error: "",
      };
      subscriptionCache.set(tenantId, nextState);
      setState(nextState);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Subscription status unavailable.",
      }));
    }
  }, [supabaseClient, tenantId, tenantLoading]);

  useEffect(() => {
    if (!tenantLoading && !tenantId) {
      setState((current) => ({
        ...current,
        subscription: null,
        usage: emptyUsage(),
        loading: false,
      }));
      return undefined;
    }

    if (!tenantId || tenantLoading) {
      return undefined;
    }

    let cancelled = false;
    const cached = subscriptionCache.get(tenantId);
    if (cached) {
      setState(cached);
    }

    async function hydrate() {
      try {
        await load({ background: Boolean(cached) });
      } catch {
        if (!cancelled) {
          setState((current) => ({ ...current, loading: false }));
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [load, tenantId, tenantLoading]);

  const value = useMemo(() => {
    const subscription = state.subscription;
    const plan = subscription?.plan || null;
    const status = subscription?.status || "inactive";
    const isInternal = plan === "internal";
    const isTrial = plan === "trial" || status === "trialing";
    const isActive = isInternal || status === "active" || status === "trialing";
    const isPro = isInternal || plan === "pro" || plan === "trial";
    const isStarter = plan === "starter";

    return {
      subscription,
      usage: state.usage,
      loading: tenantLoading || state.loading,
      error: state.error,
      isActive,
      isPro,
      isStarter,
      isTrial,
      isInternal,
      refetch: () => load(),
    };
  }, [load, state, tenantLoading]);

  return createElement(SubscriptionContext.Provider, { value }, children);
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within <SubscriptionProvider>");
  }
  return context;
}
