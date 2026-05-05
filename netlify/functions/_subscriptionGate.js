const JSON_HEADERS = { "Content-Type": "application/json" };
const NGHS_TENANT_ID = "00000000-0000-4000-8000-000000000001";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export function subscriptionError(status, detail, extra = {}) {
  return json(status, {
    error: status === 402 ? "Subscription required" : "Subscription check failed",
    detail,
    ...extra,
  });
}

export async function resolveTenantIdForOrg(supabase, orgId) {
  if (orgId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("clerk_org_id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id;
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", NGHS_TENANT_ID)
    .maybeSingle();

  if (error) throw error;
  return data?.id || NGHS_TENANT_ID;
}

export async function requireActiveSubscription(supabase, tenantId) {
  if (!tenantId) {
    return {
      response: subscriptionError(402, "Unable to resolve tenant for this request."),
    };
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[subscription] lookup failed:", error);
    return {
      response: subscriptionError(500, "Unable to verify subscription status."),
    };
  }

  if (!data) {
    return {
      response: subscriptionError(402, "No active subscription was found for this agency.", {
        subscription_status: "missing",
      }),
    };
  }

  if (data.plan === "internal") {
    return data;
  }

  if (data.status === "active" || data.status === "trialing") {
    return data;
  }

  return {
    response: subscriptionError(402, "Your agency subscription is not active.", {
      subscription_status: data.status || "inactive",
      plan: data.plan,
    }),
  };
}

export function requirePlan(subscription, requiredPlan) {
  if (subscription?.plan === "internal") {
    return true;
  }

  const planRank = {
    starter: 1,
    pro: 2,
    trial: 2,
    internal: 99,
  };

  const currentRank = planRank[subscription?.plan] || 0;
  const requiredRank = planRank[requiredPlan] || 0;

  if (currentRank >= requiredRank) {
    return true;
  }

  return {
    response: subscriptionError(402, `${requiredPlan.toUpperCase()} plan is required for this feature.`, {
      plan: subscription?.plan || "inactive",
      required_plan: requiredPlan,
    }),
  };
}

export async function checkSeatLimit(supabase, tenantId, subscription) {
  if (subscription?.plan === "internal") {
    return true;
  }

  const { count, error } = await supabase
    .from("tenant_agents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) {
    console.error("[subscription] seat count failed:", error);
    return {
      response: subscriptionError(500, "Unable to verify seat limit."),
    };
  }

  if ((count || 0) > Number(subscription?.seat_count || 0)) {
    return {
      response: subscriptionError(402, "Seat limit exceeded.", {
        active_agents: count || 0,
        seat_count: subscription?.seat_count || 0,
      }),
    };
  }

  return true;
}

export async function logUsageRecord(supabase, tenantId, recordType, quantity = 1, metadata = {}) {
  if (!tenantId) return;

  const { error } = await supabase.from("usage_records").insert({
    tenant_id: tenantId,
    record_type: recordType,
    quantity,
    metadata,
  });

  if (error) {
    console.warn("[subscription] usage log failed:", error.message || error);
  }
}
